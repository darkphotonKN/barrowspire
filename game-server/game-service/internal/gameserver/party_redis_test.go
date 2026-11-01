package gameserver

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partystore"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-NCC9J §Requirements R6, R8, R9, R14, R15 on one pod. I-NCC9J-1: the party in Redis, read and
// changed from any world, the hub's loop never waiting on it.

// A player in a field invites someone in the town: an invite is sent from any world (R9).
func TestPartyInvite_FromAField_Delivered(t *testing.T) {
	rig := newPartyRig(t)
	_, wrenConn, wrenInbox := rig.inMeadows(t, "Wren")
	_, _, kaelenInbox := rig.inHub(t, "Kaelen")

	sendParty(rig.server, wrenConn, partyInviteAction, map[string]interface{}{"name": "Kaelen"})

	awaitParty(t, kaelenInbox, partyInviteAction, "Kaelen")
	sent := awaitParty(t, wrenInbox, partyNoticeAction, "Wren")
	assert.Equal(t, "sent", sent.Payload["code"])
}

// An invitee who walked into a field accepts there and joins where they stand: nobody moves, and
// both get the party of two (R14; user story 3).
func TestPartyAccept_InAField_JoinsWhereTheyStand(t *testing.T) {
	rig := newPartyRig(t)
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	inviteID := rig.invited(t, wrenConn, "Kaelen", kaelenInbox)
	rig.hub.RemovePlayer(kaelen.ID.String())
	rig.meadows.AddPlayerAt(kaelen.ID, kaelen.Character, "", 200, 200)
	rig.server.setCurrentWorld(kaelen, rig.meadows.ID)

	sendParty(rig.server, kaelenConn, partyAcceptAction, map[string]interface{}{"invite_id": inviteID})

	joined := awaitUpdateAbout(t, kaelenInbox, kaelen.ID, "Kaelen")
	assert.Equal(t, []string{wren.ID.String(), kaelen.ID.String()}, memberIDsOf(t, joined))
	awaitUpdateAbout(t, wrenInbox, kaelen.ID, "Wren")
	assertNoWorldHandoff(t, kaelenInbox)
}

// A player in a field creates a party there (R15).
func TestPartyCreate_InAField_Forms(t *testing.T) {
	rig := newPartyRig(t)
	wren, wrenConn, wrenInbox := rig.inMeadows(t, "Wren")

	sendParty(rig.server, wrenConn, partyCreateAction, map[string]interface{}{})

	formed := awaitUpdate(t, wrenInbox, "joined", wren.ID, "Wren")
	assert.Equal(t, []string{wren.ID.String()}, memberIDsOf(t, formed))
}

// A player seated on the pod is read from Redis and sent all of their party at once, reason sync,
// so a party changed while they were elsewhere is shown on arrival; it is sent once, not on every
// tick (R6; user story 20).
func TestPartyArrival_SeatedPlayerGetsTheirParty(t *testing.T) {
	rig := newPartyRig(t)
	kaelen, _, kaelenInbox := rig.inHub(t, "Kaelen")
	// a party formed on another pod, as only Redis knows it
	partyID := uuid.New()
	created, err := partystore.NewRedis(rig.client).Create(context.Background(), partyID,
		partystore.Joiner{PlayerID: kaelen.ID, Name: "Kaelen", Class: "warrior"}, rig.partyClock.now())
	require.NoError(t, err)
	require.Empty(t, created.Refusal)

	rig.tick()

	sync := awaitUpdate(t, kaelenInbox, "sync", kaelen.ID, "Kaelen")
	assert.Equal(t, partyID.String(), sync.Payload["party_id"])
	assert.Equal(t, kaelen.ID.String(), sync.Payload["leader_id"])
	assert.Equal(t, []string{kaelen.ID.String()}, memberIDsOf(t, sync))

	rig.tick()
	assertNoParty(t, kaelenInbox, partyUpdateAction, "Kaelen: already held, not read again")
}

// With Redis unreachable every party change is refused unavailable: create, invite, accept and
// decline (R8; Edge States "Redis unreachable").
func TestParty_RedisUnreachable_ChangesRefusedUnavailable(t *testing.T) {
	rig := newPartyRig(t)
	_, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	_, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	_, idrisConn, idrisInbox := rig.inHub(t, "Idris")
	inviteID := rig.invited(t, wrenConn, "Kaelen", kaelenInbox)
	awaitParty(t, wrenInbox, partyNoticeAction, "Wren") // sent
	rig.mini.Close()

	for _, step := range []struct {
		who     string
		send    func()
		inbox   *startSoloInbox
		purpose string
	}{
		{"Idris", func() { sendParty(rig.server, idrisConn, partyCreateAction, map[string]interface{}{}) }, idrisInbox, "create"},
		{"Idris", func() { sendParty(rig.server, idrisConn, partyInviteAction, map[string]interface{}{"name": "Kaelen"}) }, idrisInbox, "invite"},
		{"Kaelen", func() {
			sendParty(rig.server, kaelenConn, partyAcceptAction, map[string]interface{}{"invite_id": inviteID})
		}, kaelenInbox, "accept"},
		{"Kaelen", func() {
			sendParty(rig.server, kaelenConn, partyDeclineAction, map[string]interface{}{"invite_id": inviteID})
		}, kaelenInbox, "decline"},
	} {
		step.send()
		refused := awaitParty(t, step.inbox, partyNoticeAction, step.who)
		assert.Equal(t, "unavailable", refused.Payload["code"], step.purpose)
	}
}

// With Redis unreachable the party is still read from the cache: a member who does not lead is
// refused not_leader without asking Redis (R4, R8; AC "No Redis call on the hub loop for a party
// read").
func TestParty_RedisUnreachable_ReadsComeFromTheCache(t *testing.T) {
	rig := newPartyRig(t, WithPartySize(3))
	_, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	_, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	rig.inHub(t, "Idris")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	rig.mini.Close()

	sendParty(rig.server, kaelenConn, partyInviteAction, map[string]interface{}{"name": "Idris"})

	refused := awaitParty(t, kaelenInbox, partyNoticeAction, "Kaelen")
	assert.Equal(t, "not_leader", refused.Payload["code"])
}

// blippingArrivals is the party store with its first arrival reads failing, as on a short Redis
// outage.
type blippingArrivals struct {
	*partystore.Redis
	failures atomic.Int32
}

func (b *blippingArrivals) PartyOf(ctx context.Context, playerID uuid.UUID, now time.Time) (partystore.Party, bool, error) {
	if b.failures.Add(-1) >= 0 {
		return partystore.Party{}, false, errors.New("redis blip")
	}
	return b.Redis.PartyOf(ctx, playerID, now)
}

// An arrival read that fails is tried again on a later tick: a short Redis outage as a player is
// seated does not leave their party out of the cache for their whole stay (R6; code review
// 2026-11-01, HIGH).
func TestPartyArrival_FailedReadRetried(t *testing.T) {
	var store *blippingArrivals
	rig := newPartyRigOn(t, func(client redis.UniversalClient) []Option {
		store = &blippingArrivals{Redis: partystore.NewRedis(client)}
		store.failures.Store(1)
		return []Option{WithPartyStore(store)}
	})
	kaelen, _, kaelenInbox := rig.inHub(t, "Kaelen")
	created, err := store.Create(context.Background(), uuid.New(),
		partystore.Joiner{PlayerID: kaelen.ID, Name: "Kaelen", Class: "warrior"}, rig.partyClock.now())
	require.NoError(t, err)
	require.Empty(t, created.Refusal)

	for range 10 {
		rig.tick()
		if update, got := partyUpdateWithin(kaelenInbox, chatSilence); got {
			assert.Equal(t, "sync", update.Payload["reason"])
			assert.Equal(t, created.Party.ID.String(), update.Payload["party_id"])
			return
		}
	}
	t.Fatal("Kaelen's party was never read after the first read failed")
}

// partyUpdateWithin is the first party_update the inbox gets within d, dropping anything else.
func partyUpdateWithin(inbox *startSoloInbox, d time.Duration) (types.Message, bool) {
	deadline := time.After(d)
	for {
		select {
		case msg := <-inbox.messages:
			if msg.Action == partyUpdateAction {
				return msg, true
			}
		case <-deadline:
			return types.Message{}, false
		}
	}
}

// failingWithdrawals is the party store with every withdrawal failing.
type failingWithdrawals struct{ *partystore.Redis }

func (failingWithdrawals) Withdraw(context.Context, uuid.UUID, bool, time.Time) (partystore.WithdrawResult, error) {
	return partystore.WithdrawResult{}, errors.New("redis blip")
}

// An undelivered first invite that Redis could not withdraw leaves its party standing in Redis:
// the leader is told delivery_failed and given the party as it stands, and the cache keeps it, so
// a create is refused already_in_party rather than meeting a party the pod forgot (D6; code
// review 2026-11-01).
func TestPartyInvite_UndeliveredAndNotWithdrawn_PartyKept(t *testing.T) {
	rig := newPartyRigOn(t, func(client redis.UniversalClient) []Option {
		return []Option{WithPartyStore(failingWithdrawals{partystore.NewRedis(client)})}
	})
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	rig.stalled(t, "Kaelen")

	sendParty(rig.server, wrenConn, partyInviteAction, map[string]interface{}{"name": "Kaelen"})

	failed := awaitParty(t, wrenInbox, partyNoticeAction, "Wren")
	assert.Equal(t, "delivery_failed", failed.Payload["code"])
	formed := awaitUpdate(t, wrenInbox, "joined", wren.ID, "Wren")
	assert.Equal(t, []string{wren.ID.String()}, memberIDsOf(t, formed))

	sendParty(rig.server, wrenConn, partyCreateAction, map[string]interface{}{})
	refused := awaitParty(t, wrenInbox, partyNoticeAction, "Wren")
	assert.Equal(t, "already_in_party", refused.Payload["code"])
}

// A target this pod holds is answered here in any world: a player in the town invites one in the
// Meadows on the same pod, and the prompt reaches them there (FS-NCC9J R11; I-NCC9J-3 E8).
func TestPartyInvite_SamePod_TargetInAField_Delivered(t *testing.T) {
	rig := newPartyRig(t)
	_, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	_, _, kaelenInbox := rig.inMeadows(t, "Kaelen")

	sendParty(rig.server, wrenConn, partyInviteAction, map[string]interface{}{"name": "kaelen"})

	awaitParty(t, kaelenInbox, partyInviteAction, "Kaelen, in the Meadows")
	sent := awaitParty(t, wrenInbox, partyNoticeAction, "Wren")
	assert.Equal(t, "sent", sent.Payload["code"])
	assert.Equal(t, "Kaelen", sent.Payload["name"])
}

// onLoop runs job on the hub's loop and waits for it: the party registry's state is the loop's.
func (r *partyRig) onLoop(t *testing.T, job func(reg *partyRegistry)) {
	t.Helper()
	done := make(chan struct{})
	r.server.parties.run.jobs.post(context.Background(), func() { job(r.server.parties); close(done) })
	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("the hub's loop never ran the job")
	}
}

// A party_update letter older than the party this pod already holds is dropped: the cache keeps
// the newer party and nobody is told the older one (code review 2026-11-01, I-NCC9J-3 HIGH).
func TestPartyLetter_OlderThanTheCache_Dropped(t *testing.T) {
	rig := newPartyRig(t, WithPartySize(3))
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	_, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	var held partystore.Party
	rig.onLoop(t, func(reg *partyRegistry) { held, _ = reg.cache.partyOf(wren.ID) })
	require.Greater(t, held.Version, int64(1))

	stale := held
	stale.Version--
	stale.Leader = uuid.New()
	rig.onLoop(t, func(reg *partyRegistry) {
		reg.heardUpdate(partyUpdateLetter{Party: stale, Whole: true, To: []uuid.UUID{wren.ID}, Message: map[string]interface{}{"party_id": stale.ID.String()}})
	})

	assertNoParty(t, wrenInbox, partyUpdateAction, "Wren: the letter is older than what the pod holds")
	rig.onLoop(t, func(reg *partyRegistry) {
		now, _ := reg.cache.partyOf(wren.ID)
		assert.Equal(t, held.Version, now.Version)
		assert.Equal(t, held.Leader, now.Leader)
	})
}

// A party changed in Redis without this pod hearing of it (a letter lost) is caught by the 10 s
// re-read: the cache takes the newer party and every member this pod holds is sent it, reason
// sync (FS-NCC9J R4 "a letter dropped"; I-NCC9J-3 HIGH).
func TestPartyRefresh_NewerParty_MembersHereTold(t *testing.T) {
	rig := newPartyRig(t, WithPartySize(3))
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	rig.tick() // both held: arrival reads
	awaitUpdate(t, wrenInbox, "sync", wren.ID, "Wren")
	awaitUpdate(t, kaelenInbox, "sync", kaelen.ID, "Kaelen")
	partyID, err := rig.mini.Get(pointerKey(wren.ID))
	require.NoError(t, err)

	// another pod hands the lead on; its letter never arrives here
	_, err = partystore.NewRedis(rig.client).Transfer(context.Background(), uuid.MustParse(partyID), wren.ID, kaelen.ID)
	require.NoError(t, err)
	rig.partyClock.advance(partyRefreshInterval)
	rig.tick()

	for who, inbox := range map[string]*startSoloInbox{"Wren": wrenInbox, "Kaelen": kaelenInbox} {
		update, got := inbox.await(partyUpdateAction)
		require.True(t, got, "%s is told the newer party", who)
		assert.Equal(t, "sync", update.Payload["reason"], who)
		assert.Equal(t, kaelen.ID.String(), update.Payload["leader_id"], who)
	}
}

// An open invite past its minute leaves the party's reserved slots with no update of its own
// (I-NCC9J-3 E5); the next update the party sends lists only the slots still open (FS-NCC9J R12,
// R21; AC 4 "expiry removes them").
func TestPartyReserved_ExpiredSlotLeavesTheNextUpdate(t *testing.T) {
	rig := newPartyRig(t, WithPartySize(3))
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	_, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	idris, _, idrisInbox := rig.inHub(t, "Idris")
	ori, _, oriInbox := rig.inHub(t, "Ori")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	rig.tick() // everyone held: the arrival reads
	awaitUpdate(t, wrenInbox, "sync", wren.ID, "Wren")
	rig.invited(t, wrenConn, "Idris", idrisInbox)
	awaitUpdate(t, wrenInbox, "invited", idris.ID, "Wren")

	rig.partyClock.advance(time.Minute)
	rig.tick()
	assertNoParty(t, wrenInbox, partyUpdateAction, "Wren: no update for an expiry")
	rig.invited(t, wrenConn, "Ori", oriInbox)

	invited := awaitUpdate(t, wrenInbox, "invited", ori.ID, "Wren")
	reserved := listOf(t, invited, "reserved")
	require.Len(t, reserved, 1, "Idris's lapsed slot is gone")
	assert.Equal(t, "Ori", reserved[0]["name"])
}

// An update addressed to one player (a removed player's final update, an arrival sync) reaches
// them even when the cache already holds a newer party: they are not a member of it, or not yet
// told it, and nothing later would reach them (code review round 2, HIGH).
func TestPartyUpdate_ToOnePlayer_NotDroppedAsOlder(t *testing.T) {
	rig := newPartyRig(t, WithPartySize(3))
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	var held partystore.Party
	rig.onLoop(t, func(reg *partyRegistry) { held, _ = reg.cache.partyOf(wren.ID) })

	// Kaelen's final update, built from the party one version before the one the cache holds
	older := held
	older.Version--
	rig.onLoop(t, func(reg *partyRegistry) {
		reg.deliver([]partyUpdate{{party: older, reason: constants.PartyUpdateKicked, subject: kaelen.ID, to: kaelen.ID, final: true}}, nil)
	})

	final := awaitParty(t, kaelenInbox, partyUpdateAction, "Kaelen")
	assert.Equal(t, "kicked", final.Payload["reason"])
}

// A whole party_update letter marks the party told only if every member this pod holds was told:
// a member the sending pod's presence lookup did not place here is left to the re-read (code
// review round 2, MED).
func TestPartyLetter_MissingAMemberHere_NotMarkedTold(t *testing.T) {
	rig := newPartyRig(t, WithPartySize(3))
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	_, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	var held partystore.Party
	var toldBefore int64
	rig.onLoop(t, func(reg *partyRegistry) {
		held, _ = reg.cache.partyOf(wren.ID)
		toldBefore = reg.cache.told[held.ID]
	})

	newer := held
	newer.Version++
	rig.onLoop(t, func(reg *partyRegistry) {
		reg.heardUpdate(partyUpdateLetter{Party: newer, Whole: true, To: []uuid.UUID{wren.ID}, Message: map[string]interface{}{"party_id": newer.ID.String()}})
	})

	rig.onLoop(t, func(reg *partyRegistry) {
		assert.Equal(t, toldBefore, reg.cache.told[held.ID], "Kaelen, here, was not told: the re-read must still sync")
	})
}

// After a decline the cache holds the party as the decline left it, at its new version, so a late
// letter from before the decline, still showing the slot, is dropped rather than bringing the
// slot back (code review round 2, MED).
func TestPartyDecline_CacheTakesTheNewVersion(t *testing.T) {
	rig := newPartyRig(t, WithPartySize(3))
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	_, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	idris, idrisConn, idrisInbox := rig.inHub(t, "Idris")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	inviteID := rig.invited(t, wrenConn, "Idris", idrisInbox)
	awaitUpdate(t, wrenInbox, "invited", idris.ID, "Wren")
	var invited partystore.Party
	rig.onLoop(t, func(reg *partyRegistry) { invited, _ = reg.cache.partyOf(wren.ID) })

	sendParty(rig.server, idrisConn, partyDeclineAction, map[string]interface{}{"invite_id": inviteID})
	awaitUpdate(t, wrenInbox, "invite_ended", idris.ID, "Wren")

	rig.onLoop(t, func(reg *partyRegistry) {
		now, _ := reg.cache.partyOf(wren.ID)
		assert.Greater(t, now.Version, invited.Version, "the cache moved on with the decline")
		assert.Empty(t, now.Reserved)
		reg.heardUpdate(partyUpdateLetter{Party: invited, Whole: true, To: []uuid.UUID{wren.ID}, Message: map[string]interface{}{"party_id": invited.ID.String()}})
	})
	assertNoParty(t, wrenInbox, partyUpdateAction, "Wren: the late letter would bring Idris's slot back")
}

// A member is never shown a party older than the newest this pod knows: an arrival sync or resync
// built from an older read is sent as the cached party instead. Only a removed player's final
// update goes out as it was built (code review round 3, HIGH).
func TestPartySync_OlderThanTheCache_SendsTheNewest(t *testing.T) {
	rig := newPartyRig(t, WithPartySize(3))
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	var held partystore.Party
	rig.onLoop(t, func(reg *partyRegistry) { held, _ = reg.cache.partyOf(wren.ID) })

	// an arrival read made before the last change: Kaelen still led
	older := held
	older.Version--
	older.Leader = kaelen.ID
	rig.onLoop(t, func(reg *partyRegistry) {
		reg.deliver([]partyUpdate{{party: older, reason: constants.PartyUpdateSync, subject: wren.ID, to: wren.ID}}, nil)
	})

	sync := awaitUpdate(t, wrenInbox, "sync", wren.ID, "Wren")
	assert.Equal(t, held.Leader.String(), sync.Payload["leader_id"], "Wren is shown the newest party, not the older read")
}

// An arrival read made just before the player was kicked, sent after the pod heard the kick, does
// not put them back in the party: only a removed player's final update goes out older than the
// cache, and it is marked as one rather than told apart by who it is for (code review round 4,
// HIGH).
func TestPartySync_RecipientKickedSince_NotShownTheOldParty(t *testing.T) {
	rig := newPartyRig(t, WithPartySize(3))
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	kaelen, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	_, idrisConn, idrisInbox := rig.inHub(t, "Idris")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	rig.partied(t, wrenConn, wrenInbox, "Idris", idrisConn, idrisInbox)
	var read partystore.Party
	rig.onLoop(t, func(reg *partyRegistry) { read, _ = reg.cache.partyOf(wren.ID) })

	sendParty(rig.server, wrenConn, partyKickAction, map[string]interface{}{"target_id": kaelen.ID.String()})
	awaitUpdate(t, kaelenInbox, "kicked", kaelen.ID, "Kaelen")

	// Kaelen's arrival sync, built from the read made before the kick
	rig.onLoop(t, func(reg *partyRegistry) {
		reg.deliver([]partyUpdate{{party: read, reason: constants.PartyUpdateSync, subject: kaelen.ID, to: kaelen.ID}}, nil)
	})

	deadline := time.After(chatSilence)
	for {
		select {
		case msg := <-kaelenInbox.messages:
			if msg.Action == partyUpdateAction {
				assert.NotContains(t, memberIDsOf(t, msg), kaelen.ID.String(), "Kaelen is shown a party he was kicked from")
			}
		case <-deadline:
			return
		}
	}
}

// A letter older than the cache is dropped unless it is a removed player's final update, which is
// told whatever its age (code review round 4).
func TestPartyLetter_OlderThanTheCache_OnlyAFinalUpdateTold(t *testing.T) {
	rig := newPartyRig(t, WithPartySize(3))
	wren, wrenConn, wrenInbox := rig.inHub(t, "Wren")
	_, kaelenConn, kaelenInbox := rig.inHub(t, "Kaelen")
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	var held partystore.Party
	rig.onLoop(t, func(reg *partyRegistry) { held, _ = reg.cache.partyOf(wren.ID) })
	older := held
	older.Version--

	rig.onLoop(t, func(reg *partyRegistry) {
		reg.heardUpdate(partyUpdateLetter{Party: older, To: []uuid.UUID{wren.ID}, Message: map[string]interface{}{"reason": "sync"}})
	})
	assertNoParty(t, wrenInbox, partyUpdateAction, "Wren: a sync older than the cache")

	rig.onLoop(t, func(reg *partyRegistry) {
		reg.heardUpdate(partyUpdateLetter{Party: older, Final: true, To: []uuid.UUID{wren.ID}, Message: map[string]interface{}{"reason": "kicked"}})
	})
	final := awaitParty(t, wrenInbox, partyUpdateAction, "Wren")
	assert.Equal(t, "kicked", final.Payload["reason"])
}
