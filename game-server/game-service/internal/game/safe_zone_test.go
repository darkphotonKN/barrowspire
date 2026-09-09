package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// healthOf reads a player's remaining health from their world.
func healthOf(t *testing.T, s *Session, playerID uuid.UUID) int {
	t.Helper()

	entityID, ok := s.playerIDToEntitiesID[playerID]
	require.True(t, ok, "player is not in this world")

	entity, ok := s.EntityManager.GetEntity(entityID)
	require.True(t, ok)

	comp, ok := entity.GetComponent(ecs.ComponentTypeHealth)
	require.True(t, ok)

	return comp.(*components.HealthComponent).CurrentHealth
}

// tick runs the movement system once, which is where damage is actually applied.
func tick(s *Session) {
	movementSys := systems.MovementSystem{MapWidth: s.mapWidth, MapHeight: s.mapHeight}
	movementSys.Update(1.0/float64(constants.GameFrameRate), s.EntityManager.GetAllEntities())
}

// worldWithTwoDelvers stands two players next to each other, close enough to hit.
func worldWithTwoDelvers(t *testing.T, bounds WorldBounds) (*Session, uuid.UUID, uuid.UUID) {
	t.Helper()

	em := ecs.NewEntityManager()
	session := NewSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, em, &mockEventEmitter{}, nil, bounds)

	attacker, target := uuid.New(), uuid.New()
	session.AddPlayer(attacker, "Wren", "warrior")
	session.AddPlayer(target, "Kaelen", "warrior")

	// AddPlayer scatters a run's arrivals, so place them: within the 60 attack
	// range, but in different spatial-hash cells. MovementSystem buckets by
	// 2*PlayerRadius and keeps one entity per cell, so two delvers standing on
	// the same spot would leave one of them out of the simulation entirely.
	place := map[uuid.UUID][2]float64{attacker: {500, 500}, target: {550, 500}}
	for playerID, at := range place {
		entityID := session.playerIDToEntitiesID[playerID]
		entity, _ := session.EntityManager.GetEntity(entityID)
		comp, _ := entity.GetComponent(ecs.ComponentTypeTransform)
		transform := comp.(*components.TransformComponent)
		transform.X, transform.Y = at[0], at[1]
	}

	return session, attacker, target
}

// The hub is somewhere a delver can stand and think. Combat belongs to a run.
//
// The guard has to sit on the path damage actually travels: it is inlined in
// MovementSystem (movement.go:227, a hardcoded 10), not in CombatSystem, which is
// an empty stub — and the hub runs the same MovementSystem a run does.
// FS-0008 §Requirements 6.
func TestAttack_LandsInARunAndNotInTheHub(t *testing.T) {
	tests := []struct {
		name       string
		bounds     WorldBounds
		wantDamage bool
	}{
		{"a run is where fighting happens", RunBounds(), true},
		{"the hub is a safe zone", HubBounds(), false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			session, attacker, target := worldWithTwoDelvers(t, tt.bounds)
			before := healthOf(t, session, target)

			targetEntityID := session.playerIDToEntitiesID[target]
			err := session.handleAttack(attacker, targetEntityID)
			tick(session)

			after := healthOf(t, session, target)

			if tt.wantDamage {
				require.NoError(t, err)
				assert.Less(t, after, before, "an attack in a run should land")
				return
			}

			assert.ErrorIs(t, err, ErrSafeZone, "the attack should have been turned away")
			assert.Equal(t, before, after,
				"a delver was hurt in the hub, which is meant to be safe")
		})
	}
}
