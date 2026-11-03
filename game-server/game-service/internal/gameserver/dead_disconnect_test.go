package gameserver

import (
	"sync"
	"sync/atomic"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-QPDKN §Requirements 25–28, amended 2026-11-03 ("他斷線就當他按下離開了"); §Acceptance
// Criteria "A dead delver's disconnect is a leave"; §Edge States "A dead delver's disconnect".
// I-QPDKN-8.
//
// A dead delver whose connection closes, however it closes, leaves the run at that moment through
// LeaveRun, exactly as a leave_run would: the run marks them departed and keeps their body for its
// settlement, the hub seats them, and their record names the hub. The rest of the drop is a hub
// member's. An escaped delver and a delver still in play drop exactly as before (R26).
//
// The drop is driven through handleReadError on a real connection, as the reader hits it. Deaths
// are made the way leave_run_test makes them, through AddComponent, and waited on until the tick
// has seen them.

// The three closes a dead delver's drop may arrive as.
var (
	deadDropAbnormal  = &websocket.CloseError{Code: websocket.CloseAbnormalClosure}
	deadDropGoingAway = &websocket.CloseError{Code: websocket.CloseGoingAway}
	deadDropNormal    = &websocket.CloseError{Code: websocket.CloseNormalClosure}
)

// deadDropCloses is every close, named, for the tables below.
var deadDropCloses = []struct {
	name string
	err  error
}{
	{"abnormal close", deadDropAbnormal},
	{"going away", deadDropGoingAway},
	{"normal close", deadDropNormal},
}

// deadDropParty is two delvers in a live run, each on a real connection a read error can close.
type deadDropParty struct {
	server     *Server
	emitter    *resolvedDropEmitter
	hub        *game.Session
	run        *game.Session
	wren       *types.Player
	wrenConn   *websocket.Conn
	wrenInbox  *leaveRunInbox
	kaelen     *types.Player
	kaelenConn *websocket.Conn
}

// deadDropOnWire seats a fresh member in the hub on a real connection and listens on it.
func deadDropOnWire(t *testing.T, server *Server, name string) (*types.Player, *websocket.Conn, *leaveRunInbox) {
	t.Helper()

	conn, _ := wsPair(t)
	player := &types.Player{ID: uuid.New(), Username: name}
	registerTestConn(server, conn, player)

	_, err := server.JoinHub(conn, types.CharacterInPlay{ID: uuid.New(), Class: "mage", Name: name})
	require.NoError(t, err)

	return player, conn, leaveRunListen(t, server, conn)
}

// deadDropRun seats Wren and Kaelen in a run from the hub, on a server built with opts.
func deadDropRun(t *testing.T, opts ...Option) *deadDropParty {
	t.Helper()

	server, emitter := resolvedDropServer(t, opts...)
	return deadDropRunOn(t, server, emitter)
}

// deadDropRunOn seats Wren and Kaelen in a run from server's hub, its run-end publishes spied on
// by emitter.
func deadDropRunOn(t *testing.T, server *Server, emitter *resolvedDropEmitter) *deadDropParty {
	t.Helper()

	hub, ok := server.HubSession()
	require.True(t, ok)

	p := &deadDropParty{server: server, emitter: emitter, hub: hub}
	p.wren, p.wrenConn, p.wrenInbox = deadDropOnWire(t, server, "Wren")
	p.kaelen, p.kaelenConn, _ = deadDropOnWire(t, server, "Kaelen")

	p.run = server.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: []*types.Player{p.wren, p.kaelen}})
	t.Cleanup(p.run.Shutdown)

	return p
}

// killWren kills Wren and waits for the tick to see it.
func (p *deadDropParty) killWren(t *testing.T) {
	t.Helper()

	leaveRunKill(t, p.run, p.wren.ID)
	p.wrenInbox.awaitFrame(t, p.run.ID, "the tick has seen the death", func(frame *types.ClientGameState) bool {
		return frame.CurrentPlayer != nil && frame.CurrentPlayer.CurrentHealth == 0
	})
}

// strandWren leaves Wren behind on a floor below (FS-F6F88) and waits for the tick.
func (p *deadDropParty) strandWren(t *testing.T) {
	t.Helper()

	leaveRunStrand(t, p.run, p.wren.ID)
	p.wrenInbox.awaitTicks(t, p.run.ID, 2)
}

// deadDropAwaitingSettlement reports whether the member is kept off-connection for a run's
// settlement.
func deadDropAwaitingSettlement(server *Server, memberID uuid.UUID) bool {
	server.mu.RLock()
	defer server.mu.RUnlock()

	_, kept := server.awaitingSettlement[memberID]
	return kept
}

// deadDropHold is the reconnect grace the member is held under, as the read error took it.
func deadDropHold(t *testing.T, server *Server, memberID uuid.UUID) graceHold {
	t.Helper()

	server.mu.RLock()
	defer server.mu.RUnlock()

	hold, held := server.graceHolds[memberID]
	require.True(t, held, "the member is held for a reconnect grace")
	return hold
}

// A dead delver's drop is their leave, at once, whatever closed the connection: the run keeps
// their body, and they are a hub member from then on. Held for the hub's grace after an abnormal
// or going-away close; gone, hub body and record, after a normal one. A delver left behind on a
// lower floor counts as dead. FS-QPDKN R25; AC rows 1, 2, 8.
func TestDeadDrop_LeavesTheRunAtOnce(t *testing.T) {
	resolves := []struct {
		name    string
		resolve func(p *deadDropParty, t *testing.T)
	}{
		{"dead", (*deadDropParty).killWren},
		{"left behind", (*deadDropParty).strandWren},
	}

	for _, resolved := range resolves {
		for _, closed := range deadDropCloses {
			t.Run(resolved.name+", "+closed.name, func(t *testing.T) {
				p := deadDropRun(t)
				resolved.resolve(p, t)

				p.server.handleReadError(p.wrenConn, closed.err)

				assert.True(t, p.run.HasPlayer(p.wren.ID), "the run keeps the body for its settlement")
				assert.False(t, deadDropAwaitingSettlement(p.server, p.wren.ID), "nobody is kept off-connection for the run")
				_, mapped := p.server.GetPlayerFromConn(p.wrenConn)
				assert.False(t, mapped, "the closed connection is unmapped")

				if closed.err == deadDropNormal {
					_, onRecord := p.server.PlayerByID(p.wren.ID)
					assert.False(t, onRecord, "a normal close ends their stay")
					assert.Zero(t, entityCountFor(p.hub.EntityManager.GetAllEntities(), p.wren.ID),
						"and takes the hub body the leave seated, not the run's")
				} else {
					assert.Equal(t, p.hub.ID, recordOf(t, p.server, p.wren.ID).CurrentGameSessionId, "their record names the hub")
					assert.Equal(t, constants.Reconnecting, connStateOf(t, p.server, p.wren.ID), "held for the hub's grace")
					assert.Equal(t, 1, entityCountFor(p.hub.EntityManager.GetAllEntities(), p.wren.ID), "with one body in the hub")
				}

				assert.True(t, p.run.HasPlayer(p.kaelen.ID), "the teammate is untouched")
				assert.Equal(t, p.run.ID, recordOf(t, p.server, p.kaelen.ID).CurrentGameSessionId)
				assert.False(t, p.run.Ended(), "the run goes on while someone is in play")
			})
		}
	}
}

// The grace a dead delver's drop starts is the hub's: when it runs out their hub body and record
// go, and the run, which they already left, keeps its body. FS-QPDKN R25; AC row 1.
func TestDeadDrop_GraceEnd_EndsTheirHubStayOnly(t *testing.T) {
	p := deadDropRun(t)
	p.killWren(t)
	p.server.handleReadError(p.wrenConn, deadDropAbnormal)

	p.server.cleanUpPlayerCompletely(p.wren.ID, deadDropHold(t, p.server, p.wren.ID))

	_, onRecord := p.server.PlayerByID(p.wren.ID)
	assert.False(t, onRecord, "their record goes at the hub grace's end")
	assert.Zero(t, entityCountFor(p.hub.EntityManager.GetAllEntities(), p.wren.ID), "with their hub body")
	assert.False(t, deadDropAwaitingSettlement(p.server, p.wren.ID), "nobody kept for the run")
	assert.True(t, p.run.HasPlayer(p.wren.ID), "the run keeps its body for its settlement")
}

// The run settles a delver whose drop was their leave exactly as one who pressed Leave: in
// match.ended with their elimination position and in run progress, seated. A normal close no longer
// costs a dead delver their settlement. The run's end skips them (R22). FS-QPDKN R18, R23, R25;
// AC row 3.
func TestDeadDrop_SettledWithTheRun(t *testing.T) {
	for _, closed := range deadDropCloses {
		t.Run(closed.name, func(t *testing.T) {
			p := deadDropRun(t)
			wrenCharacter := p.wren.Character.ID
			p.killWren(t)
			p.server.handleReadError(p.wrenConn, closed.err)

			resolvedDropEscape(t, p.run, p.kaelen.ID)
			snapshot := resolvedDropEndRun(t, p.run, p.emitter)

			// settled by their own settlement the tick they fell, not by the run's
			// end, which names them so its release skips them (FS-GV8WN §A, R14)
			_, inSnapshot := resolvedDropPlayerIn(snapshot, p.wren.ID)
			assert.False(t, inSnapshot, "the run's end does not settle them again")
			assert.Contains(t, snapshot.SettledMemberIDs, p.wren.ID)
			position, eliminated := snapshot.EliminationOrder[p.wren.ID]
			require.True(t, eliminated, "with the elimination they died with")
			assert.Equal(t, 0, position, "first and only to fall")

			own := p.emitter.settlementsOf(p.wren.ID)
			require.Len(t, own, 1, "settled once, at their death")
			assert.Equal(t, wrenCharacter, own[0].Progress.CharacterID)
			assert.True(t, own[0].Progress.Seated, "settled from their body as it fell")
			assert.Len(t, p.emitter.snapshots(), 1, "the run ended once")

			if closed.err != deadDropNormal {
				assert.Equal(t, p.hub.ID, recordOf(t, p.server, p.wren.ID).CurrentGameSessionId,
					"the run's end leaves a member who left it alone")
				assert.Equal(t, 1, entityCountFor(p.hub.EntityManager.GetAllEntities(), p.wren.ID), "one hub body")
			}
		})
	}
}

// A dead delver who drops and comes back before the run ends is announced the hub, never the run,
// and the run sends them nothing more: no state, no end_game. FS-QPDKN R12, R21, R25; AC row 4.
func TestDeadDrop_ReconnectBeforeRunEnd_LandsInTheHub(t *testing.T) {
	p := deadDropRun(t)
	p.killWren(t)
	p.server.handleReadError(p.wrenConn, deadDropAbnormal)

	record, reconnected := p.server.connectPlayer(p.wren.ID, "Wren", "token")
	require.True(t, reconnected, "within the hub's grace it is a reconnect")
	assert.Equal(t, p.hub.ID, record.CurrentGameSessionId, "their record names the hub")

	msgChan := make(chan interface{}, clientWriterBuffer)
	p.server.announceCurrentWorld(msgChan, &record)
	back := &websocket.Conn{}
	_, mapped := p.server.MapConnToPlayer(back, p.wren.ID, msgChan)
	require.True(t, mapped)
	inbox := leaveRunListen(t, p.server, back)

	world, announced := inbox.await(string(constants.ActionWorldEntered))
	require.True(t, announced, "the reconnecting member is told which world they are in")
	assert.Equal(t, string(types.WorldTypeHub), world.Payload["world_type"])
	assert.Equal(t, p.hub.ID.String(), world.Payload["session_id"])

	resolvedDropEscape(t, p.run, p.kaelen.ID)
	resolvedDropEndRun(t, p.run, p.emitter)

	assert.Empty(t, inbox.quiet(string(constants.ActionEndGame), string(constants.ActionWorldEntered)),
		"the run's end reached a member who had left it")
	assert.Zero(t, inbox.framesFrom(p.run.ID), "the run sent state to a member who had left it")
	assert.Equal(t, p.hub.ID, recordOf(t, p.server, p.wren.ID).CurrentGameSessionId)
}

// A dead delver who comes back after the hub's grace is a fresh connect: in no world, with no tie
// to the run. FS-QPDKN R25; AC row 5.
func TestDeadDrop_ReconnectAfterHubGrace_ConnectsFresh(t *testing.T) {
	p := deadDropRun(t)
	p.killWren(t)
	p.server.handleReadError(p.wrenConn, deadDropAbnormal)
	p.server.cleanUpPlayerCompletely(p.wren.ID, deadDropHold(t, p.server, p.wren.ID))

	record, reconnected := p.server.connectPlayer(p.wren.ID, "Wren", "token")
	assert.False(t, reconnected, "past the hub's grace it is a fresh connect")
	assert.Equal(t, uuid.Nil, record.CurrentGameSessionId, "in no world")
}

// deadDropAssertLeftOnce checks one departure's outcome: one hub body, the run's body kept, every
// record of them naming the hub.
func deadDropAssertLeftOnce(t *testing.T, p *deadDropParty) {
	t.Helper()

	assert.Equal(t, 1, entityCountFor(p.hub.EntityManager.GetAllEntities(), p.wren.ID), "one hub body")
	assert.True(t, p.run.HasPlayer(p.wren.ID), "the run keeps its body")
	for _, world := range leaveRunWorldsOnRecord(t, p.server, p.wren.ID) {
		assert.Equal(t, p.hub.ID, world, "every record of them names the hub")
	}
}

// A dead delver's drop and their own leave_run leave them once, whichever comes first, and the
// second writes nothing to the closed connection. FS-QPDKN R27; AC row 6.
func TestDeadDrop_AndLeaveRun_LeaveOnce(t *testing.T) {
	t.Run("leave_run, then the drop", func(t *testing.T) {
		p := deadDropRun(t)
		p.killWren(t)

		leaveRunSend(p.server, p.wrenConn)
		reply, answered := p.wrenInbox.await(string(constants.ActionWorldEntered), leaveRunAction)
		require.True(t, answered)
		require.Equal(t, string(constants.ActionWorldEntered), reply.Action, "the leave was refused: %q", leaveRunErrorOf(reply))

		p.server.handleReadError(p.wrenConn, deadDropAbnormal)

		deadDropAssertLeftOnce(t, p)
		assert.Equal(t, constants.Reconnecting, connStateOf(t, p.server, p.wren.ID), "a hub member's drop")
	})

	t.Run("the drop, then leave_run", func(t *testing.T) {
		p := deadDropRun(t)
		p.killWren(t)

		p.server.handleReadError(p.wrenConn, deadDropAbnormal)
		// the second send waits for the loop to have taken the first and handled it
		leaveRunSend(p.server, p.wrenConn)
		leaveRunSend(p.server, p.wrenConn)

		deadDropAssertLeftOnce(t, p)
		assert.Equal(t, constants.Reconnecting, connStateOf(t, p.server, p.wren.ID))
	})

	// a leave_run the loop handles after the drop has left them, while the closing connection is
	// still mapped: refused, as for any hub member, and the refusal goes nowhere
	t.Run("leave_run between the drop's leave and its hold", func(t *testing.T) {
		p := deadDropRun(t)
		p.killWren(t)

		p.server.leaveRunOnDrop(p.wrenConn)
		leaveRunSend(p.server, p.wrenConn)
		leaveRunSend(p.server, p.wrenConn)

		assert.Empty(t, p.wrenInbox.quiet(leaveRunAction, string(constants.ActionWorldEntered)),
			"a reply was queued to the closing connection")

		p.server.handleReadError(p.wrenConn, deadDropAbnormal)
		deadDropAssertLeftOnce(t, p)
	})

	t.Run("racing", func(t *testing.T) {
		for range 5 {
			p := deadDropRun(t)
			p.killWren(t)

			var wg sync.WaitGroup
			wg.Add(2)
			go func() {
				defer wg.Done()
				leaveRunSend(p.server, p.wrenConn)
			}()
			go func() {
				defer wg.Done()
				p.server.handleReadError(p.wrenConn, deadDropAbnormal)
			}()
			wg.Wait()
			// the loop may still be finishing the leave_run it took
			leaveRunSend(p.server, p.wrenConn)

			deadDropAssertLeftOnce(t, p)
			assert.Equal(t, constants.Reconnecting, connStateOf(t, p.server, p.wren.ID),
				"whichever leave landed last, they are held for the hub's grace")

			p.server.cleanUpPlayerCompletely(p.wren.ID, deadDropHold(t, p.server, p.wren.ID))
			_, onRecord := p.server.PlayerByID(p.wren.ID)
			assert.False(t, onRecord, "the grace's end takes their record")
			assert.Zero(t, entityCountFor(p.hub.EntityManager.GetAllEntities(), p.wren.ID), "and their hub body")
		}
	})
}

// The loop's leave_run and the drop's leave can both find the record naming the run, and the
// loop's can land last: seated in the hub, its record move waiting while the drop leaves them,
// holds them for the grace and unmaps the connection. That late move changes nothing. They stay
// held, not marked connected with no connection behind them, and the grace's end takes their
// record and hub body. FS-QPDKN R27; AC row 6.
func TestDeadDrop_LoopLeaveLandingAfterTheDropsHold_LeavesThemHeld(t *testing.T) {
	p := deadDropRun(t)
	p.killWren(t)

	// the loop's leave_run, as the loop takes it: the record its connection maps to
	looped, mapped := p.server.GetPlayerFromConn(p.wrenConn)
	require.True(t, mapped)

	seated := make(chan struct{})
	release := make(chan struct{})
	// only the loop's leave waits there: the drop's passes straight through
	var calls atomic.Int32
	p.server.leaveRunSeated = func() {
		if calls.Add(1) == 1 {
			close(seated)
			<-release
		}
	}

	loopDone := make(chan error, 1)
	go func() {
		_, err := p.server.LeaveRun(looped)
		loopDone <- err
	}()
	<-seated

	// the drop lands in full while the loop's leave waits to move the record
	p.server.handleReadError(p.wrenConn, deadDropAbnormal)
	require.Equal(t, constants.Reconnecting, connStateOf(t, p.server, p.wren.ID), "the drop held them")
	hold := deadDropHold(t, p.server, p.wren.ID)

	close(release)
	require.NoError(t, <-loopDone, "the loop's leave is answered as before")

	deadDropAssertLeftOnce(t, p)
	assert.Equal(t, constants.Reconnecting, connStateOf(t, p.server, p.wren.ID),
		"the late move marked a held member connected")

	p.server.cleanUpPlayerCompletely(p.wren.ID, hold)
	_, onRecord := p.server.PlayerByID(p.wren.ID)
	assert.False(t, onRecord, "the grace's end takes their record")
	assert.Zero(t, entityCountFor(p.hub.EntityManager.GetAllEntities(), p.wren.ID), "and their hub body")
	assert.True(t, p.run.HasPlayer(p.wren.ID), "the run keeps its body for its settlement")
}

// An escaped delver's drop is no leave: held in the run for the grace, then released, the run
// keeping their body for its settlement and their record going. FS-QPDKN R26, R29 (I-QPDKN-9); AC
// row 9.
func TestDeadDrop_EscapedDelverDropIsNoLeave(t *testing.T) {
	p := deadDropRun(t)
	leaveRunEscape(t, p.run, p.wren.ID)
	p.wrenInbox.awaitFrame(t, p.run.ID, "the tick has seen the escape", func(frame *types.ClientGameState) bool {
		return frame.EscapedCount > 0
	})

	p.server.handleReadError(p.wrenConn, deadDropAbnormal)

	assert.Equal(t, p.run.ID, recordOf(t, p.server, p.wren.ID).CurrentGameSessionId, "their record still names the run")
	assert.Equal(t, constants.Reconnecting, connStateOf(t, p.server, p.wren.ID))
	assert.False(t, p.hub.HasPlayer(p.wren.ID), "no hub body")

	p.server.cleanUpPlayerCompletely(p.wren.ID, deadDropHold(t, p.server, p.wren.ID))

	assert.False(t, deadDropAwaitingSettlement(p.server, p.wren.ID), "released past the grace, not kept")
	_, onRecord := p.server.PlayerByID(p.wren.ID)
	assert.False(t, onRecord, "their record goes")
	assert.True(t, p.run.HasPlayer(p.wren.ID), "and the run keeps the body for its settlement")
}

// A living delver's drop is unchanged by the rule: held in the run for the grace, then removed.
// FS-QPDKN R20, R26; AC row 10.
func TestDeadDrop_LivingDelverDropUnchanged(t *testing.T) {
	p := deadDropRun(t)
	p.wrenInbox.awaitTicks(t, p.run.ID, 1)

	p.server.handleReadError(p.wrenConn, deadDropAbnormal)

	assert.Equal(t, p.run.ID, recordOf(t, p.server, p.wren.ID).CurrentGameSessionId, "their record still names the run")
	assert.Equal(t, constants.Reconnecting, connStateOf(t, p.server, p.wren.ID))
	assert.False(t, p.hub.HasPlayer(p.wren.ID), "no hub body")

	p.server.cleanUpPlayerCompletely(p.wren.ID, deadDropHold(t, p.server, p.wren.ID))

	awaitRemoved(t, p.run, p.wren.ID, "removed from the run at the grace's end")
	_, onRecord := p.server.PlayerByID(p.wren.ID)
	assert.False(t, onRecord)
}

// With the hub gone the leave is refused, and the dead delver's drop falls back to what it was:
// held in the run, then kept for its settlement. FS-QPDKN R26; §Edge States "A dead delver's
// disconnect".
func TestDeadDrop_HubMissing_FallsBackToTheRunGrace(t *testing.T) {
	p := deadDropRun(t)
	p.killWren(t)

	p.server.mu.Lock()
	delete(p.server.sessions, p.server.hubSessionID)
	p.server.mu.Unlock()
	t.Cleanup(p.hub.Shutdown)

	p.server.handleReadError(p.wrenConn, deadDropAbnormal)

	assert.Equal(t, p.run.ID, recordOf(t, p.server, p.wren.ID).CurrentGameSessionId, "their record still names the run")
	assert.Equal(t, constants.Reconnecting, connStateOf(t, p.server, p.wren.ID))

	p.server.cleanUpPlayerCompletely(p.wren.ID, deadDropHold(t, p.server, p.wren.ID))

	assert.True(t, deadDropAwaitingSettlement(p.server, p.wren.ID), "kept for the run's settlement, as before")
	assert.True(t, p.run.HasPlayer(p.wren.ID))
}

// A dead leader whose drop takes them out of the party's run still hands the lead on at once: it
// is the run they dropped in that counts, not the hub the drop seated them in. FS-BJNYC R17;
// FS-QPDKN R25; AC row 10.
func TestDeadDrop_DeadLeaderInItsRun_StillHandsOnTheLead(t *testing.T) {
	rig := newPartyEntryRig(t, &MockItemsClient{}, WithPartySize(3))
	p := newThreePartyLeaderOnWire(t, rig)
	run := intoItsRun(t, rig, p)
	leaveRunKill(t, run, p.wren.ID)
	require.True(t, run.Resolved(p.wren.ID), "Wren is dead")

	rig.server.handleReadError(p.wrenConn, dropAbnormally)

	for who, inbox := range map[string]*startSoloInbox{"Kaelen": p.kaelenInbox, "Marl": p.marlInbox} {
		leader := awaitUpdate(t, inbox, "leader", p.kaelen.ID, who)
		assert.Equal(t, p.kaelen.ID.String(), leader.Payload["leader_id"], who)
	}
	assert.Equal(t, p.kaelen.ID, partyInRedis(t, rig, p.kaelen.ID).Leader)
	assert.Equal(t, rig.hub.ID, startSoloWorldOnRecord(t, rig.server, p.wren.ID), "the drop took Wren home")
	assert.True(t, run.HasPlayer(p.wren.ID), "and the run keeps their body")
}
