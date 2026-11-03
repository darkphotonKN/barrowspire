package gameserver

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-QPDKN §Requirements 29–31, amended R18, R19, R26 (charter addendum 2026-11-03; "逃出的人不能離開
// 是因為斷線被退出隊伍才不得已回村莊的"); §Acceptance Criteria "An escaped delver who can't come back is
// released"; §Edge States "Releasing an escaped delver". I-QPDKN-9.
//
// An escaped delver who can no longer come back is released: when their reconnect grace runs out,
// or at once on a normal close. The run marks them departed and keeps their body, so its end
// settles their plunder; their record goes, so any later connect is fresh and lands in the
// village. Inside the grace nothing changes. It is not a leave: leave_run stays refused
// (TestLeaveRun_RefusedAfterEscape).
//
// Built on I-QPDKN-8's rig (dead_disconnect_test.go): a live two-delver run on real connections,
// the drop driven through handleReadError as the reader hits it.

// escapedReleaseFind is what Wren carries out of the barrow.
const escapedReleaseFind = "Barrow Coin"

// escapeWrenWithAFind has Wren carry a find and escape with it, and waits for the tick to see it.
// Both are published through AddComponent, as leave_run_test resolves a body beside the tick.
func (p *deadDropParty) escapeWrenWithAFind(t *testing.T) {
	t.Helper()

	body := leaveRunBodyOf(t, p.run, p.wren.ID)
	find := p.run.AddItem(types.ItemConfig{TemplateID: uuid.New(), ItemType: types.ItemTypeConsumable, Name: escapedReleaseFind})
	lc, ok := body.GetComponent(ecs.ComponentTypeItemIDList)
	require.True(t, ok)
	carried := append(append([]uuid.UUID(nil), lc.(*components.ItemIDListComponent).ItemIDs...), find)
	body.AddComponent(&components.ItemIDListComponent{ItemIDs: carried})

	leaveRunEscape(t, p.run, p.wren.ID)
	p.wrenInbox.awaitFrame(t, p.run.ID, "the tick has seen the escape", func(frame *types.ClientGameState) bool {
		return frame.EscapedCount > 0
	})
}

// endWithKaelenEscaping has the last delver in play escape too, and returns the run-end snapshot.
func (p *deadDropParty) endWithKaelenEscaping(t *testing.T) *types.RawMatchState {
	t.Helper()

	leaveRunEscape(t, p.run, p.kaelen.ID)
	return resolvedDropEndRun(t, p.run, p.emitter)
}

// escapedReleaseAssertSettled checks the run-end snapshot settles Wren exactly as if she had
// stayed: escaped, with her find extracted, and in run progress from her body.
func escapedReleaseAssertSettled(t *testing.T, p *deadDropParty, snapshot *types.RawMatchState) {
	t.Helper()

	wren, inSnapshot := resolvedDropPlayerIn(snapshot, p.wren.ID)
	require.True(t, inSnapshot, "the run-end snapshot carries the released delver")
	assert.True(t, wren.Escape, "as escaped")
	var carried []string
	for _, item := range wren.Inventory {
		carried = append(carried, item.Name)
	}
	assert.Contains(t, carried, escapedReleaseFind, "and the extraction carries her plunder")
	_, eliminated := snapshot.EliminationOrder[p.wren.ID]
	assert.False(t, eliminated, "an escape is no elimination")

	var progress *types.RunProgress
	for i := range snapshot.Progress {
		if snapshot.Progress[i].MemberID == p.wren.ID {
			progress = &snapshot.Progress[i]
		}
	}
	require.NotNil(t, progress, "run progress carries her")
	assert.True(t, progress.Seated, "settled from the body the run kept")
	assert.Len(t, p.emitter.snapshots(), 1, "the run settled once")
}

// An escaped delver's normal close releases them at once: the body stays in the run and its end
// settles their plunder. This is the plunder-loss bug: the close used to remove the run body.
// FS-QPDKN R18, R29; AC "normal close (code 1000) releases them at once"; story 7.
func TestEscapedRelease_NormalClose_KeepsTheBodyAndSettlesThePlunder(t *testing.T) {
	p := deadDropRun(t)
	p.escapeWrenWithAFind(t)

	p.server.handleReadError(p.wrenConn, deadDropNormal)

	assert.True(t, p.run.HasPlayer(p.wren.ID), "the run keeps the body for its settlement")
	_, onRecord := p.server.PlayerByID(p.wren.ID)
	assert.False(t, onRecord, "their record no longer names the run")
	assert.False(t, p.hub.HasPlayer(p.wren.ID), "no hub body for a member who is not here")
	assert.False(t, p.run.Ended(), "the run goes on while someone is in play")

	escapedReleaseAssertSettled(t, p, p.endWithKaelenEscaping(t))
}

// An escaped delver whose grace runs out is released: the run marks them departed and keeps their
// body, their record goes rather than being kept for the run, and its end settles them as if they
// had stayed. FS-QPDKN R19 (now nobody), R26, R29; AC "whose grace runs out is released", "appears
// in the run-end match.ended and run progress".
func TestEscapedRelease_GraceEnd_ReleasedAndSettled(t *testing.T) {
	for _, closed := range []struct {
		name string
		err  error
	}{
		{"abnormal close", deadDropAbnormal},
		{"going away", deadDropGoingAway},
	} {
		t.Run(closed.name, func(t *testing.T) {
			p := deadDropRun(t)
			p.escapeWrenWithAFind(t)
			p.server.handleReadError(p.wrenConn, closed.err)

			p.server.cleanUpPlayerCompletely(p.wren.ID, deadDropHold(t, p.server, p.wren.ID))

			assert.True(t, p.run.HasPlayer(p.wren.ID), "the run keeps the body for its settlement")
			_, onRecord := p.server.PlayerByID(p.wren.ID)
			assert.False(t, onRecord, "their record no longer names the run")
			assert.False(t, deadDropAwaitingSettlement(p.server, p.wren.ID), "nobody is kept off-connection for the run")
			assert.False(t, p.hub.HasPlayer(p.wren.ID), "no hub body for a member who is not here")
			assert.True(t, p.run.HasPlayer(p.kaelen.ID), "the teammate is untouched")
			assert.False(t, p.run.Ended())

			escapedReleaseAssertSettled(t, p, p.endWithKaelenEscaping(t))
		})
	}
}

// escapedReleaseCloses is every way an escaped delver comes to be released, named: a normal close
// releases at once, any other drop when its grace runs out.
var escapedReleaseCloses = []struct {
	name    string
	release func(p *deadDropParty, t *testing.T)
}{
	{"normal close", func(p *deadDropParty, t *testing.T) {
		p.server.handleReadError(p.wrenConn, deadDropNormal)
	}},
	{"grace run out", func(p *deadDropParty, t *testing.T) {
		p.server.handleReadError(p.wrenConn, deadDropAbnormal)
		p.server.cleanUpPlayerCompletely(p.wren.ID, deadDropHold(t, p.server, p.wren.ID))
	}},
}

// A released escaped delver who connects again before the run ends connects fresh and enters the
// village: the hub is announced, and the run sends them nothing more, neither state nor its end.
// Its end settles the body it kept and leaves them in the hub. FS-QPDKN R21, R22, R29; AC "connects
// again before the run ends lands in the village".
func TestEscapedRelease_ConnectsAgainBeforeRunEnd_LandsInTheVillage(t *testing.T) {
	for _, released := range escapedReleaseCloses {
		t.Run(released.name, func(t *testing.T) {
			p := deadDropRun(t)
			p.escapeWrenWithAFind(t)
			released.release(p, t)

			record, reconnected := p.server.connectPlayer(p.wren.ID, "Wren", "token")
			require.False(t, reconnected, "a released delver connects fresh")
			assert.Equal(t, uuid.Nil, record.CurrentGameSessionId, "in no world, with no tie to the run")

			// the fresh connect, then the menu's enter_hub, as the client sends them
			back, _ := wsPair(t)
			registerTestConn(p.server, back, &record)
			inbox := leaveRunListen(t, p.server, back)
			character := p.server.characters.(*fakeCharacters).give(p.wren.ID, "mage", "Wren", 1, 0)
			p.server.serverChan <- types.ClientPackage{
				Conn: back,
				Message: types.Message{
					Action:  string(constants.ActionEnterHub),
					Payload: map[string]interface{}{"characterId": character.ID.String()},
				},
			}

			world, announced := inbox.await(string(constants.ActionWorldEntered))
			require.True(t, announced, "they are told which world they are in")
			assert.Equal(t, string(types.WorldTypeHub), world.Payload["world_type"], "the village")
			assert.Equal(t, p.hub.ID.String(), world.Payload["session_id"])
			assert.Equal(t, 1, entityCountFor(p.hub.EntityManager.GetAllEntities(), p.wren.ID), "one hub body")

			escapedReleaseAssertSettled(t, p, p.endWithKaelenEscaping(t))

			assert.Empty(t, inbox.quiet(string(constants.ActionEndGame), string(constants.ActionWorldEntered)),
				"the run's end reached a released delver")
			assert.Zero(t, inbox.framesFrom(p.run.ID), "the run sent state to a released delver")
			assert.Equal(t, p.hub.ID, recordOf(t, p.server, p.wren.ID).CurrentGameSessionId, "the run's end leaves them home")
			assert.Equal(t, 1, entityCountFor(p.hub.EntityManager.GetAllEntities(), p.wren.ID), "with one hub body")
		})
	}
}

// An escaped delver who reconnects inside their grace is back in the run, as before: announced the
// run, sent its state again, still a member of it. Their grace then running out releases nothing.
// FS-QPDKN R12, R24, R30; AC "reconnects inside their grace is announced the run".
func TestEscapedRelease_ReconnectInsideTheGrace_BackInTheRun(t *testing.T) {
	p := deadDropRun(t)
	p.escapeWrenWithAFind(t)
	p.server.handleReadError(p.wrenConn, deadDropAbnormal)
	hold := deadDropHold(t, p.server, p.wren.ID)

	record, reconnected := p.server.connectPlayer(p.wren.ID, "Wren", "token")
	require.True(t, reconnected, "within the grace it is a reconnect")
	assert.Equal(t, p.run.ID, record.CurrentGameSessionId, "their record names the run")

	msgChan := make(chan interface{}, clientWriterBuffer)
	p.server.announceCurrentWorld(msgChan, &record)
	back := &websocket.Conn{}
	_, mapped := p.server.MapConnToPlayer(back, p.wren.ID, msgChan)
	require.True(t, mapped)
	inbox := leaveRunListen(t, p.server, back)

	world, announced := inbox.await(string(constants.ActionWorldEntered))
	require.True(t, announced, "the reconnecting delver is told which world they are in")
	assert.Equal(t, string(types.WorldTypeRun), world.Payload["world_type"], "the run, to watch")
	assert.Equal(t, p.run.ID.String(), world.Payload["session_id"])
	inbox.awaitTicks(t, p.run.ID, 2)

	// the dropped connection's grace runs out after the reconnect
	p.server.cleanUpPlayerCompletely(p.wren.ID, hold)

	assert.Equal(t, p.run.ID, recordOf(t, p.server, p.wren.ID).CurrentGameSessionId, "still in the run")
	assert.Equal(t, constants.Connected, connStateOf(t, p.server, p.wren.ID))
	inbox.awaitTicks(t, p.run.ID, 2)

	escapedReleaseAssertSettled(t, p, p.endWithKaelenEscaping(t))
	assert.Equal(t, p.hub.ID, recordOf(t, p.server, p.wren.ID).CurrentGameSessionId, "the run's end takes them home")
}
