package gameserver

import (
	"context"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/partystore"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-BJNYC §Requirements R19, R5.3; §Acceptance Criteria row 13; §User Stories 18, 19, 25;
// §Edge States "Member who left the run early", "Leader leaves the run early and presses Enter
// as a party again". I-BJNYC-6.
//
// From the moment a party's party-entry run starts until that run ends, nobody leaves the party,
// is kicked from it or is handed its lead: party_leave, party_kick and party_transfer are refused
// locked, from members inside the run and from one already back in the town. The pod reads its
// own record of the run; once the run is gone, the actions work again.

// intoItsRun takes p down the Spire as a party: Wren presses Enter, Kaelen and Marl accept, and
// all three are seated in one run on this pod, which is returned.
func intoItsRun(t *testing.T, rig *partyEntryRig, p *threeParty) *game.Session {
	t.Helper()
	sendEnter(rig.server, p.wrenConn)
	open := awaitReadyOutcome(t, p.kaelenInbox, "Kaelen", "open")
	sendReady(rig.server, p.kaelenConn, open.checkID, true)
	sendReady(rig.server, p.marlConn, open.checkID, true)
	run := awaitRunEntered(t, rig.server, p.wrenInbox, "Wren")
	awaitRunEntered(t, rig.server, p.kaelenInbox, "Kaelen")
	awaitRunEntered(t, rig.server, p.marlInbox, "Marl")
	return run
}

// backInTownEarly has player fall where they stand (forfeit_run) and, once the run's tick has
// eliminated them, leave it (leave_run): they stand in the town while their party is still in the
// run.
func backInTownEarly(t *testing.T, rig *partyEntryRig, player *types.Player) {
	t.Helper()
	require.NoError(t, rig.server.ForfeitRun(player), "%s falls", player.Character.Name)
	require.Eventually(t, func() bool {
		_, err := rig.server.LeaveRun(player)
		return err == nil
	}, startSoloSettle, 10*time.Millisecond, "%s never left the run", player.Character.Name)
	require.True(t, rig.hub.HasPlayer(player.ID), "%s stands in the town", player.Character.Name)
}

// endRun ends run as its rules end it: everyone back in the town, then the run gone from the pod.
// No registry tick follows.
func endRun(t *testing.T, rig *partyEntryRig, run *game.Session) {
	t.Helper()
	rig.server.ReturnPlayersToHub(run.ID)
	require.NoError(t, rig.server.CloseSession(run.ID))
	run.Shutdown()
}

// partyInRedis is Wren's party as Redis now holds it.
func partyInRedis(t *testing.T, rig *partyEntryRig, member uuid.UUID) partystore.Party {
	t.Helper()
	res, err := partystore.NewRedis(rig.client).PartyOf(context.Background(), member, rig.partyClock.now())
	require.NoError(t, err)
	require.True(t, res.In, "still in the party")
	return res.Party
}

// lockedAction is one of the three actions the lock refuses, sent by one member of p.
type lockedAction struct {
	name string
	// who sends what
	send func(p *threeParty) (conn *websocket.Conn, inbox *startSoloInbox, action string, payload map[string]interface{})
}

func lockedActions() []lockedAction {
	return []lockedAction{
		{
			name: "a member leaves",
			send: func(p *threeParty) (*websocket.Conn, *startSoloInbox, string, map[string]interface{}) {
				return p.kaelenConn, p.kaelenInbox, partyLeaveAction, map[string]interface{}{}
			},
		},
		{
			name: "the leader leaves",
			send: func(p *threeParty) (*websocket.Conn, *startSoloInbox, string, map[string]interface{}) {
				return p.wrenConn, p.wrenInbox, partyLeaveAction, map[string]interface{}{}
			},
		},
		{
			name: "the leader kicks a member",
			send: func(p *threeParty) (*websocket.Conn, *startSoloInbox, string, map[string]interface{}) {
				return p.wrenConn, p.wrenInbox, partyKickAction, map[string]interface{}{"target_id": p.kaelen.ID.String()}
			},
		},
		{
			name: "the leader hands the lead to a member",
			send: func(p *threeParty) (*websocket.Conn, *startSoloInbox, string, map[string]interface{}) {
				return p.wrenConn, p.wrenInbox, partyTransferAction, map[string]interface{}{"target_id": p.kaelen.ID.String()}
			},
		},
	}
}

// While the party is in its run, leave, kick and transfer are refused locked, whoever sends them,
// whether they are still inside the run or back in the town early; nobody is told of a change, and
// the party in Redis is as it went down. FS-BJNYC R19; AC row 13; Edge States "Member who left the
// run early".
func TestPartyLock_InItsRun_LeaveKickTransferRefusedLocked(t *testing.T) {
	for _, where := range []string{"inside the run", "back in the town early"} {
		for _, act := range lockedActions() {
			t.Run(act.name+", "+where, func(t *testing.T) {
				rig := newPartyEntryRig(t, &MockItemsClient{}, WithPartySize(3))
				p := newThreeParty(t, rig)
				intoItsRun(t, rig, p)
				before := partyInRedis(t, rig, p.wren.ID)
				if where == "back in the town early" {
					backInTownEarly(t, rig, p.wren)
					backInTownEarly(t, rig, p.kaelen)
				}

				conn, inbox, action, payload := act.send(p)
				sendParty(rig.server, conn, action, payload)

				assertNoticeCode(t, inbox, "the sender", "locked")
				assertNoParty(t, p.marlInbox, partyUpdateAction, "Marl: nothing changed")
				after := partyInRedis(t, rig, p.wren.ID)
				assert.Equal(t, before.Leader, after.Leader, "the lead stays")
				assert.Equal(t, memberIDs(before), memberIDs(after), "everyone stays")
			})
		}
	}
}

// Once the party's run ends, leave, kick and transfer work again at once, with no tick between.
// FS-BJNYC R19; AC row 13.
func TestPartyLock_RunEnded_LeaveKickTransferWorkAgain(t *testing.T) {
	want := map[string]string{
		partyLeaveAction:    "left",
		partyKickAction:     "kicked",
		partyTransferAction: "leader",
	}
	for _, act := range lockedActions() {
		t.Run(act.name, func(t *testing.T) {
			rig := newPartyEntryRig(t, &MockItemsClient{}, WithPartySize(3))
			p := newThreeParty(t, rig)
			run := intoItsRun(t, rig, p)
			endRun(t, rig, run)

			conn, _, action, payload := act.send(p)
			sendParty(rig.server, conn, action, payload)

			subject := p.kaelen.ID
			if action == partyLeaveAction && conn == p.wrenConn {
				subject = p.wren.ID
			}
			awaitUpdate(t, p.marlInbox, want[action], subject, "Marl")
		})
	}
}

// The lock is the party's own: another party, in the town while the first is in its run, leaves
// as it always has. FS-BJNYC R19; AC row 13 ("a party not in a run is unaffected").
func TestPartyLock_AnotherPartyNotInARun_Unaffected(t *testing.T) {
	rig := newPartyEntryRig(t, &MockItemsClient{}, WithPartySize(3))
	p := newThreeParty(t, rig)
	intoItsRun(t, rig, p)
	_, idrisConn, idrisInbox := rig.standing(t, "Idris", false)
	oren, orenConn, orenInbox := rig.standing(t, "Oren", false)
	rig.partied(t, idrisConn, idrisInbox, "Oren", orenConn, orenInbox)

	sendParty(rig.server, orenConn, partyLeaveAction, map[string]interface{}{})

	awaitUpdate(t, idrisInbox, "left", oren.ID, "Idris")
}

// A leader back in the town early, at the Spire's door again, presses Enter as a party: refused
// locked, ahead of not_in_town (the others are still in the run), and no run is built.
// FS-BJNYC R5.3; Edge States "Leader leaves the run early and presses Enter as a party again".
func TestPartyLock_LeaderBackInTownPressesEnter_Locked(t *testing.T) {
	rig := newPartyEntryRig(t, &MockItemsClient{}, WithPartySize(3))
	p := newThreeParty(t, rig)
	intoItsRun(t, rig, p)
	backInTownEarly(t, rig, p.wren)
	rig.moveTo(t, p.wren, rig.hub, rig.hub, spireGateX, spireGateY)
	require.Eventually(t, func() bool {
		return rig.server.AtSpireGate(p.wren.ID)
	}, startSoloSettle, 10*time.Millisecond, "the hub never measured Wren at the door")
	before := startSoloSessionCount(rig.server)

	sendEnter(rig.server, p.wrenConn)

	assertNoticeCode(t, p.wrenInbox, "Wren", "locked")
	assert.Equal(t, before, startSoloSessionCount(rig.server), "no run was built")
}
