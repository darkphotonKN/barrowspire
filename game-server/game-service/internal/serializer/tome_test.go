package serializer

import (
	"context"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// onTomeRunFloor is a run's dungeon floor at depth whose run is a tome run:
// the run-level entity holds the floor and the plan.
func onTomeRunFloor(em *ecs.EntityManager, depth int) *components.TomePlanComponent {
	runLevel := em.CreateEntity()
	floor := components.NewFloorComponent(depth, 4)
	floor.CellSize = 80
	runLevel.AddComponent(floor)
	plan := components.NewTomePlanComponent(1, 3)
	runLevel.AddComponent(plan)
	return plan
}

func addTome(em *ecs.EntityManager, x, y float64) *ecs.Entity {
	e := em.CreateEntity()
	e.AddComponent(components.NewTomeComponent())
	e.AddComponent(components.NewTransformComponent(x, y))
	return e
}

func addAltar(em *ecs.EntityManager, x, y float64) *ecs.Entity {
	e := em.CreateEntity()
	e.AddComponent(components.NewAltarComponent())
	e.AddComponent(components.NewTransformComponent(x, y))
	return e
}

// tomeWire is the state recipient is sent from em in world, as JSON keys.
func tomeWire(t *testing.T, em *ecs.EntityManager, world types.WorldType, recipient uuid.UUID) map[string]any {
	t.Helper()
	s := NewStateSerializer(em, nil)
	backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), world, em.GetAllEntities())
	require.NoError(t, err)
	return wireKeys(t, s.FormatStateToClientState(backendState, recipient))
}

// The tome is hidden: on a dungeon floor it is sent only to a recipient within
// the interest radius of it, as a container is. FS-3103M §E R14.
func TestFormatStateToClientState_TomeOnlyWithinTheInterestCut(t *testing.T) {
	em := ecs.NewEntityManager()
	onTomeRunFloor(em, 1)
	near, far := uuid.New(), uuid.New()
	addDelver(em, near, 0, 0, 100)
	addDelver(em, far, 5000, 0, 100)
	tome := addTome(em, 500, 0)

	sent := tomeWire(t, em, types.WorldTypeRun, near)
	require.Contains(t, sent, "tome")
	assert.Equal(t, map[string]any{
		"entity_id": tome.ID.String(),
		"position":  map[string]any{"x": 500.0, "y": 0.0},
	}, sent["tome"], "the tome says only what it is and where")

	assert.NotContains(t, tomeWire(t, em, types.WorldTypeRun, far), "tome", "beyond the interest radius")
}

// The altar is one landmark per floor, sent whole to every recipient on it,
// unburned until the tome is burned there. FS-3103M §E R14.
func TestFormatStateToClientState_AltarToEveryoneOnItsFloor(t *testing.T) {
	em := ecs.NewEntityManager()
	onTomeRunFloor(em, 3)
	near, far := uuid.New(), uuid.New()
	addDelver(em, near, 0, 0, 100)
	addDelver(em, far, 9000, 0, 100)
	altar := addAltar(em, 300, 200)

	for _, recipient := range []uuid.UUID{near, far} {
		sent := tomeWire(t, em, types.WorldTypeRun, recipient)
		require.Contains(t, sent, "altar")
		assert.Equal(t, map[string]any{
			"entity_id": altar.ID.String(),
			"position":  map[string]any{"x": 300.0, "y": 200.0},
			"burned":    false,
		}, sent["altar"])
		assert.NotContains(t, sent, "tome_carried", "the tome was never taken")
	}
}

// None of the tome's keys is sent in the hub, a field, or on a run floor
// without them; no key names the plan's floors or the run's height.
// FS-3103M §E R14-R15.
func TestFormatStateToClientState_NoTomeKeysWithoutThemAndNoHeight(t *testing.T) {
	tests := []struct {
		name  string
		world types.WorldType
		build func(em *ecs.EntityManager)
	}{
		{"the hub", types.WorldTypeHub, func(*ecs.EntityManager) {}},
		{"a field", types.WorldTypeField, func(*ecs.EntityManager) {}},
		{"a run without a tome", types.WorldTypeRun, func(em *ecs.EntityManager) { onFloor(em, 1, 80) }},
		{"a tome run's floor between the pair", types.WorldTypeRun, func(em *ecs.EntityManager) { onTomeRunFloor(em, 2) }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			tt.build(em)
			me := uuid.New()
			addDelver(em, me, 0, 0, 100)

			sent := tomeWire(t, em, tt.world, me)
			for _, key := range []string{"tome", "altar", "tome_carried"} {
				assert.NotContains(t, sent, key)
			}
			for _, key := range []string{"height", "floor_count", "tome_floor", "altar_floor"} {
				assert.NotContains(t, sent, key, "the height never leaves the server")
			}
		})
	}
}

// tome_carried rides the broadcast while the party carries the tome unburned,
// to every recipient. FS-3103M §E R14.
func TestFormatStateToClientState_TomeCarriedWhileCarriedAndUnburned(t *testing.T) {
	tests := []struct {
		name            string
		carried, burned bool
		want            bool
	}{
		{"never taken", false, false, false},
		{"carried", true, false, true},
		{"burned", false, true, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			plan := onTomeRunFloor(em, 2)
			plan.Carried, plan.Burned = tt.carried, tt.burned
			me := uuid.New()
			addDelver(em, me, 0, 0, 100)

			sent := tomeWire(t, em, types.WorldTypeRun, me)
			if !tt.want {
				assert.NotContains(t, sent, "tome_carried")
				return
			}
			assert.Equal(t, true, sent["tome_carried"])
		})
	}
}
