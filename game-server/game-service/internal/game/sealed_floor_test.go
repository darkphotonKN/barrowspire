package game

import (
	"context"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/serializer"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-5FZ4J §A R6: floor 1 has no escape door and no switch. The code that
// reads them, the snapshot, the floor map, the switch handler and the end
// rule, runs on such a floor.

// The snapshot carries no escape door or switch on floor 1, and every member's
// cut of it and the floor map build as on any floor.
func TestFloor1_NoEscapeDoor_SnapshotAndFloorMapBuild(t *testing.T) {
	s, ids := dungeonRun(t, 7, 2, 0)
	ser := serializer.NewStateSerializer(s.EntityManager, nil)

	state, err := ser.SerializeBackendState(context.Background(), s.ID, s.worldType, s.EntityManager.GetAllEntities())

	require.NoError(t, err)
	assert.Empty(t, state.EscapeDoor)
	assert.Empty(t, state.Switch)
	assert.Len(t, state.Stairs, 1, "floor 1 keeps its way up")
	member := delverEntity(t, s, ids[0])
	pc, _ := member.GetComponent(ecs.ComponentTypePlayer)
	client := ser.FormatStateToClientState(state, pc.(*components.PlayerComponent).MemberID)
	assert.Empty(t, client.EscapeDoor)
	assert.Empty(t, client.Switch)

	floorMap, ok := s.FloorMapMessage()
	require.True(t, ok, "floor 1's map is published")
	assert.NotEmpty(t, floorMap.Payload["regions"])
}

// A switch interact on a floor with no escape door unlocks nothing and fails
// nothing: the handler finds no door to open.
func TestFloor1_NoEscapeDoor_SwitchHandlerUnlocksNothing(t *testing.T) {
	s, ids := dungeonRun(t, 7, 1, 0)
	at := transformOf(t, delverEntity(t, s, ids[0]))
	lever := CreateSwitchEntity(s.EntityManager, SwitchConfig{X: at.X, Y: at.Y, SwitchID: 1})

	require.NoError(t, s.handleInteract(ids[0], lever.ID))

	sc, _ := lever.GetComponent(ecs.ComponentTypeSwitch)
	assert.True(t, sc.(*components.SwitchComponent).IsActivated)
	assert.Empty(t, entityIDsWith(s, ecs.ComponentTypeEscapeDoor), "no escape door appears")
}

// With no way out on floor 1, the co-op end rule still ends the run once the
// whole party has died there.
func TestFloor1_NoEscapeDoor_RunEndsWhenThePartyDies(t *testing.T) {
	s, ids := dungeonRun(t, 7, 2, 0)
	s.endSessionCh = make(chan bool, 1)
	tick(s)
	require.Empty(t, s.endSessionCh, "the party is in play")

	for _, id := range ids {
		hc, _ := delverEntity(t, s, id).GetComponent(ecs.ComponentTypeHealth)
		hc.(*components.HealthComponent).CurrentHealth = 0
		hc.(*components.HealthComponent).IsEliminated = true
	}
	tick(s)

	assert.Len(t, s.endSessionCh, 1, "the run ends")
}
