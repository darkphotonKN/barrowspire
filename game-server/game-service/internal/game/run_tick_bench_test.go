package game

import (
	"context"
	"testing"
	"time"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/serializer"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

// fullRun is a built floor holding 2 delvers, 14 standard monsters and a demon,
// the heaviest population a floor rolls. FS-77AB6 AC "benchmark".
func fullRun(b *testing.B) (*Session, []uuid.UUID, *ecs.Entity) {
	b.Helper()

	em := ecs.NewEntityManager()
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, em, &mockEventEmitter{}, &countingItemsClient{}, RunBounds())
	s.spawnRand = seededSpawns(7)
	s.InitialSystems()
	// nothing drains this in a benchmark; the delvers are kept alive anyway
	s.endSessionCh = make(chan bool, 1)

	delvers := []uuid.UUID{uuid.New(), uuid.New()}
	for i, class := range []string{"archer", "mage"} {
		entity, _ := em.GetEntity(s.AddPlayer(delvers[i], types.CharacterInPlay{Name: "Delver", Class: class}))
		tc, _ := entity.GetComponent(ecs.ComponentTypeTransform)
		at := tc.(*components.TransformComponent)
		at.X, at.Y = 300+float64(i)*80, 300
	}

	s.InitialMapObjects()

	// replace whatever the floor rolled with the full population
	for _, m := range monstersInWorld(em) {
		em.RemoveEntity(m.ID)
	}
	entities := em.GetAllEntities()
	area := spawnArea{
		width:   s.mapWidth,
		height:  s.mapHeight,
		keepOut: mapKeepOut(entities),
		delvers: inPlayPositions(delversOf(entities)),
	}
	for i := range MonsterCountMax {
		archetype := components.MonsterArchetypeGhoul
		if i%3 == 0 {
			archetype = components.MonsterArchetypeTroll
		}
		x, y, ok := area.place(s.spawnRand)
		if !ok {
			b.Fatalf("monster %d found no spawn point", i)
		}
		CreateMonsterEntity(em, MonsterConfig{Archetype: archetype, Level: 3, X: x, Y: y})
		area.placed = append(area.placed, point{x, y})
	}
	x, y, ok := area.placeFarthest(s.spawnRand, area.valid)
	if !ok {
		b.Fatal("the demon found no spawn point")
	}
	demon := CreateMonsterEntity(em, MonsterConfig{Archetype: components.MonsterArchetypeDemon, Level: 5, Boss: true, X: x, Y: y})

	return s, delvers, demon
}

func monstersInWorld(em *ecs.EntityManager) []*ecs.Entity {
	var out []*ecs.Entity
	for _, e := range em.GetAllEntities() {
		if e.HasComponent(ecs.ComponentTypeEnemy) {
			out = append(out, e)
		}
	}
	return out
}

// keepStanding tops every delver's and monster's health up, so the whole cast
// stays in play however long the benchmark runs.
func keepStanding(em *ecs.EntityManager) {
	for _, e := range em.GetAllEntities() {
		if hc, ok := e.GetComponent(ecs.ComponentTypeHealth); ok {
			health := hc.(*components.HealthComponent)
			health.CurrentHealth = health.MaxHealth
		}
	}
}

// One full run tick, as the game loop runs it: the simulation step plus the
// state serialization for every delver (the socket send excluded). The two
// delvers loose an arrow and a fireball every few ticks, so projectiles are
// always in flight, while 15 monsters wander, chase and strike. The budget at
// 30 ticks a second is 33 ms. FS-77AB6 AC "benchmark"; FS-QG1HR parked wall/door
// index.
func BenchmarkRunTick_FullFloor(b *testing.B) {
	s, delvers, demon := fullRun(b)
	stateSerializer := serializer.NewStateSerializer(s.EntityManager)
	ctx := context.Background()
	deltaTime := 1.0 / float64(constants.GameFrameRate)

	dc, _ := demon.GetComponent(ecs.ComponentTypeTransform)
	aim := dc.(*components.TransformComponent)

	if got := len(monstersInWorld(s.EntityManager)); got != MonsterCountMax+1 {
		b.Fatalf("the floor holds %d monsters, want %d", got, MonsterCountMax+1)
	}

	var slowest time.Duration
	inFlight := 0
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		start := time.Now()

		keepStanding(s.EntityManager)
		if i%8 == 0 {
			_ = s.handleCastSkill(delvers[0], "arrow", aim.X, aim.Y)
			_ = s.handleCastSkill(delvers[1], "fireball", aim.X, aim.Y)
		}

		entities := s.EntityManager.GetAllEntities()
		s.step(deltaTime, entities)
		for _, e := range entities {
			if e.HasComponent(ecs.ComponentTypeProjectile) {
				inFlight++
			}
		}

		backendState, err := stateSerializer.SerializeBackendState(ctx, s.ID, s.worldType, entities)
		if err != nil {
			b.Fatal(err)
		}
		for _, playerID := range delvers {
			stateSerializer.FormatStateToClientState(backendState, playerID)
		}
		stateSerializer.PutBackendState(backendState)

		slowest = max(slowest, time.Since(start))
	}
	b.ReportMetric(float64(slowest.Microseconds())/1000, "worst-ms/tick")
	b.ReportMetric(float64(inFlight)/float64(b.N), "projectiles/tick")
}
