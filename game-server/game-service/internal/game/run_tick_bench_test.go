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

// fullRun is a built floor at depth holding 2 delvers, 14 standard monsters and
// a demon, the heaviest population a floor of buildings rolls. FS-77AB6 AC
// "benchmark". A floor above the first is reached by the floor change itself,
// so its walls are the ones a climb leaves standing (FS-KE075 §E: floors 2–3
// move as today). On floor 1, a dungeon, the monsters stand on its rooms'
// walkable cells.
func fullRun(b *testing.B, depth int) (*Session, []uuid.UUID, *ecs.Entity) {
	b.Helper()
	return populatedRun(b, depth, []string{"archer", "mage"}, MonsterCountMax, MonsterDelverExclusion)
}

// populatedRun is a built floor at depth holding a delver of each class, count
// standard monsters at least clear of the delvers, and a demon.
func populatedRun(b *testing.B, depth int, classes []string, count int, clear float64) (*Session, []uuid.UUID, *ecs.Entity) {
	b.Helper()

	em := ecs.NewEntityManager()
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, em, &mockEventEmitter{}, &countingItemsClient{}, RunBounds())
	s.spawnRand = seededSpawns(7)
	s.InitialSystems()
	// nothing drains this in a benchmark; the delvers are kept alive anyway
	s.endSessionCh = make(chan bool, 1)

	delvers := make([]uuid.UUID, len(classes))
	for i, class := range classes {
		delvers[i] = uuid.New()
		entity, _ := em.GetEntity(s.AddPlayer(delvers[i], types.CharacterInPlay{Name: "Delver", Class: class}, ""))
		tc, _ := entity.GetComponent(ecs.ComponentTypeTransform)
		at := tc.(*components.TransformComponent)
		at.X, at.Y = 300+float64(i)*80, 300
	}

	s.InitialMapObjects(nil)
	for range depth - firstFloor {
		if err := s.regenerateFloor(); err != nil {
			b.Fatal(err)
		}
	}

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
	fits := func(x, y float64) bool { return area.open(x, y) && area.nearestDelver(x, y) >= clear }
	place := func() (x, y float64, ok bool) {
		for range MonsterPlacementAttempts {
			if x, y = area.candidate(s.spawnRand); fits(x, y) {
				return x, y, true
			}
		}
		return 0, 0, false
	}
	if s.dungeon != nil {
		place = onDungeonRooms(s, &area, fits)
	}
	for i := range count {
		archetype := components.MonsterArchetypeGhoul
		if i%3 == 0 {
			archetype = components.MonsterArchetypeTroll
		}
		x, y, ok := place()
		if !ok {
			b.Fatalf("monster %d found no spawn point", i)
		}
		CreateMonsterEntity(em, MonsterConfig{Archetype: archetype, Level: 3, X: x, Y: y})
		area.placed = append(area.placed, point{x, y})
	}

	demon := MonsterConfig{Archetype: components.MonsterArchetypeDemon, Level: 5, Boss: true}
	if s.dungeon != nil {
		// in the farthest room, as a dungeon floor's own demon stands
		s.placeDungeonDemon(s.dungeon, &area, demon, depth, demonGuaranteed)
		for _, m := range monstersInWorld(em) {
			if monsterOf(m).Boss {
				return s, delvers, m
			}
		}
		b.Fatal("the demon found no spawn point")
	}
	x, y, ok := area.placeFarthest(s.spawnRand, area.valid)
	if !ok {
		b.Fatal("the demon found no spawn point")
	}
	demon.X, demon.Y = x, y
	return s, delvers, CreateMonsterEntity(em, demon)
}

// onDungeonRooms places one monster at a time on a dungeon floor's rooms but
// the start, room after room in turn, by the population's own region
// sampling (placeOnRegion): walkable cells, off doorways, fits accepting.
func onDungeonRooms(s *Session, area *spawnArea, fits func(x, y float64) bool) func() (x, y float64, ok bool) {
	d := s.dungeon
	var rooms []int
	for room := range d.layout.Rooms {
		if room != d.layout.Roles.Start {
			rooms = append(rooms, room)
		}
	}
	next := 0
	return func() (x, y float64, ok bool) {
		for range rooms {
			room := rooms[next%len(rooms)]
			next++
			if x, y, ok = area.placeOnRegion(s.spawnRand, d, d.roomRegion(room), fits); ok {
				return x, y, true
			}
		}
		return 0, 0, false
	}
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
	benchmarkRunTick(b, firstFloor)
}

// The same tick on floor 2, built by today's generator: a static wall index must
// leave it no slower (FS-KE075 §E, I-KE075-2).
func BenchmarkRunTick_FullFloor2(b *testing.B) {
	benchmarkRunTick(b, firstFloor+1)
}

// The FS-KE075 target on the generated floor 1: 4 delvers and 70 monsters, all
// chasing by A* path (I-KE075-8), with each delver's snapshot cut by distance.
// A mean tick under 8 ms, a quarter of the 33 ms budget (FS-KE075 AC "run tick
// bench").
func BenchmarkRunTick_DungeonFloor1(b *testing.B) {
	s, delvers, demon := populatedRun(b, firstFloor, []string{"archer", "mage", "warrior", "archer"}, 70, 0)
	if s.dungeon == nil {
		b.Fatal("floor 1 is not a dungeon")
	}
	runTicks(b, s, delvers, demon, 71, huntAll(s, delvers))
}

// The same floor with every delver stepping a cell to and fro every half
// second, so every chasing monster's target keeps changing cell and each
// searches again as often as the 0.5 s repath interval lets it: the
// pathfinding's steady worst (FS-KE075 §D R24).
func BenchmarkRunTick_DungeonFloor1_DelversChangingCell(b *testing.B) {
	s, delvers, demon := populatedRun(b, firstFloor, []string{"archer", "mage", "warrior", "archer"}, 70, 0)
	if s.dungeon == nil {
		b.Fatal("floor 1 is not a dungeon")
	}
	hunt := huntAll(s, delvers)
	centre := s.dungeon.roomCentre(s.dungeon.layout.Roles.Start)
	cell := s.dungeon.layout.CellSize

	type stance struct {
		at      *components.TransformComponent
		x, step float64
	}
	var stances []stance
	for _, id := range delvers {
		e, _ := s.EntityManager.GetEntity(s.playerIDToEntitiesID[id])
		tc, _ := e.GetComponent(ecs.ComponentTypeTransform)
		at := tc.(*components.TransformComponent)
		// a cell towards the start room's centre stays in the room
		step := cell
		if at.X > centre.x {
			step = -cell
		}
		stances = append(stances, stance{at: at, x: at.X, step: step})
	}

	tick := 0
	runTicks(b, s, delvers, demon, 71, func() {
		hunt()
		away := (tick/(constants.GameFrameRate/2))%2 == 1
		for _, st := range stances {
			st.at.X = st.x
			if away {
				st.at.X += st.step
			}
		}
		tick++
	})
}

// huntAll has every monster without a target take up one of the delvers, as
// if each had been hit.
func huntAll(s *Session, delvers []uuid.UUID) func() {
	return func() {
		for i, m := range monstersInWorld(s.EntityManager) {
			monster := monsterOf(m)
			if monster.Target == uuid.Nil {
				monster.LastAttacker = s.playerIDToEntitiesID[delvers[i%len(delvers)]]
			}
		}
	}
}

func benchmarkRunTick(b *testing.B, depth int) {
	s, delvers, demon := fullRun(b, depth)
	runTicks(b, s, delvers, demon, MonsterCountMax+1, func() {})
}

// runTicks times b.N full run ticks on s, everyone kept standing, the first two
// delvers casting at the demon every eighth tick and each tick starting with
// before.
func runTicks(b *testing.B, s *Session, delvers []uuid.UUID, demon *ecs.Entity, monsters int, before func()) {
	stateSerializer := serializer.NewStateSerializer(s.EntityManager, nil)
	ctx := context.Background()
	deltaTime := 1.0 / float64(constants.GameFrameRate)

	dc, _ := demon.GetComponent(ecs.ComponentTypeTransform)
	aim := dc.(*components.TransformComponent)

	if got := len(monstersInWorld(s.EntityManager)); got != monsters {
		b.Fatalf("the floor holds %d monsters, want %d", got, monsters)
	}

	var slowest time.Duration
	inFlight := 0
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		start := time.Now()

		keepStanding(s.EntityManager)
		before()
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
