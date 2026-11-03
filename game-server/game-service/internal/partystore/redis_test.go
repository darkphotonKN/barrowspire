package partystore_test

import (
	"context"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partystore"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/testutil"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-NCC9J §Requirements 1–3, 12–15. A party's state in Redis, every mutation one Lua script
// that makes the final check and write, or returns a refusal instead.

var sentAt = time.Date(2026, 10, 31, 9, 30, 15, 0, time.UTC)

func joiner(name string) partystore.Joiner {
	return partystore.Joiner{PlayerID: uuid.New(), Name: name, Class: "warrior"}
}

// inviteArgs is an invite from inviter to target at size, sent at at, with fresh ids.
func inviteArgs(inviter, target partystore.Joiner, size int, at time.Time) partystore.InviteArgs {
	return partystore.InviteArgs{
		NewPartyID: uuid.New(),
		Inviter:    inviter,
		InviteID:   uuid.New(),
		TargetID:   target.PlayerID,
		TargetName: target.Name,
		Size:       size,
		Now:        at,
	}
}

// An open invite holds a place: at size 2 the leader and one open invite fill the party, so a
// second invite is refused party_full (R3).
func TestInvite_OpenInviteHoldsAPlace_SecondRefusedFull(t *testing.T) {
	client, _ := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	wren, kaelen, idris := joiner("Wren"), joiner("Kaelen"), joiner("Idris")

	first, err := store.Invite(context.Background(), inviteArgs(wren, kaelen, 2, sentAt))
	require.NoError(t, err)
	require.Empty(t, first.Refusal)

	second, err := store.Invite(context.Background(), inviteArgs(wren, idris, 2, sentAt.Add(time.Second)))
	require.NoError(t, err)
	assert.Equal(t, partystore.RefusalPartyFull, second.Refusal)
}

// The first invite of a player in no party creates it: they lead it alone, the invite holds the
// second place, open for sixty seconds, and both the leader's pointer and the party carry the
// party's TTL (R1, R3, R12; I-NCC9J-1 D5).
func TestInvite_FirstInviteCreatesTheParty(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	wren, kaelen := joiner("Wren"), joiner("Kaelen")
	args := inviteArgs(wren, kaelen, 2, sentAt)

	res, err := store.Invite(context.Background(), args)
	require.NoError(t, err)

	assert.True(t, res.Formed, "the invite created the party")
	assert.Equal(t, args.NewPartyID, res.Party.ID)
	assert.Equal(t, wren.PlayerID, res.Party.Leader)
	assert.Equal(t, sentAt, res.Party.CreatedAt)
	assert.Equal(t, []partystore.Member{{PlayerID: wren.PlayerID, Name: "Wren", Class: "warrior", JoinedAt: sentAt, SeenAt: sentAt}}, res.Party.Members)
	assert.Equal(t, []partystore.Reservation{{InviteID: args.InviteID, TargetID: kaelen.PlayerID, TargetName: "Kaelen", ExpiresAt: sentAt.Add(time.Minute)}}, res.Party.Reserved)

	pointer := "{party}:pl:" + wren.PlayerID.String()
	assert.Equal(t, args.NewPartyID.String(), mustGet(t, mini, pointer))
	assert.Equal(t, 5*time.Minute, mini.TTL(pointer))
	assert.Equal(t, 5*time.Minute, mini.TTL("{party}:p:"+args.NewPartyID.String()))
}

func mustGet(t *testing.T, mini interface{ Get(string) (string, error) }, key string) string {
	t.Helper()
	v, err := mini.Get(key)
	require.NoError(t, err, key)
	return v
}

// A leader's second invite goes into the same party, behind the first (R3).
func TestInvite_SecondInviteJoinsTheSameParty(t *testing.T) {
	client, _ := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	wren, kaelen, idris := joiner("Wren"), joiner("Kaelen"), joiner("Idris")
	first, err := store.Invite(context.Background(), inviteArgs(wren, kaelen, 3, sentAt))
	require.NoError(t, err)

	second, err := store.Invite(context.Background(), inviteArgs(wren, idris, 3, sentAt.Add(time.Second)))
	require.NoError(t, err)

	require.Empty(t, second.Refusal)
	assert.False(t, second.Formed)
	assert.Equal(t, first.Party.ID, second.Party.ID)
	require.Len(t, second.Party.Reserved, 2)
	assert.Equal(t, "Kaelen", second.Party.Reserved[0].TargetName, "oldest first")
	assert.Equal(t, "Idris", second.Party.Reserved[1].TargetName)
}

// Every refusal the invite script's final check can return, and that a refusal writes nothing:
// no party for an inviter who had none (R2, R10).
func TestInvite_FinalCheckRefusals(t *testing.T) {
	tests := []struct {
		name string
		size int
		// arrange returns the inviter and the target the refused invite names
		arrange func(t *testing.T, store *partystore.Redis) (inviter, target partystore.Joiner)
		want    partystore.Refusal
	}{
		{
			name: "party full at size 2 with one open invite",
			size: 2,
			arrange: func(t *testing.T, store *partystore.Redis) (partystore.Joiner, partystore.Joiner) {
				wren := joiner("Wren")
				invite(t, store, wren, joiner("Kaelen"), 2, sentAt)
				return wren, joiner("Idris")
			},
			want: partystore.RefusalPartyFull,
		},
		{
			name: "target leads a party of their own",
			size: 3,
			arrange: func(t *testing.T, store *partystore.Redis) (partystore.Joiner, partystore.Joiner) {
				kaelen := joiner("Kaelen")
				invite(t, store, kaelen, joiner("Idris"), 3, sentAt)
				return joiner("Wren"), kaelen
			},
			want: partystore.RefusalAlreadyInParty,
		},
		{
			name: "an invite to the target is still open",
			size: 3,
			arrange: func(t *testing.T, store *partystore.Redis) (partystore.Joiner, partystore.Joiner) {
				wren, kaelen := joiner("Wren"), joiner("Kaelen")
				invite(t, store, wren, kaelen, 3, sentAt)
				return wren, kaelen
			},
			want: partystore.RefusalPending,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client, _ := testutil.NewRedis(t)
			store := partystore.NewRedis(client)
			inviter, target := tt.arrange(t, store)

			res, err := store.Invite(context.Background(), inviteArgs(inviter, target, tt.size, sentAt.Add(time.Second)))

			require.NoError(t, err)
			assert.Equal(t, tt.want, res.Refusal)
		})
	}
}

// A refused invite from a player in no party leaves no party behind.
func TestInvite_RefusedLeavesNoParty(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	kaelen := joiner("Kaelen")
	invite(t, store, kaelen, joiner("Idris"), 3, sentAt)
	wren := joiner("Wren")

	res, err := store.Invite(context.Background(), inviteArgs(wren, kaelen, 3, sentAt))
	require.NoError(t, err)

	require.Equal(t, partystore.RefusalAlreadyInParty, res.Refusal)
	assert.False(t, mini.Exists("{party}:pl:"+wren.PlayerID.String()), "Wren leads nothing")
}

// invite has inviter invite target and requires it written.
func invite(t *testing.T, store *partystore.Redis, inviter, target partystore.Joiner, size int, at time.Time) partystore.InviteArgs {
	t.Helper()
	args := inviteArgs(inviter, target, size, at)
	res, err := store.Invite(context.Background(), args)
	require.NoError(t, err)
	require.Empty(t, res.Refusal)
	return args
}

// An invite's slot frees when its minute is up: at size 2 the leader may invite again at
// exactly sixty seconds (R3, R12).
func TestInvite_ExpiredInviteFreesItsPlace(t *testing.T) {
	client, _ := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	wren := joiner("Wren")
	invite(t, store, wren, joiner("Kaelen"), 2, sentAt)

	res, err := store.Invite(context.Background(), inviteArgs(wren, joiner("Idris"), 2, sentAt.Add(time.Minute)))
	require.NoError(t, err)

	require.Empty(t, res.Refusal)
	require.Len(t, res.Party.Reserved, 1)
	assert.Equal(t, "Idris", res.Party.Reserved[0].TargetName, "Kaelen's lapsed invite is no longer reserved")
}

func accept(t *testing.T, store *partystore.Redis, inv partystore.InviteArgs, accepter partystore.Joiner, at time.Time) partystore.AcceptResult {
	t.Helper()
	res, err := store.Accept(context.Background(), partystore.AcceptArgs{InviteID: inv.InviteID, Accepter: accepter, Now: at})
	require.NoError(t, err)
	return res
}

// Accepting turns the reservation into a membership in one step: the accepter joins in join
// order, points at the party, and the slot is no longer reserved (R3, R14).
func TestAccept_ReservationBecomesMembership(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	wren, kaelen := joiner("Wren"), joiner("Kaelen")
	inv := invite(t, store, wren, kaelen, 2, sentAt)

	res := accept(t, store, inv, kaelen, sentAt.Add(10*time.Second))

	require.Empty(t, res.Refusal)
	assert.Equal(t, wren.PlayerID, res.Party.Leader)
	require.Len(t, res.Party.Members, 2)
	assert.Equal(t, partystore.Member{PlayerID: kaelen.PlayerID, Name: "Kaelen", Class: "warrior", JoinedAt: sentAt.Add(10 * time.Second), SeenAt: sentAt.Add(10 * time.Second)}, res.Party.Members[1])
	assert.Empty(t, res.Party.Reserved)
	pointer := "{party}:pl:" + kaelen.PlayerID.String()
	assert.Equal(t, inv.NewPartyID.String(), mustGet(t, mini, pointer))
	assert.Equal(t, 5*time.Minute, mini.TTL(pointer))
}

// Two accepts of one invite: the first spends it, the second finds nothing (Edge States
// "Concurrent accepts").
func TestAccept_SameInviteTwice_SecondFindsNothing(t *testing.T) {
	client, _ := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	wren, kaelen := joiner("Wren"), joiner("Kaelen")
	inv := invite(t, store, wren, kaelen, 2, sentAt)
	accept(t, store, inv, kaelen, sentAt.Add(time.Second))

	again := accept(t, store, inv, kaelen, sentAt.Add(2*time.Second))

	assert.Equal(t, partystore.RefusalNoInvite, again.Refusal)
}

// An accept at or after the invite's minute is refused expired, and the slot is free again (R12).
func TestAccept_AfterTheMinute_ExpiredAndTheSlotFree(t *testing.T) {
	client, _ := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	wren, kaelen := joiner("Wren"), joiner("Kaelen")
	inv := invite(t, store, wren, kaelen, 2, sentAt)

	late := accept(t, store, inv, kaelen, sentAt.Add(time.Minute))

	assert.Equal(t, partystore.RefusalExpired, late.Refusal)
	invite(t, store, wren, joiner("Idris"), 2, sentAt.Add(time.Minute))
}

// An accept answers only to the invite's own target (Edge States "Unauthorized").
func TestAccept_SomeoneElse_FindsNothing(t *testing.T) {
	client, _ := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	wren, kaelen := joiner("Wren"), joiner("Kaelen")
	inv := invite(t, store, wren, kaelen, 2, sentAt)

	res := accept(t, store, inv, joiner("Idris"), sentAt.Add(time.Second))

	assert.Equal(t, partystore.RefusalNoInvite, res.Refusal)
	accept(t, store, inv, kaelen, sentAt.Add(2*time.Second)) // still Kaelen's
}

// An accepter who leads a party of their own meanwhile is refused already_in_party, and the
// invite stays open for when they can (R14).
func TestAccept_AccepterInAParty_RefusedInviteStays(t *testing.T) {
	client, _ := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	wren, kaelen := joiner("Wren"), joiner("Kaelen")
	inv := invite(t, store, wren, kaelen, 2, sentAt)
	invite(t, store, kaelen, joiner("Idris"), 2, sentAt)

	res := accept(t, store, inv, kaelen, sentAt.Add(time.Second))

	assert.Equal(t, partystore.RefusalAlreadyInParty, res.Refusal)
	full, err := store.Invite(context.Background(), inviteArgs(wren, joiner("Ori"), 2, sentAt.Add(time.Second)))
	require.NoError(t, err)
	assert.Equal(t, partystore.RefusalPartyFull, full.Refusal, "Kaelen's slot is still held")
}

// An accept of an invite whose party has ended is refused party_gone (R14).
func TestAccept_PartyEnded_PartyGone(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	wren, kaelen := joiner("Wren"), joiner("Kaelen")
	inv := invite(t, store, wren, kaelen, 2, sentAt)
	mini.Del("{party}:p:" + inv.NewPartyID.String())

	res := accept(t, store, inv, kaelen, sentAt.Add(time.Second))

	assert.Equal(t, partystore.RefusalPartyGone, res.Refusal)
}

// Accepting voids the accepter's other open invites, freeing those parties' slots, and says
// whose they were so their leaders can be told (R14; FS-R82NV R17).
func TestAccept_VoidsTheAcceptersOtherInvites(t *testing.T) {
	client, _ := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	wren, idris, kaelen := joiner("Wren"), joiner("Idris"), joiner("Kaelen")
	fromWren := invite(t, store, wren, kaelen, 2, sentAt)
	fromIdris := invite(t, store, idris, kaelen, 2, sentAt)

	res := accept(t, store, fromWren, kaelen, sentAt.Add(time.Second))

	require.Empty(t, res.Refusal)
	require.Len(t, res.Voided, 1)
	voided := res.Voided[0]
	assert.Equal(t, fromIdris.InviteID, voided.InviteID)
	assert.Equal(t, fromIdris.NewPartyID, voided.PartyID)
	assert.Equal(t, idris.PlayerID, voided.LeaderID)
	assert.Equal(t, "Kaelen", voided.TargetName)
	assert.Equal(t, kaelen.PlayerID, voided.TargetID)
	assert.Equal(t, fromIdris.NewPartyID, voided.Party.ID, "the voided invite's party as it now stands, for its members' update (R21)")
	assert.Empty(t, voided.Party.Reserved)
	assert.Equal(t, partystore.RefusalNoInvite, accept(t, store, fromIdris, kaelen, sentAt.Add(2*time.Second)).Refusal)
	invite(t, store, idris, joiner("Ori"), 2, sentAt.Add(2*time.Second)) // Idris's slot is free
}

// A member who does not lead is refused not_leader by the invite script (R9).
func TestInvite_MemberNotLeader_Refused(t *testing.T) {
	client, _ := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	wren, kaelen := joiner("Wren"), joiner("Kaelen")
	accept(t, store, invite(t, store, wren, kaelen, 3, sentAt), kaelen, sentAt)

	res, err := store.Invite(context.Background(), inviteArgs(kaelen, joiner("Idris"), 3, sentAt))
	require.NoError(t, err)

	assert.Equal(t, partystore.RefusalNotLeader, res.Refusal)
}

func decline(t *testing.T, store *partystore.Redis, inv partystore.InviteArgs, decliner uuid.UUID, at time.Time) partystore.DeclineResult {
	t.Helper()
	res, err := store.Decline(context.Background(), partystore.DeclineArgs{InviteID: inv.InviteID, DeclinerID: decliner, Now: at})
	require.NoError(t, err)
	return res
}

// A decline spends the invite and frees its slot, and says whose party it was and who leads it
// now, so the leader can be told by name (R13).
func TestDecline_FreesTheSlotAndNamesTheLeader(t *testing.T) {
	client, _ := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	wren, kaelen := joiner("Wren"), joiner("Kaelen")
	inv := invite(t, store, wren, kaelen, 2, sentAt)

	res := decline(t, store, inv, kaelen.PlayerID, sentAt.Add(time.Second))

	require.Empty(t, res.Refusal)
	assert.Equal(t, wren.PlayerID, res.Party.Leader)
	assert.Empty(t, res.Party.Reserved)
	assert.Equal(t, "Kaelen", res.TargetName)
	assert.Equal(t, partystore.RefusalNoInvite, accept(t, store, inv, kaelen, sentAt.Add(2*time.Second)).Refusal)
	invite(t, store, wren, joiner("Idris"), 2, sentAt.Add(2*time.Second)) // the slot is free
}

// A decline of an unknown, someone else's or expired invite is ignored (R13; Edge States
// "Unauthorized").
func TestDecline_IgnoredUnlessOpenAndTheirs(t *testing.T) {
	client, _ := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	wren, kaelen := joiner("Wren"), joiner("Kaelen")
	inv := invite(t, store, wren, kaelen, 2, sentAt)

	assert.Equal(t, partystore.RefusalNoInvite, decline(t, store, inv, uuid.New(), sentAt.Add(time.Second)).Refusal, "someone else's")
	assert.Equal(t, partystore.RefusalNoInvite, decline(t, store, inv, kaelen.PlayerID, sentAt.Add(time.Minute)).Refusal, "expired")
	unknown := inviteArgs(wren, kaelen, 2, sentAt)
	assert.Equal(t, partystore.RefusalNoInvite, decline(t, store, unknown, kaelen.PlayerID, sentAt).Refusal, "unknown")
}

// Withdrawing an invite that never reached its target ends the party it created, if nothing else
// has joined or been invited since: an invite nobody saw forms no party (I-NCC9J-1 D6).
func TestWithdraw_PartyTheInviteCreated_Ends(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	wren, kaelen := joiner("Wren"), joiner("Kaelen")
	inv := invite(t, store, wren, kaelen, 2, sentAt)

	res, err := store.Withdraw(context.Background(), inv.InviteID, true, sentAt)
	require.NoError(t, err)

	assert.True(t, res.Ended)
	assert.False(t, mini.Exists("{party}:p:"+inv.NewPartyID.String()))
	assert.False(t, mini.Exists("{party}:pl:"+wren.PlayerID.String()))
}

// Withdrawing from a party that has more to it only frees the slot.
func TestWithdraw_PartyWithMore_OnlyFreesTheSlot(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	wren, kaelen, idris := joiner("Wren"), joiner("Kaelen"), joiner("Idris")
	first := invite(t, store, wren, kaelen, 3, sentAt)
	second := invite(t, store, wren, idris, 3, sentAt)

	res, err := store.Withdraw(context.Background(), second.InviteID, true, sentAt)
	require.NoError(t, err)

	assert.False(t, res.Ended)
	assert.Equal(t, first.NewPartyID, res.Party.ID, "the party as it now stands")
	require.Len(t, res.Party.Reserved, 1, "only Kaelen's slot is left")
	assert.True(t, mini.Exists("{party}:p:"+first.NewPartyID.String()))
	accept(t, store, first, kaelen, sentAt.Add(time.Second))
}

// Creating makes the player the leader of a party of one; a player already in a party is
// refused already_in_party (R15; FS-R82NV R4a).
func TestCreate_PartyOfOne(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	wren := joiner("Wren")
	partyID := uuid.New()

	res, err := store.Create(context.Background(), partyID, wren, sentAt)
	require.NoError(t, err)

	require.Empty(t, res.Refusal)
	assert.Equal(t, partystore.Party{
		ID: partyID, Leader: wren.PlayerID, CreatedAt: sentAt, Version: 1,
		Members: []partystore.Member{{PlayerID: wren.PlayerID, Name: "Wren", Class: "warrior", JoinedAt: sentAt, SeenAt: sentAt}},
	}, res.Party)
	assert.Equal(t, 5*time.Minute, mini.TTL("{party}:pl:"+wren.PlayerID.String()))

	again, err := store.Create(context.Background(), uuid.New(), wren, sentAt)
	require.NoError(t, err)
	assert.Equal(t, partystore.RefusalAlreadyInParty, again.Refusal)
}

// Reading a party by a member, as a pod does when that member is seated on it, returns the party
// as it stands, open invites past their minute left out, and puts it back on its TTL (R6;
// I-NCC9J-1 D5).
func TestPartyOf_ReadsAndKeepsAlive(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	wren, kaelen, idris := joiner("Wren"), joiner("Kaelen"), joiner("Idris")
	inv := invite(t, store, wren, kaelen, 3, sentAt)
	accept(t, store, inv, kaelen, sentAt)
	invite(t, store, wren, idris, 3, sentAt)
	mini.FastForward(4 * time.Minute)

	read, err := store.PartyOf(context.Background(), kaelen.PlayerID, sentAt.Add(time.Minute))
	require.NoError(t, err)
	p := read.Party

	require.True(t, read.In)
	assert.Equal(t, inv.NewPartyID, p.ID)
	assert.Len(t, p.Members, 2)
	assert.Empty(t, p.Reserved, "Idris's invite lapsed at the minute")
	assert.Equal(t, 5*time.Minute, mini.TTL("{party}:p:"+inv.NewPartyID.String()))
	assert.Equal(t, 5*time.Minute, mini.TTL("{party}:pl:"+wren.PlayerID.String()))

	none, err := store.PartyOf(context.Background(), idris.PlayerID, sentAt)
	require.NoError(t, err)
	assert.False(t, none.In, "Idris is in no party")
}

// Refreshing reads every party asked for in one trip and keeps each alive; a party that has
// ended is reported gone (R4; code review 2026-11-01).
func TestRefreshAll_ReadsEachAndReportsTheGone(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	first := invite(t, store, joiner("Wren"), joiner("Kaelen"), 2, sentAt)
	second := invite(t, store, joiner("Idris"), joiner("Ori"), 2, sentAt)
	ended := uuid.New()
	mini.FastForward(90 * time.Second)

	refreshed, err := store.RefreshAll(context.Background(), []uuid.UUID{first.NewPartyID, ended, second.NewPartyID}, nil, sentAt)
	require.NoError(t, err)
	parties, gone := refreshed.Parties, refreshed.Gone

	require.Len(t, parties, 2)
	assert.Equal(t, first.NewPartyID, parties[0].ID)
	assert.Len(t, parties[0].Reserved, 1)
	assert.Equal(t, second.NewPartyID, parties[1].ID)
	assert.Equal(t, []uuid.UUID{ended}, gone)
	assert.Equal(t, 5*time.Minute, mini.TTL("{party}:p:"+first.NewPartyID.String()))
	assert.Equal(t, 5*time.Minute, mini.TTL("{party}:p:"+second.NewPartyID.String()))
}

// An invite whose record lapsed in Redis while the caller's clock says it is still open is not
// read back as a reserved slot, and frees its place (code review 2026-11-01).
func TestInvite_LapsedInviteRecord_FreesItsPlace(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	wren := joiner("Wren")
	invite(t, store, wren, joiner("Kaelen"), 2, sentAt)
	mini.FastForward(3 * time.Minute)

	invite(t, store, wren, joiner("Idris"), 2, sentAt) // the caller's clock still at sentAt
}

// The same, read back by a refresh.
func TestRefreshAll_LapsedInviteRecord_NotReserved(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	wren := joiner("Wren")
	inv := invite(t, store, wren, joiner("Kaelen"), 2, sentAt)
	mini.FastForward(3 * time.Minute)

	refreshed, err := store.RefreshAll(context.Background(), []uuid.UUID{inv.NewPartyID}, nil, sentAt)
	require.NoError(t, err)
	parties := refreshed.Parties

	require.Len(t, parties, 1)
	assert.Empty(t, parties[0].Reserved)
	invite(t, store, wren, joiner("Idris"), 2, sentAt) // the place is free
}

// partyOf3 is Wren leading Kaelen then Idris, joined in that order.
func partyOf3(t *testing.T, store *partystore.Redis) (partyID uuid.UUID, wren, kaelen, idris partystore.Joiner) {
	t.Helper()
	wren, kaelen, idris = joiner("Wren"), joiner("Kaelen"), joiner("Idris")
	toKaelen := invite(t, store, wren, kaelen, 3, sentAt)
	accept(t, store, toKaelen, kaelen, sentAt.Add(time.Second))
	toIdris := invite(t, store, wren, idris, 3, sentAt.Add(2*time.Second))
	accept(t, store, toIdris, idris, sentAt.Add(3*time.Second))
	return toKaelen.NewPartyID, wren, kaelen, idris
}

// A leader who leaves is succeeded by the earliest-joined member who remains; their pointer goes
// (FS-NCC9J R16; FS-R82NV R20, R22).
func TestRemove_LeaderLeaves_EarliestJoinedLeads(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	partyID, wren, kaelen, _ := partyOf3(t, store)

	res, err := store.Remove(context.Background(), partystore.RemoveArgs{PartyID: partyID, PlayerID: wren.PlayerID})
	require.NoError(t, err)

	require.Empty(t, res.Refusal)
	assert.True(t, res.Succeeded)
	assert.False(t, res.Ended)
	assert.Equal(t, kaelen.PlayerID, res.Party.Leader)
	assert.Len(t, res.Party.Members, 2)
	assert.False(t, mini.Exists("{party}:pl:"+wren.PlayerID.String()))
}

// The last member leaving ends the party: every key goes (FS-R82NV R5).
func TestRemove_LastMember_EndsTheParty(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	wren := joiner("Wren")
	created, err := store.Create(context.Background(), uuid.New(), wren, sentAt)
	require.NoError(t, err)

	res, err := store.Remove(context.Background(), partystore.RemoveArgs{PartyID: created.Party.ID, PlayerID: wren.PlayerID})
	require.NoError(t, err)

	assert.True(t, res.Ended)
	assert.False(t, mini.Exists("{party}:p:"+created.Party.ID.String()))
	assert.False(t, mini.Exists("{party}:pl:"+wren.PlayerID.String()))
}

// A kick is the leader's: anyone else is refused not_leader, a non-member not_member, and of a
// kick and a leave of one member the second finds them gone (Edge States "Concurrent kick and
// leave").
func TestRemove_Refusals(t *testing.T) {
	client, _ := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	partyID, wren, kaelen, idris := partyOf3(t, store)

	byMember, err := store.Remove(context.Background(), partystore.RemoveArgs{PartyID: partyID, PlayerID: idris.PlayerID, Kicker: kaelen.PlayerID})
	require.NoError(t, err)
	assert.Equal(t, partystore.RefusalNotLeader, byMember.Refusal)

	kicked, err := store.Remove(context.Background(), partystore.RemoveArgs{PartyID: partyID, PlayerID: idris.PlayerID, Kicker: wren.PlayerID})
	require.NoError(t, err)
	require.Empty(t, kicked.Refusal)

	left, err := store.Remove(context.Background(), partystore.RemoveArgs{PartyID: partyID, PlayerID: idris.PlayerID})
	require.NoError(t, err)
	assert.Equal(t, partystore.RefusalNotMember, left.Refusal)
}

// A transfer hands the lead to a member; only the leader may, and only to a member (FS-R82NV R19).
func TestTransfer(t *testing.T) {
	client, _ := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	partyID, wren, kaelen, idris := partyOf3(t, store)

	refused, err := store.Transfer(context.Background(), partyID, kaelen.PlayerID, idris.PlayerID)
	require.NoError(t, err)
	assert.Equal(t, partystore.RefusalNotLeader, refused.Refusal)

	stranger, err := store.Transfer(context.Background(), partyID, wren.PlayerID, uuid.New())
	require.NoError(t, err)
	assert.Equal(t, partystore.RefusalNotMember, stranger.Refusal)

	res, err := store.Transfer(context.Background(), partyID, wren.PlayerID, idris.PlayerID)
	require.NoError(t, err)
	require.Empty(t, res.Refusal)
	assert.Equal(t, idris.PlayerID, res.Party.Leader)
}

// Many invites racing for one party's free places, as from different pods: exactly as many are
// written as there are places, never more (R2, R3; user story 23).
func TestInvite_Racing_NeverOverfills(t *testing.T) {
	client, _ := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	wren := joiner("Wren")
	created, err := store.Create(context.Background(), uuid.New(), wren, sentAt)
	require.NoError(t, err)
	require.Empty(t, created.Refusal)

	const racers = 12
	written := make(chan bool, racers)
	for i := 0; i < racers; i++ {
		go func() {
			res, err := store.Invite(context.Background(), inviteArgs(wren, joiner("Racer"), 4, sentAt))
			written <- err == nil && res.Refusal == ""
		}()
	}
	n := 0
	for i := 0; i < racers; i++ {
		if <-written {
			n++
		}
	}

	assert.Equal(t, 3, n, "size 4: the leader and three reserved places")
}

// Every change a script writes moves the party's version on by one, and every read carries it, so
// a pod can tell an older party from a newer one whatever order letters arrive in (code review
// 2026-11-01, I-NCC9J-3 HIGH).
func TestVersion_EveryChangeMovesItOn(t *testing.T) {
	client, _ := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	wren, kaelen, idris := joiner("Wren"), joiner("Kaelen"), joiner("Idris")
	ctx := context.Background()

	created, err := store.Create(ctx, uuid.New(), wren, sentAt)
	require.NoError(t, err)
	assert.EqualValues(t, 1, created.Party.Version, "create")
	partyID := created.Party.ID

	toKaelen := inviteArgs(wren, kaelen, 3, sentAt)
	invited, err := store.Invite(ctx, toKaelen)
	require.NoError(t, err)
	assert.EqualValues(t, 2, invited.Party.Version, "invite")

	accepted := accept(t, store, toKaelen, kaelen, sentAt)
	assert.EqualValues(t, 3, accepted.Party.Version, "accept")

	toIdris := invite(t, store, wren, idris, 3, sentAt)
	declined := decline(t, store, toIdris, idris.PlayerID, sentAt)
	assert.EqualValues(t, 5, declined.Party.Version, "invite, then decline")

	transferred, err := store.Transfer(ctx, partyID, wren.PlayerID, kaelen.PlayerID)
	require.NoError(t, err)
	assert.EqualValues(t, 6, transferred.Party.Version, "transfer")

	removed, err := store.Remove(ctx, partystore.RemoveArgs{PartyID: partyID, PlayerID: wren.PlayerID})
	require.NoError(t, err)
	assert.EqualValues(t, 7, removed.Party.Version, "remove")

	read, err := store.PartyOf(ctx, kaelen.PlayerID, sentAt)
	require.NoError(t, err)
	assert.EqualValues(t, 7, read.Party.Version, "a read that changes no record does not move it")
}

// An accept moves on the version of each party whose invite it voided, so that party's members
// take the update without its slot (I-NCC9J-3 HIGH).
func TestVersion_VoidedPartyMovesOn(t *testing.T) {
	client, _ := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	wren, idris, kaelen := joiner("Wren"), joiner("Idris"), joiner("Kaelen")
	fromWren := invite(t, store, wren, kaelen, 2, sentAt)
	fromIdris, err := store.Invite(context.Background(), inviteArgs(idris, kaelen, 2, sentAt))
	require.NoError(t, err)

	res := accept(t, store, fromWren, kaelen, sentAt)

	require.Len(t, res.Voided, 1)
	assert.Greater(t, res.Voided[0].Party.Version, fromIdris.Party.Version)
}

// A member's record never moves backwards: a refresh from a pod whose call landed late (they have
// moved on to another pod since) leaves the newer time standing (FS-NCC9J R17).
func TestRefreshAll_LateRefresh_RecordKeepsTheNewerTime(t *testing.T) {
	client, _ := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	wren, kaelen := joiner("Wren"), joiner("Kaelen")
	inv := invite(t, store, wren, kaelen, 2, sentAt)
	accept(t, store, inv, kaelen, sentAt)
	seated := []uuid.UUID{wren.PlayerID, kaelen.PlayerID}
	_, err := store.RefreshAll(context.Background(), []uuid.UUID{inv.NewPartyID}, seated, sentAt.Add(time.Minute))
	require.NoError(t, err)

	late, err := store.RefreshAll(context.Background(), []uuid.UUID{inv.NewPartyID}, seated, sentAt.Add(20*time.Second))
	require.NoError(t, err)

	require.Len(t, late.Parties, 1)
	for _, m := range late.Parties[0].Members {
		assert.Equal(t, sentAt.Add(time.Minute), m.SeenAt, m.Name)
	}
}

// A member seated again only after their record expired is out: the read that seats them removes
// them, says they are in no party, and reports the removal so the rest can be told (FS-NCC9J R17).
func TestPartyOf_SeatedAfterTheRecordExpired_RemovedAndNotIn(t *testing.T) {
	client, _ := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	wren, kaelen := joiner("Wren"), joiner("Kaelen")
	inv := invite(t, store, wren, kaelen, 2, sentAt)
	accept(t, store, inv, kaelen, sentAt)
	later := sentAt.Add(partystore.RecordTTL)
	_, err := store.RefreshAll(context.Background(), []uuid.UUID{inv.NewPartyID}, []uuid.UUID{wren.PlayerID}, later.Add(-time.Second))
	require.NoError(t, err)

	read, err := store.PartyOf(context.Background(), kaelen.PlayerID, later)
	require.NoError(t, err)

	assert.False(t, read.In, "Kaelen went five minutes unseen")
	assert.Equal(t, []uuid.UUID{kaelen.PlayerID}, read.Swept.Removed)
	require.Len(t, read.Party.Members, 1)
	assert.Equal(t, wren.PlayerID, read.Party.Members[0].PlayerID, "the party stands for Wren")
}

// A member's record, kept by refreshes from the pod seating the others (FS-NCC9J R17): Wren leads
// Kaelen then Idris, joined at sentAt+0..3 s; only Idris's pod keeps refreshing, and Wren and
// Kaelen are read at each age.
func TestRefreshAll_MemberRecords(t *testing.T) {
	tests := []struct {
		name string
		// how long after sentAt the refresh runs; Idris alone is seated
		after       time.Duration
		wantAway    []string
		wantRemoved []string
		wantLeader  string
	}{
		{"short of AwayAfter: nobody away", partystore.AwayAfter - time.Second, nil, nil, "Wren"},
		{"AwayAfter unrefreshed: away", partystore.AwayAfter + time.Second, []string{"Wren", "Kaelen"}, nil, "Wren"},
		{"five minutes for Wren, not yet for Kaelen: Wren removed, Kaelen leads", partystore.RecordTTL, []string{"Kaelen"}, []string{"Wren"}, "Kaelen"},
		{"five minutes: removed, the earliest-joined left leads", partystore.RecordTTL + time.Second, nil, []string{"Wren", "Kaelen"}, "Idris"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client, _ := testutil.NewRedis(t)
			store := partystore.NewRedis(client)
			partyID, wren, kaelen, idris := partyOf3(t, store)
			names := map[uuid.UUID]string{wren.PlayerID: "Wren", kaelen.PlayerID: "Kaelen", idris.PlayerID: "Idris"}

			res, err := store.RefreshAll(context.Background(), []uuid.UUID{partyID}, []uuid.UUID{idris.PlayerID}, sentAt.Add(tt.after))
			require.NoError(t, err)

			require.Len(t, res.Parties, 1)
			p := res.Parties[0]
			var away []string
			for _, m := range p.Members {
				if m.Away {
					away = append(away, m.Name)
				}
			}
			var removed []string
			for _, id := range res.Swept[partyID].Removed {
				removed = append(removed, names[id])
			}
			assert.Equal(t, tt.wantAway, away, "away")
			assert.Equal(t, tt.wantRemoved, removed, "removed")
			assert.Equal(t, tt.wantLeader, names[p.Leader], "leader")
			assert.Equal(t, tt.wantLeader != "Wren", res.Swept[partyID].Succeeded, "succeeded")
		})
	}
}

// A member refreshed again after showing away is back, and the party moves on a version for it
// (FS-NCC9J R17, R21).
func TestRefreshAll_AwayMemberRefreshed_Back(t *testing.T) {
	client, _ := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	partyID, wren, kaelen, idris := partyOf3(t, store)
	everyone := []uuid.UUID{wren.PlayerID, kaelen.PlayerID, idris.PlayerID}
	away, err := store.RefreshAll(context.Background(), []uuid.UUID{partyID}, []uuid.UUID{wren.PlayerID, idris.PlayerID}, sentAt.Add(time.Minute))
	require.NoError(t, err)
	require.Equal(t, []uuid.UUID{kaelen.PlayerID}, away.Swept[partyID].Flipped)

	back, err := store.RefreshAll(context.Background(), []uuid.UUID{partyID}, everyone, sentAt.Add(2*time.Minute))
	require.NoError(t, err)

	assert.Equal(t, []uuid.UUID{kaelen.PlayerID}, back.Swept[partyID].Flipped)
	assert.False(t, back.Parties[0].Members[1].Away)
	assert.Equal(t, away.Parties[0].Version+1, back.Parties[0].Version)
}

// Every member away: the party stands until the last record expires, then ends and its keys go
// (FS-NCC9J Edge States "Every member away").
func TestRefreshAll_EveryRecordExpired_PartyEndsAndItsKeysGo(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	partyID, wren, kaelen, idris := partyOf3(t, store)

	still, err := store.RefreshAll(context.Background(), []uuid.UUID{partyID}, nil, sentAt.Add(partystore.RecordTTL+2*time.Second))
	require.NoError(t, err)
	require.Len(t, still.Parties, 1, "Idris, the last to join, is not yet five minutes unseen")

	gone, err := store.RefreshAll(context.Background(), []uuid.UUID{partyID}, nil, sentAt.Add(partystore.RecordTTL+3*time.Second))
	require.NoError(t, err)

	assert.Equal(t, []uuid.UUID{partyID}, gone.Gone)
	assert.Empty(t, gone.Parties)
	for _, key := range []string{"{party}:p:" + partyID.String(), "{party}:p:" + partyID.String() + ":seen",
		"{party}:pl:" + wren.PlayerID.String(), "{party}:pl:" + kaelen.PlayerID.String(), "{party}:pl:" + idris.PlayerID.String()} {
		assert.False(t, mini.Exists(key), key)
	}
}

// LeaderOf reads who leads a player's party without changing it: the leader for a member and for
// the leader, nothing for a player in no party or in a party that has ended (FS-NCC9J R20).
func TestLeaderOf_ReadsTheLeader(t *testing.T) {
	client, _ := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	partyID, wren, kaelen, _ := partyOf3(t, store)
	ctx := context.Background()

	for _, who := range []partystore.Joiner{wren, kaelen} {
		leader, in, err := store.LeaderOf(ctx, who.PlayerID)
		require.NoError(t, err)
		assert.True(t, in, who.Name)
		assert.Equal(t, wren.PlayerID, leader, who.Name)
	}
	_, in, err := store.LeaderOf(ctx, uuid.New())
	require.NoError(t, err)
	assert.False(t, in, "a player in no party")

	before, err := store.PartyOf(ctx, kaelen.PlayerID, sentAt)
	require.NoError(t, err)
	for _, m := range before.Party.Members {
		_, err := store.Remove(ctx, partystore.RemoveArgs{PartyID: partyID, PlayerID: m.PlayerID})
		require.NoError(t, err)
	}
	_, in, err = store.LeaderOf(ctx, kaelen.PlayerID)
	require.NoError(t, err)
	assert.False(t, in, "the party ended")
}

// FS-988SM §Requirements R1–R4, R8, R10. A random match's host makes one matched party of every
// matched player in one step: leader first, the rest in the order given, the matched origin in the
// record and nowhere else.

// matchedArgs is a matched create of joiners, the first leading, at most size of them.
func matchedArgs(size int, joiners ...partystore.Joiner) partystore.MatchedArgs {
	return partystore.MatchedArgs{PartyID: uuid.New(), Joiners: joiners, Size: size, Now: sentAt}
}

// Two matched players make a party of two, the first given leading, both pointing at it, on the
// party's TTL, its record carrying the matched origin (R1, R3, R4).
func TestCreateMatched_PartyOfTwo_LeaderFirstOriginMatched(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	wren, kaelen := joiner("Wren"), joiner("Kaelen")
	args := matchedArgs(2, wren, kaelen)

	res, err := store.CreateMatched(context.Background(), args)
	require.NoError(t, err)

	assert.Equal(t, partystore.Refusal(""), res.Refusal)
	assert.Empty(t, res.InParty)
	assert.Empty(t, res.NoRoom)
	assert.Equal(t, partystore.Party{
		ID: args.PartyID, Leader: wren.PlayerID, CreatedAt: sentAt, Version: 1,
		Members: []partystore.Member{
			{PlayerID: wren.PlayerID, Name: "Wren", Class: "warrior", JoinedAt: sentAt, SeenAt: sentAt},
			{PlayerID: kaelen.PlayerID, Name: "Kaelen", Class: "warrior", JoinedAt: sentAt, SeenAt: sentAt},
		},
	}, res.Party)
	partyKey := "{party}:p:" + args.PartyID.String()
	assert.Equal(t, "matched", mini.HGet(partyKey, "origin"))
	assert.Equal(t, 5*time.Minute, mini.TTL(partyKey))
	for _, j := range []partystore.Joiner{wren, kaelen} {
		pointer := "{party}:pl:" + j.PlayerID.String()
		assert.Equal(t, args.PartyID.String(), mustGet(t, mini, pointer), j.Name)
		assert.Equal(t, 5*time.Minute, mini.TTL(pointer), j.Name)
	}

	// read back as any party is: still led by Wren, both members
	read, err := store.PartyOf(context.Background(), kaelen.PlayerID, sentAt)
	require.NoError(t, err)
	assert.True(t, read.In)
	assert.Equal(t, wren.PlayerID, read.Party.Leader)
}

// A party made by create or invite carries no origin: every pre-formed party, old ones included,
// reads as pre-formed (R1, R2).
func TestCreate_PreFormed_NoOrigin(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	created, err := store.Create(context.Background(), uuid.New(), joiner("Wren"), sentAt)
	require.NoError(t, err)
	inv := invite(t, store, joiner("Kaelen"), joiner("Idris"), 2, sentAt)

	for _, id := range []uuid.UUID{created.Party.ID, inv.NewPartyID} {
		assert.Equal(t, "", mini.HGet("{party}:p:"+id.String(), "origin"))
	}
}

// A matched player already in a party, whoever they are in the order given, cancels the whole
// matched create: it writes nothing, no party and no pointer, names them, and leaves their own party
// as it was (R8).
func TestCreateMatched_AnyoneAlreadyInParty_WritesNothing(t *testing.T) {
	tests := []struct {
		name string
		// where the grouped player stands in the order given
		at int
	}{
		{"the leader already in a party", 0},
		{"a local already in a party", 1},
		{"a remote, given last, already in a party", 2},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client, mini := testutil.NewRedis(t)
			store := partystore.NewRedis(client)
			joiners := []partystore.Joiner{joiner("Wren"), joiner("Kaelen"), joiner("Marl")}
			grouped := joiners[tt.at]
			own, err := store.Create(context.Background(), uuid.New(), grouped, sentAt)
			require.NoError(t, err)
			args := matchedArgs(3, joiners...)

			res, err := store.CreateMatched(context.Background(), args)
			require.NoError(t, err)

			assert.Equal(t, partystore.RefusalAlreadyInParty, res.Refusal)
			assert.Equal(t, []uuid.UUID{grouped.PlayerID}, res.InParty, "the player found in a party is named")
			assert.Equal(t, partystore.Party{}, res.Party)
			assert.False(t, mini.Exists("{party}:p:"+args.PartyID.String()), "no matched party")
			for _, j := range joiners {
				if j.PlayerID == grouped.PlayerID {
					continue
				}
				assert.False(t, mini.Exists("{party}:pl:"+j.PlayerID.String()), "%s is in no party", j.Name)
			}
			kept, err := store.PartyOf(context.Background(), grouped.PlayerID, sentAt)
			require.NoError(t, err)
			assert.Equal(t, own.Party.ID, kept.Party.ID, "they keep their own party")
			assert.Equal(t, []uuid.UUID{grouped.PlayerID}, memberIDs(kept.Party), "their own party is untouched")
		})
	}
}

// Every matched player found in a party is named, not only the first (R8).
func TestCreateMatched_SeveralInParties_NamesEveryOne(t *testing.T) {
	client, _ := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	wren, kaelen, marl := joiner("Wren"), joiner("Kaelen"), joiner("Marl")
	for _, j := range []partystore.Joiner{wren, marl} {
		_, err := store.Create(context.Background(), uuid.New(), j, sentAt)
		require.NoError(t, err)
	}

	res, err := store.CreateMatched(context.Background(), matchedArgs(3, wren, kaelen, marl))
	require.NoError(t, err)

	assert.Equal(t, partystore.RefusalAlreadyInParty, res.Refusal)
	assert.Equal(t, []uuid.UUID{wren.PlayerID, marl.PlayerID}, res.InParty)
}

// More matched players than the party holds: the first up to the size join, the leader among
// them, and the rest are left out with no pointer (R10).
func TestCreateMatched_MoreThanTheSize_FirstUpToTheSizeJoin(t *testing.T) {
	client, mini := testutil.NewRedis(t)
	store := partystore.NewRedis(client)
	wren, kaelen, idris := joiner("Wren"), joiner("Kaelen"), joiner("Idris")

	res, err := store.CreateMatched(context.Background(), matchedArgs(2, wren, kaelen, idris))
	require.NoError(t, err)

	require.Equal(t, partystore.Refusal(""), res.Refusal)
	assert.Equal(t, []uuid.UUID{wren.PlayerID, kaelen.PlayerID}, memberIDs(res.Party))
	assert.Equal(t, wren.PlayerID, res.Party.Leader)
	assert.Equal(t, []uuid.UUID{idris.PlayerID}, res.NoRoom)
	assert.False(t, mini.Exists("{party}:pl:"+idris.PlayerID.String()))
}

func memberIDs(p partystore.Party) []uuid.UUID {
	ids := make([]uuid.UUID, 0, len(p.Members))
	for _, m := range p.Members {
		ids = append(ids, m.PlayerID)
	}
	return ids
}
