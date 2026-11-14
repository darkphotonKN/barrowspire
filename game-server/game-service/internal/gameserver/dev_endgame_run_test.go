package gameserver

import (
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/game"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-BDRTJ §Change: Endgame test run, R18, R19, R22, R23, R25, R31; C1.
// I-BDRTJ-3.

const (
	endgameAction = string(constants.ActionStartDevEndgameRun)
	endgameGateX  = 160.0
	endgameGateY  = 720.0
	// the refusal for anyone away from this gate (R22)
	walkToTheGateCopy = "Walk to the gate first."
)

// atEndgameGate seats a fresh level-3 member in the hub at the run's gate and
// waits for the hub to measure them there.
func atEndgameGate(t *testing.T, rig *fieldRig, name string) (*types.Player, *websocket.Conn, *startSoloInbox) {
	t.Helper()

	player, conn, inbox := rig.inHubAt(t, name, &websocket.Conn{}, endgameGateX, endgameGateY)
	require.Eventually(t, func() bool {
		return rig.hub.AtGate(player.ID, components.GateDestinationDevEndgameRun)
	}, startSoloSettle, 10*time.Millisecond, "the hub never measured them at the gate")

	return player, conn, inbox
}

// awaitEndgameRun waits for world_entered(run) and returns the run it names.
func awaitEndgameRun(t *testing.T, server *Server, inbox *startSoloInbox) *game.Session {
	t.Helper()

	reply, answered := inbox.await(string(constants.ActionWorldEntered), endgameAction)
	require.True(t, answered, "start_dev_endgame_run was never answered")
	require.Equal(t, string(constants.ActionWorldEntered), reply.Action, "got %q with error %q", reply.Action, startSoloErrorOf(reply))
	require.Equal(t, string(types.WorldTypeRun), reply.Payload["world_type"])

	for _, id := range []string{reply.Payload["session_id"].(string)} {
		for _, run := range runsOf(server) {
			if run.ID.String() == id {
				t.Cleanup(run.Shutdown)
				return run
			}
		}
	}
	require.FailNow(t, "the run world_entered names does not exist")
	return nil
}

// runsOf is every run world the server holds.
func runsOf(server *Server) []*game.Session {
	server.mu.RLock()
	defer server.mu.RUnlock()

	var runs []*game.Session
	for _, world := range server.sessions {
		if world.WorldType() == types.WorldTypeRun {
			runs = append(runs, world)
		}
	}
	return runs
}

// assertEndgameRefused checks a refusal in the given words on the action.
func assertEndgameRefused(t *testing.T, inbox *startSoloInbox, text string) {
	t.Helper()

	reply, answered := inbox.await(string(constants.ActionWorldEntered), endgameAction)
	require.True(t, answered, "start_dev_endgame_run was never answered")
	require.Equal(t, endgameAction, reply.Action, "a refusal is answered on its own action, not with %q", reply.Action)
	require.NotNil(t, reply.Error)
	assert.Equal(t, text, *reply.Error)
	assert.Equal(t, text, reply.Payload["message"])
}

// Off, the hub has no gate to the run and the action is unknown: nothing is
// built. R23.
func TestEndgameRun_Off_NoGateAndUnknownAction(t *testing.T) {
	rig := newFieldRig(t, &MockItemsClient{})

	_, _, hasGate := rig.hub.GateArrival(components.GateDestinationDevEndgameRun)
	assert.False(t, hasGate)

	_, conn, inbox := rig.inHubAt(t, "Ravek", &websocket.Conn{}, endgameGateX, endgameGateY)
	worldsBefore := startSoloSessionCount(rig.server)
	sendAction(rig.server, conn, constants.ActionStartDevEndgameRun)

	assertEndgameRefused(t, inbox, "Unknown action")
	assert.Equal(t, worldsBefore, startSoloSessionCount(rig.server), "no run was built")
}

// On, a solo member at the gate with readable gear is in one run at once: on
// floor 6 of 10, seated at their own level with their gear checked out, out of
// the hub, never queued. R19, R22, R25, R31; C1.
func TestEndgameRun_On_StartsTheRunAtTheGate(t *testing.T) {
	items := &countingItems{}
	rig := newFieldRig(t, items, WithDevTestRoom(true))

	x, y, hasGate := rig.hub.GateArrival(components.GateDestinationDevEndgameRun)
	require.True(t, hasGate)
	assert.Equal(t, [2]float64{300, 720}, [2]float64{x, y})

	ravek, conn, inbox := atEndgameGate(t, rig, "Ravek")
	worldsBefore := startSoloSessionCount(rig.server)
	sendAction(rig.server, conn, constants.ActionStartDevEndgameRun)

	run := awaitEndgameRun(t, rig.server, inbox)
	assert.Equal(t, worldsBefore+1, startSoloSessionCount(rig.server), "one run was built")
	assert.ElementsMatch(t, []any{ravek.ID}, toAny(run.GetPlayerIDs()))
	assert.False(t, rig.hub.HasPlayer(ravek.ID), "out of the hub")
	assert.Equal(t, run.ID, startSoloWorldOnRecord(t, rig.server, ravek.ID))
	assert.Zero(t, rig.queue.joinCalls(), "the queue was never asked")

	floor, ok := systems.CurrentFloor(run.EntityManager.GetAllEntities())
	require.True(t, ok)
	assert.Equal(t, 6, floor.Depth)
	assert.Equal(t, 10, floor.Count)

	assert.Equal(t, int32(1), items.checkouts.Load(), "the real gear is checked out")
	body := bodyIn(run, ravek.ID)
	require.NotNil(t, body)
	sc, _ := body.GetComponent(ecs.ComponentTypeStats)
	assert.Equal(t, 3, sc.(*components.StatsComponent).Level, "seated at their own level")
}

func toAny[T any](in []T) []any {
	out := make([]any, len(in))
	for i, v := range in {
		out[i] = v
	}
	return out
}

// Refused in start_solo's words, with the gate's own for anyone away from it:
// nothing is built. R22.
func TestEndgameRun_On_RefusedAsStartSoloIs(t *testing.T) {
	t.Run("away from the gate", func(t *testing.T) {
		rig := newFieldRig(t, &MockItemsClient{}, WithDevTestRoom(true))
		_, conn, inbox := rig.inHubAt(t, "Ravek", &websocket.Conn{}, 1000, 600)
		worldsBefore := startSoloSessionCount(rig.server)
		sendAction(rig.server, conn, constants.ActionStartDevEndgameRun)

		assertEndgameRefused(t, inbox, walkToTheGateCopy)
		assert.Equal(t, worldsBefore, startSoloSessionCount(rig.server))
	})

	t.Run("queued", func(t *testing.T) {
		rig := newFieldRig(t, &MockItemsClient{}, WithDevTestRoom(true))
		ravek, conn, inbox := atEndgameGate(t, rig, "Ravek")
		rig.queue.hold(ravek)
		worldsBefore := startSoloSessionCount(rig.server)
		sendAction(rig.server, conn, constants.ActionStartDevEndgameRun)

		assertEndgameRefused(t, inbox, startSoloQueuedCopy)
		assert.Equal(t, worldsBefore, startSoloSessionCount(rig.server))
		assert.True(t, rig.queue.holds(ravek), "still queued")
	})

	t.Run("no character", func(t *testing.T) {
		rig := newFieldRig(t, &MockItemsClient{}, WithDevTestRoom(true))
		conn := &websocket.Conn{}
		registerTestConn(rig.server, conn, &types.Player{Username: "Nobody"})
		inbox := startSoloListen(t, rig.server, conn)
		sendAction(rig.server, conn, constants.ActionStartDevEndgameRun)

		assertEndgameRefused(t, inbox, startSoloNoCharacterCopy)
	})

	t.Run("unreadable gear", func(t *testing.T) {
		rig := newFieldRig(t, &failingLoadoutItems{}, WithDevTestRoom(true))
		ravek, conn, inbox := atEndgameGate(t, rig, "Ravek")
		worldsBefore := startSoloSessionCount(rig.server)
		sendAction(rig.server, conn, constants.ActionStartDevEndgameRun)

		assertRefused(t, inbox, constants.ActionStartDevEndgameRun, "loadout_unavailable")
		assert.Equal(t, worldsBefore, startSoloSessionCount(rig.server))
		assert.True(t, rig.hub.HasPlayer(ravek.ID))
	})

	t.Run("already in a run: resumed", func(t *testing.T) {
		rig := newFieldRig(t, &MockItemsClient{}, WithDevTestRoom(true))
		ravek, conn, inbox := atEndgameGate(t, rig, "Ravek")
		run := rig.server.CreateGameSession(&types.ResolvedMatchedPlayers{LocalPlayers: []*types.Player{ravek}})
		t.Cleanup(run.Shutdown)
		worldsBefore := startSoloSessionCount(rig.server)
		sendAction(rig.server, conn, constants.ActionStartDevEndgameRun)

		reply, answered := inbox.await(string(constants.ActionWorldEntered), endgameAction)
		require.True(t, answered)
		require.Equal(t, string(constants.ActionWorldEntered), reply.Action, "got error %q", startSoloErrorOf(reply))
		assert.Equal(t, run.ID.String(), reply.Payload["session_id"])
		assert.Equal(t, worldsBefore, startSoloSessionCount(rig.server), "no second run")
	})
}

// A party member, a party of one included, is refused as start_solo refuses
// them. R22.
func TestEndgameRun_On_PartyMemberIsRefused(t *testing.T) {
	rig := newPartyEntryRig(t, &MockItemsClient{}, WithDevTestRoom(true))
	ravek, conn, inbox := rig.standing(t, "Ravek", false)
	sendParty(rig.server, conn, partyCreateAction, map[string]interface{}{})
	awaitUpdate(t, inbox, "joined", ravek.ID, "Ravek")

	sendAction(rig.server, conn, constants.ActionStartDevEndgameRun)

	assertEndgameRefused(t, inbox, partyEntersTogetherCopy)
	assert.True(t, rig.hub.HasPlayer(ravek.ID))
}
