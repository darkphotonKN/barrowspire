package systems

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

// mover is a body with a velocity: something MovementSystem moves and collides.
func mover(em *ecs.EntityManager, x, y, vx, vy float64) *ecs.Entity {
	e := em.CreateEntity()
	e.AddComponent(components.NewTransformComponent(x, y))
	e.AddComponent(components.NewVelocityComponent(vx, vy, 100))
	return e
}

// Two bodies sharing one spatial-hash cell are both simulated. One entity per
// cell used to drop the other out of the tick: it froze. FS-QG1HR D4.
func TestMovementSystem_TwoMoversInOneCell_BothAdvance(t *testing.T) {
	em := ecs.NewEntityManager()
	// cell (2, 2) spans [80, 120) on both axes; 40 px apart vertically, no overlap
	a := mover(em, 85, 82, 1, 0)
	b := mover(em, 85, 119, 1, 0)

	NewMovementSystem().Update(tickSeconds, em.GetAllEntities())

	assert.Greater(t, transformOf(t, a).X, 85.0, "the first body froze")
	assert.Greater(t, transformOf(t, b).X, 85.0, "the second body froze")
}

// A body walking into a neighbour in its own cell is pushed out of it, not
// passed through. FS-QG1HR D4.
func TestMovementSystem_NeighbourInTheSameCell_StillCollides(t *testing.T) {
	em := ecs.NewEntityManager()
	still := mover(em, 85, 100, 0, 0)
	walker := mover(em, 115, 100, -1, 0)

	for range 10 {
		NewMovementSystem().Update(tickSeconds, em.GetAllEntities())
	}

	s, w := transformOf(t, still), transformOf(t, walker)
	assert.GreaterOrEqual(t, math.Hypot(w.X-s.X, w.Y-s.Y), 2*constants.PlayerRadius-0.001)
}

// delverAt is a living delver standing still at (x, y).
func delverAt(em *ecs.EntityManager, x, y float64) *ecs.Entity {
	e := mover(em, x, y, 0, 0)
	e.AddComponent(components.NewPlayerComponent(uuid.New(), "warrior", "delver", false))
	e.AddComponent(components.NewHealthComponent(150, 150))
	return e
}

// A resolved delver's body is not in play: a dead delver left on a floor below
// and an escaped delver standing at the old escape door push nobody, so a
// living delver walks straight through where they stood. FS-F6F88
// §Requirements 15, FS-77AB6 §Requirements 17.
func TestMovementSystem_ResolvedDelver_IsNotAnObstacle(t *testing.T) {
	tests := []struct {
		name    string
		resolve func(*ecs.Entity)
	}{
		{"dead, left behind on a floor below", func(e *ecs.Entity) {
			hc, _ := e.GetComponent(ecs.ComponentTypeHealth)
			health := hc.(*components.HealthComponent)
			health.CurrentHealth, health.IsEliminated = 0, true
			pc, _ := e.GetComponent(ecs.ComponentTypePlayer)
			pc.(*components.PlayerComponent).LeftBehind = true
		}},
		{"escaped", func(e *ecs.Entity) {
			pc, _ := e.GetComponent(ecs.ComponentTypePlayer)
			pc.(*components.PlayerComponent).Escape = true
		}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			resolved := delverAt(em, 300, 300)
			tt.resolve(resolved)
			walker := delverAt(em, 300-2*constants.PlayerRadius-5, 300)
			vc, _ := walker.GetComponent(ecs.ComponentTypeVelocity)
			vc.(*components.VelocityComponent).VX = 1

			for range 30 {
				NewMovementSystem().Update(tickSeconds, em.GetAllEntities())
			}

			assert.Greater(t, transformOf(t, walker).X, 300.0, "the walker was stopped by a resolved body")
			assert.Equal(t, 300.0, transformOf(t, resolved).X, "a resolved body is not pushed either")
		})
	}
}
