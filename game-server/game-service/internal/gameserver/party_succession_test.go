package gameserver

import (
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-BJNYC §Requirements R16, R17; §Acceptance Criteria row 14; §User Stories 20, 21; §Edge States
// "Leader drops in the run in a party of one", "Leader drops, and every other member is also
// disconnected". I-BJNYC-7.
//
// When the leader's connection drops while they are in their party's run, the earliest-joined
// other member leads at once, not after the reconnect grace: by the transfer script, every member
// told as for any change of leader, and never refused by the lock. The old leader keeps their seat
// for the grace and, back within it, is a member in the run. A leader dropping anywhere else is
// left to FS-NCC9J's rules.

// dropAbnormally is a connection lost without a close the member chose: the read error a reset or
// a vanished network gives.
var dropAbnormally = &websocket.CloseError{Code: websocket.CloseAbnormalClosure}

// standingOnWire seats a member in the hub on a real connection, one a read error can drop, at
// the Spire's door or away from it.
func (r *partyEntryRig) standingOnWire(t *testing.T, name string, atGate bool) (*types.Player, *websocket.Conn, *startSoloInbox) {
	t.Helper()
	conn, _ := wsPair(t)
	player := &types.Player{ID: uuid.New(), Username: name + "-account"}
	player.Character = r.characters.give(player.ID, "warrior", name, 3, 900)
	registerTestConn(r.server, conn, player)
	inbox := startSoloListen(t, r.server, conn)
	x, y := awayFromGateX, awayFromGateY
	if atGate {
		x, y = spireGateX, spireGateY
	}
	r.hub.AddPlayerAt(player.ID, player.Character, "", x, y)
	r.server.setCurrentWorld(player, r.hub.ID)
	require.Eventually(t, func() bool {
		return r.hub.AtGate(player.ID, components.GateDestinationSpire) == atGate
	}, startSoloSettle, 10*time.Millisecond, "the hub never measured %s where they were seated", name)
	return player, conn, inbox
}

// newThreePartyLeaderOnWire is newThreeParty with Wren, the leader, on a real connection: Wren
// invited Kaelen, then Marl, so Kaelen joined first.
func newThreePartyLeaderOnWire(t *testing.T, rig *partyEntryRig) *threeParty {
	t.Helper()
	p := &threeParty{}
	p.wren, p.wrenConn, p.wrenInbox = rig.standingOnWire(t, "Wren", true)
	p.kaelen, p.kaelenConn, p.kaelenInbox = rig.standing(t, "Kaelen", false)
	rig.partied(t, p.wrenConn, p.wrenInbox, "Kaelen", p.kaelenConn, p.kaelenInbox)
	p.marl, p.marlConn, p.marlInbox = rig.standing(t, "Marl", false)
	rig.partied(t, p.wrenConn, p.wrenInbox, "Marl", p.marlConn, p.marlInbox)
	return p
}

// The leader drops inside the party's run: Kaelen, who joined before Marl, leads at once, well
// inside the 30 s grace, and both members are told the lead passed, the party in Redis agreeing.
// The lock (I-BJNYC-6) is in force throughout and does not refuse it. FS-BJNYC R17; AC row 14;
// User Story 20.
func TestPartySuccession_LeaderDropsInItsRun_EarliestJoinedLeadsAtOnce(t *testing.T) {
	rig := newPartyEntryRig(t, &MockItemsClient{}, WithPartySize(3))
	p := newThreePartyLeaderOnWire(t, rig)
	intoItsRun(t, rig, p)

	rig.server.handleReadError(p.wrenConn, dropAbnormally)

	for who, inbox := range map[string]*startSoloInbox{"Kaelen": p.kaelenInbox, "Marl": p.marlInbox} {
		leader := awaitUpdate(t, inbox, "leader", p.kaelen.ID, who)
		assert.Equal(t, p.kaelen.ID.String(), leader.Payload["leader_id"], who)
		assert.Equal(t, []string{p.wren.ID.String(), p.kaelen.ID.String(), p.marl.ID.String()}, memberIDsOf(t, leader),
			"%s: the old leader is still a member", who)
	}
	assert.Equal(t, p.kaelen.ID, partyInRedis(t, rig, p.kaelen.ID).Leader)
	assert.Equal(t, constants.Reconnecting, connStateOf(t, rig.server, p.wren.ID), "Wren is held for the grace")
}

// Every other member already disconnected when the leader drops: the earliest-joined still takes
// the lead, being a member until FS-NCC9J's expiry. FS-BJNYC Edge States "Leader drops, and every
// other member is also disconnected".
func TestPartySuccession_EveryoneElseDisconnected_EarliestJoinedStillLeads(t *testing.T) {
	rig := newPartyEntryRig(t, &MockItemsClient{}, WithPartySize(3))
	p := newThreePartyLeaderOnWire(t, rig)
	intoItsRun(t, rig, p)
	for _, conn := range []*websocket.Conn{p.marlConn, p.kaelenConn} {
		_, _, held := rig.server.holdForReconnect(conn)
		require.True(t, held)
	}

	rig.server.handleReadError(p.wrenConn, dropAbnormally)

	require.Eventually(t, func() bool {
		return partyInRedis(t, rig, p.marl.ID).Leader == p.kaelen.ID
	}, startSoloSettle, 10*time.Millisecond, "Kaelen never took the lead")
}

// The old leader reconnects within the grace: seated back in the run, a member under the new
// leader, and the lead does not come back to them. FS-BJNYC R16, R17; User Story 21.
func TestPartySuccession_OldLeaderReconnectsWithinGrace_BackInTheRunAsAMember(t *testing.T) {
	rig := newPartyEntryRig(t, &MockItemsClient{}, WithPartySize(3))
	p := newThreePartyLeaderOnWire(t, rig)
	run := intoItsRun(t, rig, p)
	rig.server.handleReadError(p.wrenConn, dropAbnormally)
	awaitUpdate(t, p.kaelenInbox, "leader", p.kaelen.ID, "Kaelen")

	back := &websocket.Conn{}
	_, mapped := rig.server.MapConnToPlayer(back, p.wren.ID, make(chan interface{}, clientWriterBuffer))
	require.True(t, mapped, "Wren reconnects within the grace")
	rig.tick()
	rig.settle(t)

	assert.Equal(t, constants.Connected, connStateOf(t, rig.server, p.wren.ID))
	assert.Equal(t, run.ID, startSoloWorldOnRecord(t, rig.server, p.wren.ID), "back in the run")
	assert.True(t, run.HasPlayer(p.wren.ID), "their seat was kept")
	after := partyInRedis(t, rig, p.wren.ID)
	assert.Equal(t, p.kaelen.ID, after.Leader, "Wren is a member now")
	assert.Equal(t, []uuid.UUID{p.wren.ID, p.kaelen.ID, p.marl.ID}, memberIDs(after), "nobody left")
}

// A party shrunk to one in its run (a party of one never enters, R3) drops: nobody to pass to, the
// grace runs as today. FS-BJNYC Edge States "Leader drops in the run in a party of one".
func TestPartySuccession_PartyOfOne_NoTransfer(t *testing.T) {
	rig := newPartyEntryRig(t, &MockItemsClient{})
	wren, conn, inbox := rig.standingOnWire(t, "Wren", true)
	kaelen, kaelenConn, kaelenInbox := rig.standing(t, "Kaelen", false)
	rig.partied(t, conn, inbox, "Kaelen", kaelenConn, kaelenInbox)
	run := pairIntoItsRun(t, rig, conn, kaelenConn, inbox, kaelenInbox)
	shrunkToOne(t, rig, wren.ID, kaelen.ID)

	rig.server.handleReadError(conn, dropAbnormally)
	rig.settle(t)

	assert.Equal(t, wren.ID, partyInRedis(t, rig, wren.ID).Leader, "still Wren's party")
	assert.Equal(t, constants.Reconnecting, connStateOf(t, rig.server, wren.ID), "held for the grace")
	assert.True(t, run.HasPlayer(wren.ID), "their seat is kept")
}

// A leader dropping anywhere but inside their party's run keeps the lead: in the town, in a field,
// and back in the town early while the party is still in its run. FS-NCC9J's away and removal
// rules decide there. FS-BJNYC R17; issue AC "outside a party run".
func TestPartySuccession_LeaderDropsOutsideTheRun_LeadStays(t *testing.T) {
	for _, where := range []string{"in the town", "in a field", "back in the town early"} {
		t.Run(where, func(t *testing.T) {
			rig := newPartyEntryRig(t, &MockItemsClient{}, WithPartySize(3))
			p := newThreePartyLeaderOnWire(t, rig)
			switch where {
			case "in a field":
				rig.moveTo(t, p.wren, rig.hub, rig.meadows, 200, 200)
			case "back in the town early":
				intoItsRun(t, rig, p)
				backInTownEarly(t, rig, p.wren)
			}

			rig.server.handleReadError(p.wrenConn, dropAbnormally)
			rig.settle(t)

			assert.Equal(t, p.wren.ID, partyInRedis(t, rig, p.kaelen.ID).Leader, "Wren still leads")
			assertNoLeaderUpdate(t, p.kaelenInbox, "Kaelen")
		})
	}
}

// assertNoLeaderUpdate fails if a party_update telling a new leader reaches the inbox within
// chatSilence.
func assertNoLeaderUpdate(t *testing.T, inbox *startSoloInbox, who string) {
	t.Helper()
	deadline := time.After(chatSilence)
	for {
		select {
		case msg := <-inbox.messages:
			if msg.Action == partyUpdateAction && msg.Payload["reason"] == "leader" {
				t.Fatalf("%s should hear of no new leader; got %v", who, msg.Payload)
			}
		case <-deadline:
			return
		}
	}
}

// A member who does not lead drops in the run: the lead stays where it is. FS-BJNYC R16, R17.
func TestPartySuccession_MemberDropsInItsRun_LeadStays(t *testing.T) {
	rig := newPartyEntryRig(t, &MockItemsClient{}, WithPartySize(3))
	p := &threeParty{}
	p.wren, p.wrenConn, p.wrenInbox = rig.standing(t, "Wren", true)
	p.kaelen, p.kaelenConn, p.kaelenInbox = rig.standingOnWire(t, "Kaelen", false)
	rig.partied(t, p.wrenConn, p.wrenInbox, "Kaelen", p.kaelenConn, p.kaelenInbox)
	p.marl, p.marlConn, p.marlInbox = rig.standing(t, "Marl", false)
	rig.partied(t, p.wrenConn, p.wrenInbox, "Marl", p.marlConn, p.marlInbox)
	intoItsRun(t, rig, p)

	rig.server.handleReadError(p.kaelenConn, dropAbnormally)
	rig.settle(t)

	assert.Equal(t, p.wren.ID, partyInRedis(t, rig, p.wren.ID).Leader, "Wren still leads")
	assertNoLeaderUpdate(t, p.marlInbox, "Marl")
}

// The cache has let the party go by the time the leader's drop reaches the loop: the roster the
// run went down with names the earliest-joined, and the lead still passes. FS-BJNYC R14, R17.
func TestPartySuccession_CacheLetThePartyGo_RosterStandsIn(t *testing.T) {
	rig := newPartyEntryRig(t, &MockItemsClient{}, WithPartySize(3))
	p := newThreePartyLeaderOnWire(t, rig)
	intoItsRun(t, rig, p)
	partyID := partyInRedis(t, rig, p.wren.ID).ID
	rig.onLoop(t, func(reg *partyRegistry) { reg.cache.drop(partyID) })

	rig.server.handleReadError(p.wrenConn, dropAbnormally)
	rig.settle(t)

	assert.Equal(t, p.kaelen.ID, partyInRedis(t, rig, p.kaelen.ID).Leader)
}
