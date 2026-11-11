package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-MQYEX §Requirements 2, 4–5. I-MQYEX-1.

const (
	timedOpenTick     = 1.0 / 30
	timedOpenDuration = 1.5
)

// bodyAt is a delver's body standing at x, y, in play at full health.
func bodyAt(em *ecs.EntityManager, x, y float64) *ecs.Entity {
	body := em.CreateEntity()
	body.AddComponent(components.NewPlayerComponent(uuid.New(), "warrior", "Wren", false))
	body.AddComponent(components.NewTransformComponent(x, y))
	body.AddComponent(components.NewHealthComponent(100, 100))
	return body
}

// containerBeside is a container standing 5 px east of x, y: in reach of a
// body there.
func containerBeside(em *ecs.EntityManager, x, y float64) uuid.UUID {
	container := em.CreateEntity()
	container.AddComponent(components.NewTransformComponent(x+5, y))
	return container.ID
}

func timedOpenOn(t *testing.T, body *ecs.Entity) *components.TimedOpenComponent {
	t.Helper()
	oc, ok := body.GetComponent(ecs.ComponentTypeTimedOpen)
	require.True(t, ok, "the body has a timed open")
	return oc.(*components.TimedOpenComponent)
}

// A start puts the timed open on the body: the container, nothing counted
// yet, the time it takes, and where the body stands. A second start takes the
// first one's place, so a body has one. R2.
func TestTimedOpenSystem_Start_PutsItOnTheBodyFromZero(t *testing.T) {
	em := ecs.NewEntityManager()
	body := bodyAt(em, 120, 340)
	first, second := containerBeside(em, 120, 340), containerBeside(em, 120, 340)
	sys := NewTimedOpenSystem(em)

	sys.Start(body, first, timedOpenDuration)
	assert.Equal(t, components.TimedOpenComponent{ContainerID: first, Duration: timedOpenDuration, FromX: 120, FromY: 340, HealthBeforeCombat: 100}, *timedOpenOn(t, body))

	sys.Update(timedOpenTick, em.GetAllEntities())
	sys.Start(body, second, timedOpenDuration)
	assert.Equal(t, components.TimedOpenComponent{ContainerID: second, Duration: timedOpenDuration, FromX: 120, FromY: 340, HealthBeforeCombat: 100}, *timedOpenOn(t, body))
}

// Each tick counts its simulation time on the timed open, the reach's own
// tick included. 45 ticks count 1.5 s and complete nothing; the next tick
// finds the time passed, reports it once and takes it off the body. R4–R5.
func TestTimedOpenSystem_Update_CompletesOnTheTickAfterTheTimeIsCounted(t *testing.T) {
	em := ecs.NewEntityManager()
	body := bodyAt(em, 500, 500)
	container := containerBeside(em, 500, 500)
	sys := NewTimedOpenSystem(em)
	sys.Start(body, container, timedOpenDuration)

	for n := 1; n <= 45; n++ {
		require.Empty(t, sys.Update(timedOpenTick, em.GetAllEntities()), "tick %d completes nothing", n)
		require.InDelta(t, float64(n)*timedOpenTick, timedOpenOn(t, body).Elapsed, 1e-9, "tick %d", n)
	}

	assert.Equal(t, []CompletedTimedOpen{{DelverEntityID: body.ID, ContainerID: container}}, sys.Update(timedOpenTick, em.GetAllEntities()))
	assert.False(t, body.HasComponent(ecs.ComponentTypeTimedOpen), "a completed timed open leaves the body")
	assert.Empty(t, sys.Update(timedOpenTick, em.GetAllEntities()), "it is reported once")
}

// Each body's timed open is its own: one started later completes later, and a
// body without one is passed over.
func TestTimedOpenSystem_Update_CountsEachBodysOwn(t *testing.T) {
	em := ecs.NewEntityManager()
	early, late, idle := bodyAt(em, 100, 100), bodyAt(em, 200, 100), bodyAt(em, 300, 100)
	chest, sack := containerBeside(em, 100, 100), containerBeside(em, 200, 100)
	sys := NewTimedOpenSystem(em)

	sys.Start(early, chest, timedOpenDuration)
	for range 10 {
		require.Empty(t, sys.Update(timedOpenTick, em.GetAllEntities()))
	}
	sys.Start(late, sack, timedOpenDuration)
	for range 35 {
		require.Empty(t, sys.Update(timedOpenTick, em.GetAllEntities()))
	}

	assert.Equal(t, []CompletedTimedOpen{{DelverEntityID: early.ID, ContainerID: chest}}, sys.Update(timedOpenTick, em.GetAllEntities()))
	assert.InDelta(t, 36*timedOpenTick, timedOpenOn(t, late).Elapsed, 1e-9, "the other keeps counting")
	assert.False(t, idle.HasComponent(ecs.ComponentTypeTimedOpen))
}

// FS-MQYEX §Requirements 6–13. I-MQYEX-2.

// A body that is not where it stood at the reach has no timed open after the
// tick, and nothing is reported for it: a cancel opens nothing. However far
// along it was, and by whatever moved it. R6, R11, D3.
func TestTimedOpenSystem_Update_ABodyThatMovedIsCancelled(t *testing.T) {
	for _, counted := range []int{0, 20, 45} {
		em := ecs.NewEntityManager()
		body := bodyAt(em, 500, 500)
		sys := NewTimedOpenSystem(em)
		sys.Start(body, containerBeside(em, 500, 500), timedOpenDuration)
		for range counted {
			require.Empty(t, sys.Update(timedOpenTick, em.GetAllEntities()))
		}

		tc, _ := body.GetComponent(ecs.ComponentTypeTransform)
		tc.(*components.TransformComponent).X += 0.5

		assert.Empty(t, sys.Update(timedOpenTick, em.GetAllEntities()), "%d ticks in: a cancel completes nothing", counted)
		assert.False(t, body.HasComponent(ecs.ComponentTypeTimedOpen), "%d ticks in: the timed open is gone", counted)
	}
}

func healthOn(t *testing.T, body *ecs.Entity) *components.HealthComponent {
	t.Helper()
	hc, ok := body.GetComponent(ecs.ComponentTypeHealth)
	require.True(t, ok)
	return hc.(*components.HealthComponent)
}

// A hit costs health during the tick's combat: a body with less health after
// it than it went in with has no timed open after the tick. Health that rose,
// and health that changed before the combat, cancel nothing; a heal before the
// combat does not hide a hit in it. R7, D4.
func TestTimedOpenSystem_Update_AHitThatCostHealthCancels(t *testing.T) {
	tests := []struct {
		name         string
		beforeCombat int // health change before the tick's combat
		inCombat     int // health change in it
		cancelled    bool
	}{
		{"a hit", 0, -1, true},
		{"a heal before the combat, then a hit", +30, -10, true},
		{"no hit", 0, 0, false},
		{"a heal", 0, +10, false},
		{"health lost before the combat", -5, 0, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			body := bodyAt(em, 500, 500)
			health := healthOn(t, body)
			health.CurrentHealth = 60
			sys := NewTimedOpenSystem(em)
			sys.Start(body, containerBeside(em, 500, 500), timedOpenDuration)
			sys.MarkHealth(em.GetAllEntities())
			require.Empty(t, sys.Update(timedOpenTick, em.GetAllEntities()))

			health.CurrentHealth += tt.beforeCombat
			sys.MarkHealth(em.GetAllEntities())
			health.CurrentHealth += tt.inCombat

			assert.Empty(t, sys.Update(timedOpenTick, em.GetAllEntities()))
			assert.Equal(t, !tt.cancelled, body.HasComponent(ecs.ComponentTypeTimedOpen))
		})
	}
}

// A timed open on a container that is farther than the interact range from
// the body, or no longer in the world, is cancelled; one at the very edge of
// the range is in reach, as it is for the reach itself. R8, D5.
func TestTimedOpenSystem_Update_OutOfReachOfTheContainerIsCancelled(t *testing.T) {
	const reach = constants.DefaultInteractableRange
	tests := []struct {
		name      string
		change    func(em *ecs.EntityManager, container *ecs.Entity)
		cancelled bool
	}{
		{"the container is gone", func(em *ecs.EntityManager, container *ecs.Entity) { em.RemoveEntity(container.ID) }, true},
		{"the container is past the range", func(_ *ecs.EntityManager, container *ecs.Entity) {
			container.AddComponent(components.NewTransformComponent(500+reach+1, 500))
		}, true},
		{"the container is at the edge of the range", func(_ *ecs.EntityManager, container *ecs.Entity) {
			container.AddComponent(components.NewTransformComponent(500, 500+reach))
		}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			body := bodyAt(em, 500, 500)
			container, _ := em.GetEntity(containerBeside(em, 500, 500))
			sys := NewTimedOpenSystem(em)
			sys.Start(body, container.ID, timedOpenDuration)
			require.Empty(t, sys.Update(timedOpenTick, em.GetAllEntities()))
			require.True(t, body.HasComponent(ecs.ComponentTypeTimedOpen))

			tt.change(em, container)

			assert.Empty(t, sys.Update(timedOpenTick, em.GetAllEntities()))
			assert.Equal(t, !tt.cancelled, body.HasComponent(ecs.ComponentTypeTimedOpen))
		})
	}
}

// A start on the container the body is already opening changes nothing: what
// is counted stays counted, and it still completes when its time has passed.
// R12, D8.
func TestTimedOpenSystem_Start_OnTheSameContainerChangesNothing(t *testing.T) {
	em := ecs.NewEntityManager()
	body := bodyAt(em, 500, 500)
	container := containerBeside(em, 500, 500)
	sys := NewTimedOpenSystem(em)
	sys.Start(body, container, timedOpenDuration)
	for range 20 {
		require.Empty(t, sys.Update(timedOpenTick, em.GetAllEntities()))
	}
	before := *timedOpenOn(t, body)

	sys.Start(body, container, timedOpenDuration)

	assert.Equal(t, before, *timedOpenOn(t, body))
	for range 25 {
		require.Empty(t, sys.Update(timedOpenTick, em.GetAllEntities()))
	}
	assert.Len(t, sys.Update(timedOpenTick, em.GetAllEntities()), 1, "it completes on its own time")
}

// A body out of play has no timed open after the tick: dead, escaped, or left
// behind on a floor below. R9, D7.
func TestTimedOpenSystem_Update_ABodyOutOfPlayIsCancelled(t *testing.T) {
	tests := map[string]func(t *testing.T, body *ecs.Entity){
		"dead": func(t *testing.T, body *ecs.Entity) { healthOn(t, body).CurrentHealth = 0 },
		"escaped": func(_ *testing.T, body *ecs.Entity) {
			pc, _ := body.GetComponent(ecs.ComponentTypePlayer)
			pc.(*components.PlayerComponent).Escape = true
		},
		"left behind": func(_ *testing.T, body *ecs.Entity) {
			pc, _ := body.GetComponent(ecs.ComponentTypePlayer)
			pc.(*components.PlayerComponent).LeftBehind = true
		},
	}
	for name, resolve := range tests {
		t.Run(name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			body := bodyAt(em, 500, 500)
			sys := NewTimedOpenSystem(em)
			sys.Start(body, containerBeside(em, 500, 500), timedOpenDuration)
			// the health going into the combat is the health coming out: no hit
			resolve(t, body)
			sys.MarkHealth(em.GetAllEntities())

			assert.Empty(t, sys.Update(timedOpenTick, em.GetAllEntities()))
			assert.False(t, body.HasComponent(ecs.ComponentTypeTimedOpen))
		})
	}
}

// FS-MQYEX §Requirements 14, 16. I-MQYEX-3.

// The first timed open to complete on a container ends every other one on it
// that tick, however far along, whichever body the tick reaches first; one on
// another container keeps counting. R16.
func TestTimedOpenSystem_Update_TheFirstToCompleteEndsTheOthersOnItsContainer(t *testing.T) {
	for _, order := range []string{"the first to finish is reached first", "the first to finish is reached last"} {
		t.Run(order, func(t *testing.T) {
			em := ecs.NewEntityManager()
			first, second, elsewhere := bodyAt(em, 500, 500), bodyAt(em, 500, 500), bodyAt(em, 500, 500)
			chest, sack := containerBeside(em, 500, 500), containerBeside(em, 500, 500)
			entities := []*ecs.Entity{first, second, elsewhere}
			if order == "the first to finish is reached last" {
				entities = []*ecs.Entity{elsewhere, second, first}
			}
			sys := NewTimedOpenSystem(em)

			sys.Start(first, chest, timedOpenDuration)
			for range 10 {
				require.Empty(t, sys.Update(timedOpenTick, entities))
			}
			sys.Start(second, chest, timedOpenDuration)
			sys.Start(elsewhere, sack, timedOpenDuration)
			for range 35 {
				require.Empty(t, sys.Update(timedOpenTick, entities))
			}

			assert.Equal(t, []CompletedTimedOpen{{DelverEntityID: first.ID, ContainerID: chest}}, sys.Update(timedOpenTick, entities))
			assert.False(t, second.HasComponent(ecs.ComponentTypeTimedOpen), "the other one on the container ends on that tick")
			assert.InDelta(t, 36*timedOpenTick, timedOpenOn(t, elsewhere).Elapsed, 1e-9, "one on another container keeps counting")
			assert.Empty(t, sys.Update(timedOpenTick, entities), "and the one that ended completes nothing later")
		})
	}
}

// Two timed opens on one container that complete on the same tick are one
// completion, the first in the tick's order: the container opens once. R16,
// edge state "two players finish on the same tick".
func TestTimedOpenSystem_Update_TwoCompletingOnOneTickAreOneCompletion(t *testing.T) {
	em := ecs.NewEntityManager()
	one, two := bodyAt(em, 500, 500), bodyAt(em, 500, 500)
	chest := containerBeside(em, 500, 500)
	entities := []*ecs.Entity{one, two}
	sys := NewTimedOpenSystem(em)
	sys.Start(one, chest, timedOpenDuration)
	sys.Start(two, chest, timedOpenDuration)
	for range 45 {
		require.Empty(t, sys.Update(timedOpenTick, entities))
	}

	assert.Equal(t, []CompletedTimedOpen{{DelverEntityID: one.ID, ContainerID: chest}}, sys.Update(timedOpenTick, entities))
	assert.False(t, one.HasComponent(ecs.ComponentTypeTimedOpen))
	assert.False(t, two.HasComponent(ecs.ComponentTypeTimedOpen))
}

// A cancel is the cancelled body's alone: another body's timed open on the
// same container keeps counting and completes on its own time. R14.
func TestTimedOpenSystem_Update_ACancelLeavesTheOthersOnTheContainer(t *testing.T) {
	em := ecs.NewEntityManager()
	leaver, stayer := bodyAt(em, 500, 500), bodyAt(em, 500, 500)
	chest := containerBeside(em, 500, 500)
	sys := NewTimedOpenSystem(em)
	sys.Start(leaver, chest, timedOpenDuration)
	sys.Start(stayer, chest, timedOpenDuration)
	for range 20 {
		require.Empty(t, sys.Update(timedOpenTick, em.GetAllEntities()))
	}

	tc, _ := leaver.GetComponent(ecs.ComponentTypeTransform)
	tc.(*components.TransformComponent).X += 0.5
	require.Empty(t, sys.Update(timedOpenTick, em.GetAllEntities()))

	require.False(t, leaver.HasComponent(ecs.ComponentTypeTimedOpen), "the one who moved is cancelled")
	assert.InDelta(t, 21*timedOpenTick, timedOpenOn(t, stayer).Elapsed, 1e-9, "the other's is untouched")
	for range 24 {
		require.Empty(t, sys.Update(timedOpenTick, em.GetAllEntities()))
	}
	assert.Equal(t, []CompletedTimedOpen{{DelverEntityID: stayer.ID, ContainerID: chest}}, sys.Update(timedOpenTick, em.GetAllEntities()))
}
