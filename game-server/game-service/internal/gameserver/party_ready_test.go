package gameserver

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	itemspb "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partystore"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-BJNYC §Requirements R3–R14, R18; §Acceptance Criteria rows 4–11, 15–16. I-BJNYC-3.
//
// The leader at the Spire's door sends party_enter; every member, the leader
// included, is shown the same ready check, the leader already accepted; when
// every other member accepts, the whole party goes down into one run on this
// pod. Any no cancels it, and everyone is told who.

// The wire names, spelled out so a renamed constant cannot quietly move the
// contract the client reads.
const (
	partyEnterAction      = "party_enter"
	partyReadyAction      = "party_ready"
	partyReadyCheckAction = "party_ready_check"
)

// readyCheckSeen is a party_ready_check as a client reads it.
type readyCheckSeen struct {
	checkID     string
	leaderID    string
	expiresInMS int64
	members     []readyRowSeen
	outcome     string
	reason      string
	names       []string
}

type readyRowSeen struct {
	playerID string
	name     string
	state    string
}

// stateOf is the member's state on the check, "" when they are not on it.
func (c readyCheckSeen) stateOf(playerID uuid.UUID) string {
	for _, m := range c.members {
		if m.playerID == playerID.String() {
			return m.state
		}
	}
	return ""
}

// memberIDs are the player ids on the check, in order.
func (c readyCheckSeen) memberIDs() []string {
	ids := make([]string, len(c.members))
	for i, m := range c.members {
		ids[i] = m.playerID
	}
	return ids
}

func decodeReadyCheck(t *testing.T, msg types.Message) readyCheckSeen {
	t.Helper()
	require.Equal(t, partyReadyCheckAction, msg.Action)
	require.Nil(t, msg.Error, "a ready check is not an error reply")

	var seen readyCheckSeen
	seen.checkID, _ = msg.Payload["check_id"].(string)
	seen.leaderID, _ = msg.Payload["leader_id"].(string)
	switch ms := msg.Payload["expires_in_ms"].(type) {
	case int64:
		seen.expiresInMS = ms
	case int:
		seen.expiresInMS = int64(ms)
	case float64:
		seen.expiresInMS = int64(ms)
	default:
		t.Fatalf("expires_in_ms is not a number: %T", msg.Payload["expires_in_ms"])
	}
	for _, m := range listOf(t, msg, "members") {
		row := readyRowSeen{}
		row.playerID, _ = m["player_id"].(string)
		row.name, _ = m["name"].(string)
		row.state, _ = m["state"].(string)
		seen.members = append(seen.members, row)
	}
	seen.outcome, _ = msg.Payload["outcome"].(string)
	seen.reason, _ = msg.Payload["reason"].(string)
	switch names := msg.Payload["names"].(type) {
	case nil:
	case []string:
		seen.names = names
	case []interface{}:
		for _, n := range names {
			s, _ := n.(string)
			seen.names = append(seen.names, s)
		}
	default:
		t.Fatalf("names is not a list: %T", msg.Payload["names"])
	}
	return seen
}

// awaitReadyCheck waits for the next party_ready_check on the inbox.
func awaitReadyCheck(t *testing.T, inbox *startSoloInbox, who string) readyCheckSeen {
	t.Helper()
	msg, got := inbox.await(partyReadyCheckAction)
	require.True(t, got, "%s never received a party_ready_check", who)
	return decodeReadyCheck(t, msg)
}

// awaitReadyOutcome waits for the party_ready_check with outcome, dropping any
// other check on the way.
func awaitReadyOutcome(t *testing.T, inbox *startSoloInbox, who, outcome string) readyCheckSeen {
	t.Helper()
	for {
		seen := awaitReadyCheck(t, inbox, who)
		if seen.outcome == outcome {
			return seen
		}
	}
}

// awaitPartyNotice waits for the next party_notice on the inbox.
func awaitPartyNotice(t *testing.T, inbox *startSoloInbox, who string) types.Message {
	t.Helper()
	return awaitParty(t, inbox, partyNoticeAction, who)
}

// noticeNames are the names a party_notice carries in its names list.
func noticeNames(t *testing.T, msg types.Message) []string {
	t.Helper()
	switch names := msg.Payload["names"].(type) {
	case nil:
		return nil
	case []string:
		return names
	case []interface{}:
		out := make([]string, len(names))
		for i, n := range names {
			out[i], _ = n.(string)
		}
		return out
	}
	t.Fatalf("names is not a list: %T", msg.Payload["names"])
	return nil
}

func sendEnter(server *Server, conn *websocket.Conn) {
	sendParty(server, conn, partyEnterAction, nil)
}

func sendReady(server *Server, conn *websocket.Conn, checkID string, accept bool) {
	sendParty(server, conn, partyReadyAction, map[string]interface{}{"check_id": checkID, "accept": accept})
}

// awaitRunEntered waits for world_entered into a run and returns the run.
func awaitRunEntered(t *testing.T, server *Server, inbox *startSoloInbox, who string) *game.Session {
	t.Helper()
	reply, got := inbox.await(string(constants.ActionWorldEntered))
	require.True(t, got, "%s was never sent world_entered", who)
	require.Equal(t, string(types.WorldTypeRun), reply.Payload["world_type"], "%s entered a run", who)
	id, err := uuid.Parse(reply.Payload["session_id"].(string))
	require.NoError(t, err)
	run, exists := server.GetGameSession(id)
	require.True(t, exists, "the run %s entered exists", who)
	t.Cleanup(run.Shutdown)
	return run
}

// partyOfTwo forms Wren's party with Kaelen, Wren at the Spire's door and
// Kaelen elsewhere in the town.
func partyOfTwo(t *testing.T, rig *partyEntryRig) (wren, kaelen *types.Player, wrenConn, kaelenConn *websocket.Conn, wrenInbox, kaelenInbox *startSoloInbox) {
	t.Helper()
	wren, wrenConn, wrenInbox = rig.standing(t, "Wren", true)
	kaelen, kaelenConn, kaelenInbox = rig.standing(t, "Kaelen", false)
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	return
}

// A leader at the door with a member in the town: both are shown the check
// open, the leader accepted from the start, the member waiting, 30 s on the
// clock. The member accepts; both are shown it, then started, and both go down
// together into one run on this pod. FS-BJNYC R3, R7, R8, R11, R13; AC rows 7, 10.
func TestPartyEnter_TwoMembers_ReadyCheckThenOneRun(t *testing.T) {
	rig := newPartyEntryRig(t, &MockItemsClient{})
	wren, kaelen, wrenConn, kaelenConn, wrenInbox, kaelenInbox := partyOfTwo(t, rig)

	sendEnter(rig.server, wrenConn)

	var checkID string
	for who, inbox := range map[string]*startSoloInbox{"Wren": wrenInbox, "Kaelen": kaelenInbox} {
		open := awaitReadyCheck(t, inbox, who)
		assert.Equal(t, "open", open.outcome, who)
		assert.Equal(t, wren.ID.String(), open.leaderID, who)
		assert.InDelta(t, 30000, open.expiresInMS, 1000, "%s: about 30 s on the clock", who)
		assert.Equal(t, []string{wren.ID.String(), kaelen.ID.String()}, open.memberIDs(), "%s: one row per member, in join order", who)
		assert.Equal(t, "accepted", open.stateOf(wren.ID), "%s: the leader's press is their acceptance", who)
		assert.Equal(t, "waiting", open.stateOf(kaelen.ID), who)
		assert.Equal(t, "Kaelen", open.members[1].name, who)
		assert.Empty(t, open.reason, who)
		require.NotEmpty(t, open.checkID, who)
		if checkID != "" {
			assert.Equal(t, checkID, open.checkID, "one check, the same id for everyone")
		}
		checkID = open.checkID
	}

	sendReady(rig.server, kaelenConn, checkID, true)

	for who, inbox := range map[string]*startSoloInbox{"Wren": wrenInbox, "Kaelen": kaelenInbox} {
		answered := awaitReadyCheck(t, inbox, who)
		assert.Equal(t, "open", answered.outcome, "%s: shown the answer", who)
		assert.Equal(t, "accepted", answered.stateOf(kaelen.ID), who)
		started := awaitReadyCheck(t, inbox, who)
		assert.Equal(t, "started", started.outcome, who)
		assert.Equal(t, checkID, started.checkID, who)
	}
	wrenRun := awaitRunEntered(t, rig.server, wrenInbox, "Wren")
	kaelenRun := awaitRunEntered(t, rig.server, kaelenInbox, "Kaelen")

	assert.Equal(t, wrenRun.ID, kaelenRun.ID, "one run for the whole party")
	assert.ElementsMatch(t, []uuid.UUID{wren.ID, kaelen.ID}, wrenRun.GetPlayerIDs(), "both seated in it")
	assert.Equal(t, wrenRun.ID, startSoloWorldOnRecord(t, rig.server, wren.ID))
	assert.Equal(t, wrenRun.ID, startSoloWorldOnRecord(t, rig.server, kaelen.ID))
	assert.False(t, rig.hub.HasPlayer(wren.ID), "out of the hub")
	assert.False(t, rig.hub.HasPlayer(kaelen.ID), "out of the hub")
}

// When the party's run ends, the party is as it was in Redis and every member
// is back in this pod's town. FS-BJNYC R14, R18; AC rows 15, 16.
func TestPartyEnter_RunEnds_PartyStandsMembersInTheTown(t *testing.T) {
	rig := newPartyEntryRig(t, &MockItemsClient{})
	wren, kaelen, wrenConn, kaelenConn, wrenInbox, kaelenInbox := partyOfTwo(t, rig)
	store := partystore.NewRedis(rig.client)
	before, err := store.PartyOf(context.Background(), wren.ID, rig.partyClock.now())
	require.NoError(t, err)
	require.True(t, before.In)

	sendEnter(rig.server, wrenConn)
	open := awaitReadyCheck(t, kaelenInbox, "Kaelen")
	sendReady(rig.server, kaelenConn, open.checkID, true)
	run := awaitRunEntered(t, rig.server, wrenInbox, "Wren")
	awaitRunEntered(t, rig.server, kaelenInbox, "Kaelen")

	rig.server.ReturnPlayersToHub(run.ID)

	for _, p := range []*types.Player{wren, kaelen} {
		assert.Equal(t, rig.hub.ID, startSoloWorldOnRecord(t, rig.server, p.ID), "%s is back in the town", p.Character.Name)
		assert.True(t, rig.hub.HasPlayer(p.ID), "%s stands in the hub", p.Character.Name)
	}
	after, err := store.PartyOf(context.Background(), wren.ID, rig.partyClock.now())
	require.NoError(t, err)
	require.True(t, after.In, "the party persists")
	assert.Equal(t, before.Party.ID, after.Party.ID)
	assert.Equal(t, before.Party.Leader, after.Party.Leader)
	assert.Equal(t, memberIDs(before.Party), memberIDs(after.Party))
}

// moveTo walks player from one world into another at (x, y), as a field entry
// or a walk across the hub would leave them; from and to may be the hub both.
func (r *partyEntryRig) moveTo(t *testing.T, player *types.Player, from, to *game.Session, x, y float64) {
	t.Helper()
	from.RemovePlayer(player.ID.String())
	to.AddPlayerAt(player.ID, player.Character, "", x, y)
	r.server.setCurrentWorld(player, to.ID)
}

// offTheGate walks a player at the Spire's door elsewhere in the town, once the
// hub has measured it.
func (r *partyEntryRig) offTheGate(t *testing.T, player *types.Player) {
	t.Helper()
	r.moveTo(t, player, r.hub, r.hub, awayFromGateX, awayFromGateY)
	require.Eventually(t, func() bool {
		return !r.server.AtSpireGate(player.ID)
	}, startSoloSettle, 10*time.Millisecond, "the hub never measured %s off the gate", player.Character.Name)
}

// ghostMember joins the leader's party straight in Redis, as a member on
// another pod would: this pod holds nobody by that name.
func (r *partyEntryRig) ghostMember(t *testing.T, leader *types.Player, name string) uuid.UUID {
	t.Helper()
	store := partystore.NewRedis(r.client)
	ghost, inviteID := uuid.New(), uuid.New()
	invited, err := store.Invite(context.Background(), partystore.InviteArgs{
		NewPartyID: uuid.New(), Inviter: joinerOf(leader), InviteID: inviteID,
		TargetID: ghost, TargetName: name, Size: 8, Now: r.partyClock.now(),
	})
	require.NoError(t, err)
	require.Empty(t, invited.Refusal)
	accepted, err := store.Accept(context.Background(), partystore.AcceptArgs{
		InviteID: inviteID, Accepter: partystore.Joiner{PlayerID: ghost, Name: name, Class: "warrior"}, Now: r.partyClock.now(),
	})
	require.NoError(t, err)
	require.Empty(t, accepted.Refusal)
	return ghost
}

// assertNoticeCode requires the next party_notice to carry code.
func assertNoticeCode(t *testing.T, inbox *startSoloInbox, who, code string) types.Message {
	t.Helper()
	notice := awaitPartyNotice(t, inbox, who)
	require.Equal(t, code, notice.Payload["code"], "%s: refused with %v", who, notice.Payload["code"])
	return notice
}

// party_enter's refusals come in R5's order. Each row also meets the guards
// after the one it expects, so only the earliest can answer. FS-BJNYC R5;
// AC row 4.
func TestPartyEnter_Refusals_InOrder(t *testing.T) {
	tests := []struct {
		name string
		// arranges the press and returns who presses
		setup func(t *testing.T, rig *partyEntryRig) (*websocket.Conn, *startSoloInbox)
		want  string
	}{
		{
			name: "in no party, at the door: not_member",
			setup: func(t *testing.T, rig *partyEntryRig) (*websocket.Conn, *startSoloInbox) {
				_, conn, inbox := rig.standing(t, "Wren", true)
				return conn, inbox
			},
			want: "not_member",
		},
		{
			name: "a member, not the leader, the leader off the gate and another member in a field: not_leader",
			setup: func(t *testing.T, rig *partyEntryRig) (*websocket.Conn, *startSoloInbox) {
				_, wrenConn, wrenInbox := rig.standing(t, "Wren", false)
				_, kaelenConn, kaelenInbox := rig.standing(t, "Kaelen", true)
				rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
				_, marlConn, marlInbox := rig.seated(t, "Marl", rig.meadows, 200, 200)
				rig.partied(t, wrenConn, wrenInbox, "Marl", marlConn, marlInbox)
				return kaelenConn, kaelenInbox
			},
			want: "not_leader",
		},
		{
			name: "the party in its run, the leader back in the town off the gate, the others still in it: locked",
			setup: func(t *testing.T, rig *partyEntryRig) (*websocket.Conn, *startSoloInbox) {
				p := newThreeParty(t, rig)
				intoItsRun(t, rig, p)
				backInTownEarly(t, rig, p.wren)
				rig.offTheGate(t, p.wren)
				return p.wrenConn, p.wrenInbox
			},
			want: "locked",
		},
		{
			name: "a check already open, the leader since off the gate and the member in a field: checking",
			setup: func(t *testing.T, rig *partyEntryRig) (*websocket.Conn, *startSoloInbox) {
				wren, kaelen, wrenConn, _, wrenInbox, _ := partyOfTwo(t, rig)
				sendEnter(rig.server, wrenConn)
				awaitReadyOutcome(t, wrenInbox, "Wren", "open")
				// no tick follows, so the check stays open whatever they do
				rig.offTheGate(t, wren)
				rig.moveTo(t, kaelen, rig.hub, rig.meadows, 200, 200)
				return wrenConn, wrenInbox
			},
			want: "checking",
		},
		{
			name: "the leader off the gate, the member in a field: not_at_gate",
			setup: func(t *testing.T, rig *partyEntryRig) (*websocket.Conn, *startSoloInbox) {
				_, wrenConn, wrenInbox := rig.standing(t, "Wren", false)
				_, kaelenConn, kaelenInbox := rig.seated(t, "Kaelen", rig.meadows, 200, 200)
				rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
				return wrenConn, wrenInbox
			},
			want: "not_at_gate",
		},
		{
			name: "the leader at the door, the member in a field: not_in_town",
			setup: func(t *testing.T, rig *partyEntryRig) (*websocket.Conn, *startSoloInbox) {
				_, wrenConn, wrenInbox := rig.standing(t, "Wren", true)
				_, kaelenConn, kaelenInbox := rig.seated(t, "Kaelen", rig.meadows, 200, 200)
				rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
				return wrenConn, wrenInbox
			},
			want: "not_in_town",
		},
		{
			name: "everything in order, Redis unreachable: unavailable",
			setup: func(t *testing.T, rig *partyEntryRig) (*websocket.Conn, *startSoloInbox) {
				_, _, wrenConn, _, wrenInbox, _ := partyOfTwo(t, rig)
				rig.mini.SetError("redis down")
				t.Cleanup(func() { rig.mini.SetError("") })
				return wrenConn, wrenInbox
			},
			want: "unavailable",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rig := newPartyEntryRig(t, &MockItemsClient{}, WithPartySize(3))
			conn, inbox := tt.setup(t, rig)
			before := startSoloSessionCount(rig.server)

			sendEnter(rig.server, conn)

			assertNoticeCode(t, inbox, "the presser", tt.want)
			assert.Equal(t, before, startSoloSessionCount(rig.server), "no run was built")
		})
	}
}

// not_in_town names every member who is not seated in this pod's town, in
// join order: one in a field, one disconnected (within their grace), one in a
// run, one on another pod. A member in the town is not named, and nobody is
// moved. FS-BJNYC R4, R5.6; AC rows 4, 5; User Story 10.
func TestPartyEnter_NotInTown_NamesEveryAbsentMemberInJoinOrder(t *testing.T) {
	rig := newPartyEntryRig(t, &MockItemsClient{}, WithPartySize(6))
	wren, wrenConn, wrenInbox := rig.standing(t, "Wren", true)
	_, kaelenConn, kaelenInbox := rig.standing(t, "Kaelen", false)
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	marl, marlConn, marlInbox := rig.seated(t, "Marl", rig.meadows, 200, 200)
	rig.partied(t, wrenConn, wrenInbox, "Marl", marlConn, marlInbox)
	ione, ioneConn, ioneInbox := rig.standing(t, "Ione", false)
	rig.partied(t, wrenConn, wrenInbox, "Ione", ioneConn, ioneInbox)
	brann, brannConn, brannInbox := rig.standing(t, "Brann", false)
	rig.partied(t, wrenConn, wrenInbox, "Brann", brannConn, brannInbox)
	rig.ghostMember(t, wren, "Sable")
	_, _, held := rig.server.holdForReconnect(ioneConn)
	require.True(t, held, "Ione drops and is held for the grace")
	rig.intoRun(t, brann)

	sendEnter(rig.server, wrenConn)

	notice := assertNoticeCode(t, wrenInbox, "Wren", "not_in_town")
	assert.Equal(t, []string{"Marl", "Ione", "Brann", "Sable"}, noticeNames(t, notice))
	assert.Equal(t, rig.meadows.ID, startSoloWorldOnRecord(t, rig.server, marl.ID), "Marl is not pulled back")
	assert.Equal(t, rig.hub.ID, startSoloWorldOnRecord(t, rig.server, ione.ID), "Ione keeps her place for the grace")
}

// The press is decided on the party as Redis holds it, not on the pod's cache:
// a lead handed over in Redis that this pod has not heard of yet refuses the
// old leader not_leader. FS-BJNYC R6; AC row 6.
func TestPartyEnter_DecidedOnRedisNotTheCache(t *testing.T) {
	rig := newPartyEntryRig(t, &MockItemsClient{})
	wren, kaelen, wrenConn, _, wrenInbox, _ := partyOfTwo(t, rig)
	store := partystore.NewRedis(rig.client)
	arrival, err := store.PartyOf(context.Background(), wren.ID, rig.partyClock.now())
	require.NoError(t, err)
	transferred, err := store.Transfer(context.Background(), arrival.Party.ID, wren.ID, kaelen.ID)
	require.NoError(t, err)
	require.Empty(t, transferred.Refusal)

	sendEnter(rig.server, wrenConn)

	assertNoticeCode(t, wrenInbox, "Wren", "not_leader")
}

// A leader already in a run is answered as start_solo answers them: resumed
// into their run, never refused. FS-BJNYC R5.
func TestPartyEnter_LeaderAlreadyInARun_Resumed(t *testing.T) {
	rig := newPartyEntryRig(t, &MockItemsClient{})
	wren, _, wrenConn, _, wrenInbox, _ := partyOfTwo(t, rig)
	rig.intoRun(t, wren)

	sendEnter(rig.server, wrenConn)

	reply, got := wrenInbox.await(string(constants.ActionWorldEntered), partyNoticeAction)
	require.True(t, got, "party_enter was never answered")
	require.Equal(t, string(constants.ActionWorldEntered), reply.Action)
	assert.Equal(t, wren.CurrentGameSessionId.String(), reply.Payload["session_id"], "the run they are in")
}

// A party of just the leader goes down at once: no popup, no wait; started,
// then world_entered into a run of one. FS-BJNYC R3; AC row 11; User Story 16.
func TestPartyEnter_PartyOfOne_EntersAtOnce(t *testing.T) {
	rig := newPartyEntryRig(t, &MockItemsClient{})
	wren, conn, inbox := rig.standing(t, "Wren", true)
	sendParty(rig.server, conn, partyCreateAction, map[string]interface{}{})
	awaitUpdate(t, inbox, "joined", wren.ID, "Wren")

	sendEnter(rig.server, conn)

	first := awaitReadyCheck(t, inbox, "Wren")
	assert.Equal(t, "started", first.outcome, "no open check is shown to a party of one")
	run := awaitRunEntered(t, rig.server, inbox, "Wren")
	assert.Equal(t, []uuid.UUID{wren.ID}, run.GetPlayerIDs())
}

// Answers that are not a waiting member's to the open check are ignored: a
// stale check id, a non-member, the leader, and a member answering twice. None
// is shown; the next thing anyone sees is the next real answer.
// FS-BJNYC R8, R9; AC row 8.
func TestPartyReady_StaleForeignAndRepeatedAnswers_Ignored(t *testing.T) {
	rig := newPartyEntryRig(t, &MockItemsClient{}, WithPartySize(3))
	wren, wrenConn, wrenInbox := rig.standing(t, "Wren", true)
	kaelen, kaelenConn, kaelenInbox := rig.standing(t, "Kaelen", false)
	rig.partied(t, wrenConn, wrenInbox, "Kaelen", kaelenConn, kaelenInbox)
	_, marlConn, marlInbox := rig.standing(t, "Marl", false)
	rig.partied(t, wrenConn, wrenInbox, "Marl", marlConn, marlInbox)
	_, strangerConn, _ := rig.standing(t, "Stranger", false)

	sendEnter(rig.server, wrenConn)
	open := awaitReadyCheck(t, wrenInbox, "Wren")
	sendReady(rig.server, kaelenConn, open.checkID, true)
	answered := awaitReadyCheck(t, wrenInbox, "Wren")
	require.Equal(t, "accepted", answered.stateOf(kaelen.ID))

	sendReady(rig.server, marlConn, uuid.NewString(), true)                                             // stale: no such check
	sendReady(rig.server, strangerConn, open.checkID, true)                                             // foreign: not on it
	sendReady(rig.server, wrenConn, open.checkID, false)                                                // the leader sends no answer
	sendReady(rig.server, kaelenConn, open.checkID, false)                                              // already answered
	sendParty(rig.server, marlConn, partyReadyAction, map[string]interface{}{"check_id": open.checkID}) // no accept
	sendReady(rig.server, marlConn, open.checkID, false)

	next := awaitReadyCheck(t, wrenInbox, "Wren")
	assert.Equal(t, "cancelled", next.outcome, "nothing was shown between the answers")
	assert.Equal(t, "declined", next.reason)
	assert.Equal(t, []string{"Marl"}, next.names)
	assert.Equal(t, "accepted", next.stateOf(wren.ID))
	assert.Equal(t, "accepted", next.stateOf(kaelen.ID), "Kaelen's second answer was not taken")
	cancelled := awaitReadyOutcome(t, marlInbox, "Marl", "cancelled")
	assert.Equal(t, "declined", cancelled.reason, "every member is told")
}

// Any no cancels the check, and every member still reachable is told why and
// whom it concerns: a decline, the 30 s running out, a member (the leader
// included) leaving the town or disconnecting, and a change of membership or
// leader. Nobody moves and no run is built. FS-BJNYC R10; AC row 9; User
// Stories 8, 9, 27.
func TestPartyReady_EachCauseCancels(t *testing.T) {
	tests := []struct {
		name string
		// does the cause, with the party: Wren (leader, at the door), Kaelen and
		// Marl in the town, the check open
		cause func(t *testing.T, rig *partyEntryRig, p *threeParty, checkID string)
		// whose inbox is read
		observer   func(p *threeParty) *startSoloInbox
		wantReason string
		wantNames  []string
	}{
		{
			name: "a member declines",
			cause: func(t *testing.T, rig *partyEntryRig, p *threeParty, checkID string) {
				sendReady(rig.server, p.kaelenConn, checkID, false)
			},
			observer:   func(p *threeParty) *startSoloInbox { return p.wrenInbox },
			wantReason: "declined", wantNames: []string{"Kaelen"},
		},
		{
			name: "30 s pass, one member accepted and one still waiting",
			cause: func(t *testing.T, rig *partyEntryRig, p *threeParty, checkID string) {
				sendReady(rig.server, p.kaelenConn, checkID, true)
				awaitReadyCheck(t, p.wrenInbox, "Wren")
				rig.partyClock.advance(30 * time.Second)
				rig.tick()
			},
			observer:   func(p *threeParty) *startSoloInbox { return p.kaelenInbox },
			wantReason: "timeout", wantNames: []string{"Marl"},
		},
		{
			name: "a member walks into a field",
			cause: func(t *testing.T, rig *partyEntryRig, p *threeParty, _ string) {
				rig.moveTo(t, p.kaelen, rig.hub, rig.meadows, 200, 200)
				rig.tick()
			},
			observer:   func(p *threeParty) *startSoloInbox { return p.kaelenInbox },
			wantReason: "left", wantNames: []string{"Kaelen"},
		},
		{
			name: "the leader walks into a field",
			cause: func(t *testing.T, rig *partyEntryRig, p *threeParty, _ string) {
				rig.moveTo(t, p.wren, rig.hub, rig.meadows, 200, 200)
				rig.tick()
			},
			observer:   func(p *threeParty) *startSoloInbox { return p.marlInbox },
			wantReason: "left", wantNames: []string{"Wren"},
		},
		{
			name: "a member goes back to the roster",
			cause: func(t *testing.T, rig *partyEntryRig, p *threeParty, _ string) {
				rig.hub.RemovePlayer(p.marl.ID.String())
				rig.server.setCurrentWorld(p.marl, uuid.Nil)
				rig.tick()
			},
			observer:   func(p *threeParty) *startSoloInbox { return p.wrenInbox },
			wantReason: "left", wantNames: []string{"Marl"},
		},
		{
			name: "a member disconnects",
			cause: func(t *testing.T, rig *partyEntryRig, p *threeParty, _ string) {
				rig.server.holdForReconnect(p.kaelenConn)
				rig.tick()
			},
			observer:   func(p *threeParty) *startSoloInbox { return p.wrenInbox },
			wantReason: "disconnected", wantNames: []string{"Kaelen"},
		},
		{
			name: "the leader disconnects",
			cause: func(t *testing.T, rig *partyEntryRig, p *threeParty, _ string) {
				rig.server.holdForReconnect(p.wrenConn)
				rig.tick()
			},
			observer:   func(p *threeParty) *startSoloInbox { return p.marlInbox },
			wantReason: "disconnected", wantNames: []string{"Wren"},
		},
		{
			name: "a member leaves the party",
			cause: func(t *testing.T, rig *partyEntryRig, p *threeParty, _ string) {
				sendParty(rig.server, p.marlConn, partyLeaveAction, map[string]interface{}{})
			},
			observer:   func(p *threeParty) *startSoloInbox { return p.kaelenInbox },
			wantReason: "changed",
		},
		{
			name: "the leader kicks a member",
			cause: func(t *testing.T, rig *partyEntryRig, p *threeParty, _ string) {
				sendParty(rig.server, p.wrenConn, partyKickAction, map[string]interface{}{"target_id": p.marl.ID.String()})
			},
			observer:   func(p *threeParty) *startSoloInbox { return p.kaelenInbox },
			wantReason: "changed",
		},
		{
			name: "the leader hands the lead over",
			cause: func(t *testing.T, rig *partyEntryRig, p *threeParty, _ string) {
				sendParty(rig.server, p.wrenConn, partyTransferAction, map[string]interface{}{"target_id": p.kaelen.ID.String()})
			},
			observer:   func(p *threeParty) *startSoloInbox { return p.marlInbox },
			wantReason: "changed",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rig := newPartyEntryRig(t, &MockItemsClient{}, WithPartySize(3))
			p := newThreeParty(t, rig)
			before := startSoloSessionCount(rig.server)
			sendEnter(rig.server, p.wrenConn)
			open := awaitReadyCheck(t, p.marlInbox, "Marl")
			awaitReadyCheck(t, p.kaelenInbox, "Kaelen")
			awaitReadyCheck(t, p.wrenInbox, "Wren")

			tt.cause(t, rig, p, open.checkID)

			cancelled := awaitReadyOutcome(t, tt.observer(p), "the observer", "cancelled")
			assert.Equal(t, open.checkID, cancelled.checkID)
			assert.Equal(t, tt.wantReason, cancelled.reason)
			if tt.wantNames == nil {
				assert.Empty(t, cancelled.names)
			} else {
				assert.Equal(t, tt.wantNames, cancelled.names)
			}
			assert.Equal(t, before, startSoloSessionCount(rig.server), "no run was built")
		})
	}
}

// An invite accepted while the check is open changes the membership: changed.
// FS-BJNYC R10; Edge States "Someone accepts an invite during the check".
func TestPartyReady_AnInviteAcceptedDuringTheCheck_Changed(t *testing.T) {
	rig := newPartyEntryRig(t, &MockItemsClient{}, WithPartySize(3))
	_, _, wrenConn, _, wrenInbox, kaelenInbox := partyOfTwo(t, rig)
	_, marlConn, marlInbox := rig.standing(t, "Marl", false)
	sendEnter(rig.server, wrenConn)
	awaitReadyCheck(t, kaelenInbox, "Kaelen")

	inviteID := rig.invited(t, wrenConn, "Marl", marlInbox)
	sendParty(rig.server, marlConn, partyAcceptAction, map[string]interface{}{"invite_id": inviteID})

	cancelled := awaitReadyOutcome(t, wrenInbox, "Wren", "cancelled")
	assert.Equal(t, "changed", cancelled.reason)
}

// The leader stepping off the gate zone within the town does not cancel the
// check, and neither does a tick before the 30 s run out: the member accepts and
// the party goes down. FS-BJNYC R10.
func TestPartyReady_LeaderOffTheGateWithinTheTown_NotCancelled(t *testing.T) {
	rig := newPartyEntryRig(t, &MockItemsClient{})
	wren, _, wrenConn, kaelenConn, wrenInbox, kaelenInbox := partyOfTwo(t, rig)
	sendEnter(rig.server, wrenConn)
	open := awaitReadyCheck(t, kaelenInbox, "Kaelen")

	rig.offTheGate(t, wren)
	rig.partyClock.advance(29 * time.Second)
	rig.tick()
	sendReady(rig.server, kaelenConn, open.checkID, true)

	started := awaitReadyOutcome(t, wrenInbox, "Wren", "started")
	assert.Equal(t, open.checkID, started.checkID)
	awaitRunEntered(t, rig.server, wrenInbox, "Wren")
}

// threeParty is Wren's party of three in the town: Wren at the Spire's door,
// Kaelen and Marl elsewhere in it.
type threeParty struct {
	wren, kaelen, marl                *types.Player
	wrenConn, kaelenConn, marlConn    *websocket.Conn
	wrenInbox, kaelenInbox, marlInbox *startSoloInbox
}

func newThreeParty(t *testing.T, rig *partyEntryRig) *threeParty {
	t.Helper()
	p := &threeParty{}
	p.wren, p.wrenConn, p.wrenInbox = rig.standing(t, "Wren", true)
	p.kaelen, p.kaelenConn, p.kaelenInbox = rig.standing(t, "Kaelen", false)
	rig.partied(t, p.wrenConn, p.wrenInbox, "Kaelen", p.kaelenConn, p.kaelenInbox)
	p.marl, p.marlConn, p.marlInbox = rig.standing(t, "Marl", false)
	rig.partied(t, p.wrenConn, p.wrenInbox, "Marl", p.marlConn, p.marlInbox)
	return p
}

// loadoutFailingFor reads every member's gear but one.
type loadoutFailingFor struct {
	MockItemsClient
	mu     sync.Mutex
	member string
}

func (l *loadoutFailingFor) failFor(memberID uuid.UUID) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.member = memberID.String()
}

func (l *loadoutFailingFor) GetLoadoutWithItems(ctx context.Context, req *itemspb.GetLoadoutWithItemsRequest) (*itemspb.GetLoadoutWithItemsResponse, error) {
	l.mu.Lock()
	failing := l.member == req.GetMemberId()
	l.mu.Unlock()
	if failing {
		return nil, errors.New("items-service cannot read this one")
	}
	return l.MockItemsClient.GetLoadoutWithItems(ctx, req)
}

// gatedLoadout holds every gear read made while it is armed until the test
// opens the gate. Unarmed, it reads at once: the worlds read gear as they seat
// a player too.
type gatedLoadout struct {
	MockItemsClient
	mu    sync.Mutex
	armed bool
	asked chan struct{}
	open  chan struct{}
}

func newGatedLoadout() *gatedLoadout {
	return &gatedLoadout{asked: make(chan struct{}, 8), open: make(chan struct{})}
}

func (g *gatedLoadout) arm(armed bool) {
	g.mu.Lock()
	defer g.mu.Unlock()
	g.armed = armed
}

func (g *gatedLoadout) GetLoadoutWithItems(ctx context.Context, req *itemspb.GetLoadoutWithItemsRequest) (*itemspb.GetLoadoutWithItemsResponse, error) {
	g.mu.Lock()
	armed := g.armed
	g.mu.Unlock()
	if !armed {
		return g.MockItemsClient.GetLoadoutWithItems(ctx, req)
	}
	g.asked <- struct{}{}
	select {
	case <-g.open:
	case <-ctx.Done():
		return nil, ctx.Err()
	}
	return g.MockItemsClient.GetLoadoutWithItems(ctx, req)
}

// When everyone has accepted, the start still fails closed: a member whose gear
// cannot be read cancels it, named; Redis unreachable at the party's re-read
// cancels it with no names; a member who left the town while the gear was read
// cancels it, named. Nobody leaves the town. FS-BJNYC R11; AC row 10.
func TestPartyReady_StartFails_Cancelled(t *testing.T) {
	t.Run("a member's gear unreadable: failed, named", func(t *testing.T) {
		items := &loadoutFailingFor{}
		rig := newPartyEntryRig(t, items)
		wren, kaelen, wrenConn, kaelenConn, wrenInbox, kaelenInbox := partyOfTwo(t, rig)
		items.failFor(kaelen.ID)
		before := startSoloSessionCount(rig.server)
		sendEnter(rig.server, wrenConn)
		open := awaitReadyCheck(t, kaelenInbox, "Kaelen")

		sendReady(rig.server, kaelenConn, open.checkID, true)

		cancelled := awaitReadyOutcome(t, wrenInbox, "Wren", "cancelled")
		assert.Equal(t, "failed", cancelled.reason)
		assert.Equal(t, []string{"Kaelen"}, cancelled.names)
		assert.Equal(t, "failed", awaitReadyOutcome(t, kaelenInbox, "Kaelen", "cancelled").reason)
		assert.Equal(t, before, startSoloSessionCount(rig.server), "no run was built")
		assert.True(t, rig.hub.HasPlayer(wren.ID) && rig.hub.HasPlayer(kaelen.ID), "nobody leaves the town")
	})

	t.Run("Redis unreachable at the re-read: failed, no names", func(t *testing.T) {
		rig := newPartyEntryRig(t, &MockItemsClient{})
		wren, kaelen, wrenConn, kaelenConn, wrenInbox, kaelenInbox := partyOfTwo(t, rig)
		before := startSoloSessionCount(rig.server)
		sendEnter(rig.server, wrenConn)
		open := awaitReadyCheck(t, kaelenInbox, "Kaelen")
		rig.mini.SetError("redis down")
		t.Cleanup(func() { rig.mini.SetError("") })

		sendReady(rig.server, kaelenConn, open.checkID, true)

		cancelled := awaitReadyOutcome(t, wrenInbox, "Wren", "cancelled")
		assert.Equal(t, "failed", cancelled.reason)
		assert.Empty(t, cancelled.names)
		assert.Equal(t, before, startSoloSessionCount(rig.server), "no run was built")
		assert.True(t, rig.hub.HasPlayer(wren.ID) && rig.hub.HasPlayer(kaelen.ID), "nobody leaves the town")
	})

	t.Run("a member left the town while the gear was read: left, named", func(t *testing.T) {
		items := newGatedLoadout()
		rig := newPartyEntryRig(t, items)
		_, kaelen, wrenConn, kaelenConn, wrenInbox, kaelenInbox := partyOfTwo(t, rig)
		before := startSoloSessionCount(rig.server)
		sendEnter(rig.server, wrenConn)
		open := awaitReadyCheck(t, kaelenInbox, "Kaelen")
		items.arm(true)
		sendReady(rig.server, kaelenConn, open.checkID, true)
		<-items.asked
		<-items.asked // both members' gear is being read
		items.arm(false)

		rig.moveTo(t, kaelen, rig.hub, rig.meadows, 200, 200)
		close(items.open)

		cancelled := awaitReadyOutcome(t, wrenInbox, "Wren", "cancelled")
		assert.Equal(t, "left", cancelled.reason)
		assert.Equal(t, []string{"Kaelen"}, cancelled.names)
		assert.Equal(t, before, startSoloSessionCount(rig.server), "no run was built")
	})

	t.Run("a party of one with unreadable gear: failed, named", func(t *testing.T) {
		rig := newPartyEntryRig(t, &failingLoadoutItems{})
		wren, conn, inbox := rig.standing(t, "Wren", true)
		sendParty(rig.server, conn, partyCreateAction, map[string]interface{}{})
		awaitUpdate(t, inbox, "joined", wren.ID, "Wren")

		sendEnter(rig.server, conn)

		cancelled := awaitReadyOutcome(t, inbox, "Wren", "cancelled")
		assert.Equal(t, "failed", cancelled.reason)
		assert.Equal(t, []string{"Wren"}, cancelled.names)
		assert.True(t, rig.hub.HasPlayer(wren.ID), "still in the town")
	})
}

// A member whose record expired while the gear was read is removed by the
// party's re-read: the cache takes the party without them, which cancels the
// check (changed), and the re-read's own roster check then finds it gone.
// Every member is told cancelled once, not twice. FS-BJNYC R10, R11.
func TestPartyReady_MemberSweptAtTheReread_CancelledOnce(t *testing.T) {
	items := newGatedLoadout()
	rig := newPartyEntryRig(t, items, WithPartySize(3))
	p := newThreeParty(t, rig)
	sendEnter(rig.server, p.wrenConn)
	open := awaitReadyCheck(t, p.marlInbox, "Marl")
	items.arm(true)
	sendReady(rig.server, p.kaelenConn, open.checkID, true)
	sendReady(rig.server, p.marlConn, open.checkID, true)
	for range 3 {
		<-items.asked // every member's gear is being read
	}
	items.arm(false)

	expireRecord(t, rig, p.marl.ID)
	close(items.open)

	for _, member := range []struct {
		name  string
		inbox *startSoloInbox
	}{{"Wren", p.wrenInbox}, {"Kaelen", p.kaelenInbox}, {"Marl", p.marlInbox}} {
		cancels := 0
		for _, msg := range collectInbox(member.inbox) {
			if msg.Action == partyReadyCheckAction && decodeReadyCheck(t, msg).outcome == "cancelled" {
				cancels++
			}
		}
		assert.Equal(t, 1, cancels, "%s is told the check cancelled exactly once", member.name)
	}
}

// expireRecord backdates member's record in their party, so the next read of
// the party removes them as gone RecordTTL unseen (FS-NCC9J R17).
func expireRecord(t *testing.T, rig *partyEntryRig, member uuid.UUID) {
	t.Helper()
	for _, key := range rig.mini.Keys() {
		if strings.HasSuffix(key, ":seen") && rig.mini.HGet(key, member.String()) != "" {
			rig.mini.HSet(key, member.String(), "0")
			return
		}
	}
	t.Fatalf("no record of %s", member)
}
