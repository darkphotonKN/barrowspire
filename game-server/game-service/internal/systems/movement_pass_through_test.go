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

// walkerAt is a living player walking at (vx, vy) from (x, y).
func walkerAt(em *ecs.EntityManager, x, y, vx, vy float64) *ecs.Entity {
	e := delverAt(em, x, y)
	vc, _ := e.GetComponent(ecs.ComponentTypeVelocity)
	velocity := vc.(*components.VelocityComponent)
	velocity.VX, velocity.VY = vx, vy
	return e
}

// sharedWorld is the hub's or a field's movement: players pass through each other.
func sharedWorld() *MovementSystem {
	s := NewMovementSystem()
	s.PlayersPassThrough = true
	return s
}

func bodyGap(t *testing.T, a, b *ecs.Entity) float64 {
	t.Helper()
	ta, tb := transformOf(t, a), transformOf(t, b)
	return math.Hypot(ta.X-tb.X, ta.Y-tb.Y)
}

// In the hub and the fields a player walks straight through a standing player:
// neither is pushed, whichever of the two the tick moves first. FS-0XMCP
// §Requirements 26.
func TestMovementSystem_PlayersPassThrough_WalkerPassesStandingPlayer(t *testing.T) {
	tests := []struct {
		name        string
		walkerFirst bool
	}{
		{"walker moved first", true},
		{"standing player moved first", false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			var walker, still *ecs.Entity
			if tt.walkerFirst {
				walker = walkerAt(em, 200, 300, 1, 0)
				still = delverAt(em, 240, 300)
			} else {
				still = delverAt(em, 240, 300)
				walker = walkerAt(em, 200, 300, 1, 0)
			}
			ticks := 60
			for range ticks {
				sharedWorld().Update(tickSeconds, em.GetAllEntities())
			}

			unobstructed := 200 + 100*tickSeconds*float64(ticks)
			assert.InDelta(t, unobstructed, transformOf(t, walker).X, 0.001, "the walker was stopped or pushed")
			assert.InDelta(t, 300, transformOf(t, walker).Y, 0.001)
			assert.InDelta(t, 240, transformOf(t, still).X, 0.001, "the standing player was pushed")
			assert.InDelta(t, 300, transformOf(t, still).Y, 0.001)
		})
	}
}

// Two players stacked on one spot stay stacked. FS-0XMCP §Edge States.
func TestMovementSystem_PlayersPassThrough_StackedPlayersStayStacked(t *testing.T) {
	em := ecs.NewEntityManager()
	a := delverAt(em, 300, 300)
	b := delverAt(em, 301, 300)

	sharedWorld().Update(tickSeconds, em.GetAllEntities())

	assert.InDelta(t, 1.0, bodyGap(t, a, b), 0.001)
}

// Pass-through is only between two players: a player and a monster, and a
// player and a hub resident, still push each other. FS-0XMCP §Requirements 28.
func TestMovementSystem_PlayersPassThrough_OtherBodiesStillCollide(t *testing.T) {
	tests := []struct {
		name  string
		other func(em *ecs.EntityManager, x, y float64) *ecs.Entity
	}{
		{"monster", func(em *ecs.EntityManager, x, y float64) *ecs.Entity {
			e := mover(em, x, y, 0, 0)
			e.AddComponent(&components.MonsterComponent{Archetype: components.MonsterArchetypeGhoul})
			return e
		}},
		{"hub resident", func(em *ecs.EntityManager, x, y float64) *ecs.Entity {
			e := mover(em, x, y, 0, 0)
			e.AddComponent(components.NewNPCComponent("resident", components.NPCFunctionNone))
			return e
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name+", player walks into it", func(t *testing.T) {
			em := ecs.NewEntityManager()
			walker := walkerAt(em, 200, 300, 1, 0)
			other := tt.other(em, 240, 300)
			for range 30 {
				sharedWorld().Update(tickSeconds, em.GetAllEntities())
			}
			assert.GreaterOrEqual(t, bodyGap(t, walker, other), 2*constants.PlayerRadius-0.001)
		})
		t.Run(tt.name+", it walks into a player", func(t *testing.T) {
			em := ecs.NewEntityManager()
			player := delverAt(em, 240, 300)
			other := tt.other(em, 200, 300)
			vc, _ := other.GetComponent(ecs.ComponentTypeVelocity)
			vc.(*components.VelocityComponent).VX = 1
			for range 30 {
				sharedWorld().Update(tickSeconds, em.GetAllEntities())
			}
			assert.GreaterOrEqual(t, bodyGap(t, player, other), 2*constants.PlayerRadius-0.001)
		})
	}
}

// Pass-through leaves walls alone: a player still stops at a wall and is
// depenetrated from it. FS-0XMCP §Requirements 28.
func TestMovementSystem_PlayersPassThrough_WallStillStopsPlayer(t *testing.T) {
	em := ecs.NewEntityManager()
	wall := em.CreateEntity()
	wall.AddComponent(components.NewTransformComponent(260, 200))
	wall.AddComponent(components.NewWallComponent(uuid.New(), uuid.New(), 20, 200))

	walker := walkerAt(em, 200, 300, 1, 0)
	inside := delverAt(em, 265, 250) // overlapping the wall: depenetrated out of it

	for range 60 {
		sharedWorld().Update(tickSeconds, em.GetAllEntities())
	}

	assert.LessOrEqual(t, transformOf(t, walker).X, 260-constants.PlayerRadius+0.001, "the walker went through the wall")
	in := transformOf(t, inside)
	outside := in.X+constants.PlayerRadius <= 260+0.001 || in.X-constants.PlayerRadius >= 280-0.001
	assert.True(t, outside, "the player was not depenetrated from the wall: x=%v", in.X)
}

// In a run, players still body-block: the same walk stops at 2 × PlayerRadius.
// FS-0XMCP §Requirements 27.
func TestMovementSystem_PlayersCollideInARun(t *testing.T) {
	em := ecs.NewEntityManager()
	walker := walkerAt(em, 200, 300, 1, 0)
	still := delverAt(em, 240, 300)

	for range 60 {
		NewMovementSystem().Update(tickSeconds, em.GetAllEntities())
	}

	assert.InDelta(t, 2*constants.PlayerRadius, bodyGap(t, walker, still), 0.5)
}
