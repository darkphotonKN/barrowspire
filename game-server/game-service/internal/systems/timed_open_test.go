package systems

import (
	"testing"

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

// bodyAt is a delver's body standing at x, y.
func bodyAt(em *ecs.EntityManager, x, y float64) *ecs.Entity {
	body := em.CreateEntity()
	body.AddComponent(components.NewPlayerComponent(uuid.New(), "warrior", "Wren", false))
	body.AddComponent(components.NewTransformComponent(x, y))
	return body
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
	first, second := uuid.New(), uuid.New()
	sys := NewTimedOpenSystem()

	sys.Start(body, first, timedOpenDuration)
	assert.Equal(t, components.TimedOpenComponent{ContainerID: first, Duration: timedOpenDuration, FromX: 120, FromY: 340}, *timedOpenOn(t, body))

	sys.Update(timedOpenTick, em.GetAllEntities())
	sys.Start(body, second, timedOpenDuration)
	assert.Equal(t, components.TimedOpenComponent{ContainerID: second, Duration: timedOpenDuration, FromX: 120, FromY: 340}, *timedOpenOn(t, body))
}

// Each tick counts its simulation time on the timed open, the reach's own
// tick included. 45 ticks count 1.5 s and complete nothing; the next tick
// finds the time passed, reports it once and takes it off the body. R4–R5.
func TestTimedOpenSystem_Update_CompletesOnTheTickAfterTheTimeIsCounted(t *testing.T) {
	em := ecs.NewEntityManager()
	body := bodyAt(em, 500, 500)
	container := uuid.New()
	sys := NewTimedOpenSystem()
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
	chest, sack := uuid.New(), uuid.New()
	sys := NewTimedOpenSystem()

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
