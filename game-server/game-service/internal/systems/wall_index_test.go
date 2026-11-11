package systems

import (
	"math/rand"
	"slices"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

/*
	The static wall index (FS-KE075 §E Requirements 28–29) must answer exactly as
	the full scan it replaced. fullScan below is that scan, kept as it stood in
	MovementSystem.Update: every wall, then every closed door, read from its
	components on every test. It walks them in the index's order, because the
	scan it replaced had none: it ranged over Go maps, whose iteration order is
	unspecified and randomised per range (https://go.dev/ref/spec#For_statements,
	"The iteration order over maps is not specified and is not guaranteed to be
	the same from one iteration to the next"). The index's order is one of the
	orders that scan could take; with it fixed, every answer must match bit for bit.
*/

// fullScan is the pre-index collision: every wall and door, in order, each time.
type fullScan struct {
	walls, doors []*ecs.Entity

	// how often the trace exercised each path, so a trace that never touched a
	// wall cannot pass as proof
	sweptShort, pushed, multiPushed int
}

func newFullScan(walls, doors []*ecs.Entity) *fullScan {
	return &fullScan{walls: inBlockerOrder(walls, ecs.ComponentTypeWall), doors: inBlockerOrder(doors, ecs.ComponentTypeDoor)}
}

// inBlockerOrder sorts entities by the rect order the index tests them in.
func inBlockerOrder(entities []*ecs.Entity, kind ecs.ComponentType) []*ecs.Entity {
	out := slices.Clone(entities)
	slices.SortStableFunc(out, func(a, b *ecs.Entity) int {
		ra, _ := blockerOf(a, kind)
		rb, _ := blockerOf(b, kind)
		return compareBlockers(ra, rb)
	})
	return out
}

func closedDoor(door *ecs.Entity) bool {
	openableC, hasOpenable := door.GetComponent(ecs.ComponentTypeOpenable)
	return !hasOpenable || !openableC.(*components.OpenableComponent).IsOpen
}

func (f *fullScan) sweepX(x, y, dx float64) float64 {
	minTx := 1.0
	for _, wallEntity := range f.walls {
		wallC, _ := wallEntity.GetComponent(ecs.ComponentTypeWall)
		wallTransformComp, _ := wallEntity.GetComponent(ecs.ComponentTypeTransform)
		wallTransform := wallTransformComp.(*components.TransformComponent)
		wall := wallC.(*components.WallComponent)
		if tX := SweptX(x, y, wallTransform.X, wallTransform.Y, wall.Width, wall.Height, dx); tX < minTx {
			minTx = tX
		}
	}
	for _, doorEntity := range f.doors {
		if !closedDoor(doorEntity) {
			continue
		}
		doorC, _ := doorEntity.GetComponent(ecs.ComponentTypeDoor)
		doorTransformComp, _ := doorEntity.GetComponent(ecs.ComponentTypeTransform)
		doorTransform := doorTransformComp.(*components.TransformComponent)
		door := doorC.(*components.DoorComponent)
		if tX := SweptX(x, y, doorTransform.X, doorTransform.Y, door.Width, door.Height, dx); tX < minTx {
			minTx = tX
		}
	}
	if minTx < 1 {
		f.sweptShort++
	}
	return minTx
}

func (f *fullScan) sweepY(x, y, dy float64) float64 {
	minTy := 1.0
	for _, wallEntity := range f.walls {
		wallC, _ := wallEntity.GetComponent(ecs.ComponentTypeWall)
		wallTransformComp, _ := wallEntity.GetComponent(ecs.ComponentTypeTransform)
		wallTransform := wallTransformComp.(*components.TransformComponent)
		wall := wallC.(*components.WallComponent)
		if tY := SweptY(x, y, wallTransform.X, wallTransform.Y, wall.Width, wall.Height, dy); tY < minTy {
			minTy = tY
		}
	}
	for _, doorEntity := range f.doors {
		if !closedDoor(doorEntity) {
			continue
		}
		doorC, _ := doorEntity.GetComponent(ecs.ComponentTypeDoor)
		doorTransformComp, _ := doorEntity.GetComponent(ecs.ComponentTypeTransform)
		doorTransform := doorTransformComp.(*components.TransformComponent)
		door := doorC.(*components.DoorComponent)
		if tY := SweptY(x, y, doorTransform.X, doorTransform.Y, door.Width, door.Height, dy); tY < minTy {
			minTy = tY
		}
	}
	if minTy < 1 {
		f.sweptShort++
	}
	return minTy
}

func (f *fullScan) depenetrate(newX, newY float64) (float64, float64) {
	pushes := 0
	push := func(x, y, w, h float64) {
		px, py := depenetrate(newX, newY, x, y, w, h)
		if px != newX || py != newY {
			pushes++
		}
		newX, newY = px, py
	}
	for _, wallEntity := range f.walls {
		wallC, _ := wallEntity.GetComponent(ecs.ComponentTypeWall)
		wallTransformComp, _ := wallEntity.GetComponent(ecs.ComponentTypeTransform)
		wallTransform := wallTransformComp.(*components.TransformComponent)
		wall := wallC.(*components.WallComponent)
		push(wallTransform.X, wallTransform.Y, wall.Width, wall.Height)
	}
	for _, doorEntity := range f.doors {
		if !closedDoor(doorEntity) {
			continue
		}
		doorC, _ := doorEntity.GetComponent(ecs.ComponentTypeDoor)
		doorTransformComp, _ := doorEntity.GetComponent(ecs.ComponentTypeTransform)
		doorTransform := doorTransformComp.(*components.TransformComponent)
		door := doorC.(*components.DoorComponent)
		push(doorTransform.X, doorTransform.Y, door.Width, door.Height)
	}
	if pushes > 0 {
		f.pushed++
	}
	if pushes > 1 {
		f.multiPushed++
	}
	return newX, newY
}

func addWall(em *ecs.EntityManager, x, y, w, h float64) *ecs.Entity {
	e := em.CreateEntity()
	e.AddComponent(components.NewWallComponent(uuid.New(), uuid.New(), w, h))
	e.AddComponent(components.NewTransformComponent(x, y))
	return e
}

func addDoor(em *ecs.EntityManager, x, y, w, h float64, open bool) *ecs.Entity {
	e := em.CreateEntity()
	e.AddComponent(components.NewDoorComponent(w, h))
	e.AddComponent(components.NewTransformComponent(x, y))
	e.AddComponent(components.NewOpenableComponent(open))
	return e
}

// fixtureFloor lays out a floor of size w×h: the buildings today's generator
// stamps (four walls and a door gap, AddBuilding's shape), crossing and
// touching rects, thick blocks, slivers, rects past the map's edge and a
// corridor two bodies wide, so movers meet corners, seams and doorways.
func fixtureFloor(em *ecs.EntityManager, rng *rand.Rand, w, h float64, buildings int) {
	for range buildings {
		bw, bh := 200+rng.Float64()*300, 150+rng.Float64()*250
		bx, by := rng.Float64()*(w-bw), rng.Float64()*(h-bh)
		const thick, doorW = 20.0, 80.0
		off := (bw - doorW) / 2
		addWall(em, bx, by, bw, thick)
		addWall(em, bx, by, thick, bh)
		addWall(em, bx+bw-thick, by, thick, bh)
		addWall(em, bx, by+bh-thick, off, thick)
		addWall(em, bx+off+doorW, by+bh-thick, off, thick)
		addDoor(em, bx+off, by+bh-thick, doorW, thick, rng.Intn(2) == 0)
	}
	// crossing, touching and overlapping rects
	for range buildings * 2 {
		x, y := rng.Float64()*w, rng.Float64()*h
		addWall(em, x, y, 10+rng.Float64()*200, 10+rng.Float64()*30)
		addWall(em, x+rng.Float64()*20, y-rng.Float64()*20, 10+rng.Float64()*30, 10+rng.Float64()*200)
	}
	// thick blocks and slivers
	for range buildings {
		addWall(em, rng.Float64()*w, rng.Float64()*h, 60+rng.Float64()*100, 60+rng.Float64()*100)
		addWall(em, rng.Float64()*w, rng.Float64()*h, 0.5, 80)
	}
	// past the edge: a perimeter that pokes outside the map
	addWall(em, -30, -30, w+60, 25)
	addWall(em, -30, h+5, w+60, 25)
	// a corridor two bodies wide
	cx, cy := w/2, h/2
	addWall(em, cx-200, cy-2*constants.PlayerRadius-10, 400, 10)
	addWall(em, cx-200, cy+2*constants.PlayerRadius, 400, 10)
}

func blockersOf(entities []*ecs.Entity) (walls, doors []*ecs.Entity) {
	for _, e := range entities {
		if e.HasComponent(ecs.ComponentTypeWall) {
			walls = append(walls, e)
		}
		if e.HasComponent(ecs.ComponentTypeDoor) {
			doors = append(doors, e)
		}
	}
	return walls, doors
}

// Every query the index answers, it answers as the full scan does: random
// bodies and steps all over a fixture floor, on bucket seams and off the map.
func TestWallIndex_AnswersExactlyAsTheFullScan(t *testing.T) {
	for _, size := range [][2]float64{{1440, 960}, {5760, 3840}} {
		rng := rand.New(rand.NewSource(int64(size[0])))
		em := ecs.NewEntityManager()
		fixtureFloor(em, rng, size[0], size[1], int(size[0]/100))
		walls, doors := blockersOf(em.GetAllEntities())
		index, scan := newWallIndex(walls, doors), newFullScan(walls, doors)

		for i := range 10_000 {
			x := -50 + rng.Float64()*(size[0]+100)
			y := -50 + rng.Float64()*(size[1]+100)
			if i%4 == 0 {
				// on a bucket seam
				x = float64(int(x/wallBucketSize)) * wallBucketSize
			}
			step := 1 + rng.Float64()*40
			if i%7 == 0 {
				step = 100 + rng.Float64()*300
			}
			d := (rng.Float64()*2 - 1) * step

			require.Equal(t, scan.sweepX(x, y, d), index.sweepX(x, y, d), "sweepX(%v, %v, %v)", x, y, d)
			require.Equal(t, scan.sweepY(x, y, d), index.sweepY(x, y, d), "sweepY(%v, %v, %v)", x, y, d)
			sx, sy := scan.depenetrate(x, y)
			ix, iy := index.depenetrate(x, y)
			require.Equal(t, [2]float64{sx, sy}, [2]float64{ix, iy}, "depenetrate(%v, %v)", x, y)
		}
		assert.Positive(t, scan.sweptShort, "no query was ever stopped by a wall")
		assert.Positive(t, scan.multiPushed, "no query was ever pushed out of two walls in turn")
	}
}

// traceWorld is one copy of a recorded floor: its entities in creation order,
// so a twin built from the same seed lines up entity for entity.
type traceWorld struct {
	em     *ecs.EntityManager
	all    []*ecs.Entity
	movers []*ecs.Entity
	doors  []*ecs.Entity
}

func newTraceWorld(seed int64, w, h float64, bodies int) *traceWorld {
	rng := rand.New(rand.NewSource(seed))
	tw := &traceWorld{em: ecs.NewEntityManager()}
	fixtureFloor(tw.em, rng, w, h, int(w/120))
	// the fixture comes back in a map's order; pin it by the blocker order
	walls, doors := blockersOf(tw.em.GetAllEntities())
	tw.doors = inBlockerOrder(doors, ecs.ComponentTypeDoor)
	tw.all = append(inBlockerOrder(walls, ecs.ComponentTypeWall), tw.doors...)

	// bodies packed round the doorways and corridor, so the crowd pushes itself
	// into walls and the depenetration runs in turn over several rects
	for i := range bodies {
		var x, y float64
		if i%3 == 0 && len(tw.doors) > 0 {
			dt := transformOfEntity(tw.doors[i%len(tw.doors)])
			x, y = dt.X+rng.Float64()*60-5, dt.Y+rng.Float64()*80-40
		} else if i%3 == 1 {
			x, y = w/2+rng.Float64()*300-150, h/2+rng.Float64()*60-30
		} else {
			x, y = rng.Float64()*w, rng.Float64()*h
		}
		e := mover(tw.em, x, y, 0, 0)
		if i%4 == 0 {
			// a delver in play
			e.AddComponent(components.NewPlayerComponent(uuid.New(), "warrior", "delver", false))
			e.AddComponent(components.NewHealthComponent(150, 150))
		}
		tw.movers = append(tw.movers, e)
		tw.all = append(tw.all, e)
	}
	return tw
}

func transformOfEntity(e *ecs.Entity) *components.TransformComponent {
	tc, _ := e.GetComponent(ecs.ComponentTypeTransform)
	return tc.(*components.TransformComponent)
}

// steer applies one tick's input, drawn once and given to both twins alike.
type steer struct {
	vx, vy    []float64
	charge    []int // movers that start a charge
	chargeDir [][2]float64
	toggle    []int // doors that swing
	order     []int // the tick's entity order
}

func drawSteer(rng *rand.Rand, tick, movers, doors, all int) steer {
	st := steer{order: rng.Perm(all)}
	if tick%15 == 0 {
		st.vx, st.vy = make([]float64, movers), make([]float64, movers)
		for i := range movers {
			st.vx[i], st.vy[i] = float64(rng.Intn(3)-1), float64(rng.Intn(3)-1)
		}
	}
	if tick%40 == 0 {
		for range 2 {
			st.charge = append(st.charge, rng.Intn(movers))
			st.chargeDir = append(st.chargeDir, headings[rng.Intn(len(headings))])
		}
	}
	if tick%25 == 0 && doors > 0 {
		st.toggle = append(st.toggle, rng.Intn(doors))
	}
	return st
}

// headings is a compass of eight charge directions.
var headings = [8][2]float64{{1, 0}, {0.7071067811865476, 0.7071067811865476}, {0, 1}, {-0.7071067811865476, 0.7071067811865476}, {-1, 0}, {-0.7071067811865476, -0.7071067811865476}, {0, -1}, {0.7071067811865476, -0.7071067811865476}}

func (tw *traceWorld) apply(st steer) []*ecs.Entity {
	if st.vx != nil {
		for i, m := range tw.movers {
			vc, _ := m.GetComponent(ecs.ComponentTypeVelocity)
			v := vc.(*components.VelocityComponent)
			v.VX, v.VY = st.vx[i], st.vy[i]
		}
	}
	for i, idx := range st.charge {
		tw.movers[idx].AddComponent(&components.DashComponent{DirX: st.chargeDir[i][0], DirY: st.chargeDir[i][1], Speed: 900, Remaining: 240})
	}
	for _, idx := range st.toggle {
		oc, _ := tw.doors[idx].GetComponent(ecs.ComponentTypeOpenable)
		o := oc.(*components.OpenableComponent)
		o.IsOpen = !o.IsOpen
	}
	// a spent or stopped charge ends, as the CombatSystem ends it
	for _, m := range tw.movers {
		if dc, ok := m.GetComponent(ecs.ComponentTypeDash); ok && dc.(*components.DashComponent).Remaining <= 0 {
			m.RemoveComponent(ecs.ComponentTypeDash)
		}
	}
	ordered := make([]*ecs.Entity, len(tw.all))
	for i, j := range st.order {
		ordered[i] = tw.all[j]
	}
	return ordered
}

// Recorded mover traces give identical positions with the index and with the
// full scan, tick by tick: walking, crowding, charging, and doors swinging,
// on a floor of today's size and one of floor 1's. FS-KE075 AC "Collision".
func TestMovementSystem_IndexedTrace_MatchesTheFullScanTickByTick(t *testing.T) {
	for _, tc := range []struct {
		name          string
		size          [2]float64
		bodies, ticks int
	}{
		{"floor 2's size", [2]float64{constants.MapWidth, constants.MapHeight}, 90, 600},
		// the full scan over a dungeon's rects is slow under -race
		{"floor 1's size", [2]float64{5760, 3840}, 45, 300},
	} {
		size, bodies, ticks := tc.size, tc.bodies, tc.ticks
		t.Run(tc.name, func(t *testing.T) {
			const seed = 11
			indexed, scanned := newTraceWorld(seed, size[0], size[1], bodies), newTraceWorld(seed, size[0], size[1], bodies)
			require.Len(t, scanned.all, len(indexed.all))

			withIndex := &MovementSystem{MapWidth: size[0], MapHeight: size[1]}
			withScan := &MovementSystem{MapWidth: size[0], MapHeight: size[1]}
			var scan *fullScan
			scanOf := func(walls, doors []*ecs.Entity) wallTests {
				scan = newFullScan(walls, doors)
				return scan
			}

			rng := rand.New(rand.NewSource(seed))
			short, pushed, multi := 0, 0, 0
			for tick := range ticks {
				st := drawSteer(rng, tick, bodies, len(indexed.doors), len(indexed.all))
				withIndex.Update(tickSeconds, indexed.apply(st))
				withScan.update(tickSeconds, scanned.apply(st), scanOf)
				short, pushed, multi = short+scan.sweptShort, pushed+scan.pushed, multi+scan.multiPushed

				for i := range indexed.movers {
					a, b := transformOfEntity(indexed.movers[i]), transformOfEntity(scanned.movers[i])
					require.Equal(t, [2]float64{b.X, b.Y}, [2]float64{a.X, a.Y}, "tick %d, mover %d", tick, i)
				}
			}
			assert.Positive(t, short, "the trace never swept into a wall")
			assert.Positive(t, pushed, "the trace never pushed a body out of a wall")
			assert.Positive(t, multi, "the trace never pushed a body out of two walls in turn")
		})
	}
}

// The index follows the floor: once the walls and doors change, it holds only
// the new ones, and an old wall no longer stops anyone. FS-KE075 §E R28.
func TestMovementSystem_WallsChange_IndexHoldsOnlyTheNewFloor(t *testing.T) {
	em := ecs.NewEntityManager()
	sys := NewMovementSystem()

	oldWall := addWall(em, 400, 0, 20, constants.MapHeight)
	oldDoor := addDoor(em, 600, 100, 50, 20, false)
	walker := mover(em, 400-constants.PlayerRadius-1, 300, 1, 0)

	sys.Update(tickSeconds, em.GetAllEntities())
	require.NotNil(t, sys.walls)
	assert.Equal(t, 2, len(sys.walls.blockers))
	assert.InDelta(t, 400-constants.PlayerRadius, transformOfEntity(walker).X, 1e-9, "the old wall stops the walker")

	// the floor changes: its walls and doors go, the next floor's stand
	em.RemoveEntity(oldWall.ID)
	em.RemoveEntity(oldDoor.ID)
	newWall := addWall(em, 1000, 500, 300, 20)
	newDoor := addDoor(em, 1300, 500, 50, 20, false)

	for range 60 {
		sys.Update(tickSeconds, em.GetAllEntities())
	}

	assert.Greater(t, transformOfEntity(walker).X, 400+20+constants.PlayerRadius, "an old-floor wall still stopped the walker")
	got := map[uuid.UUID]bool{}
	for id := range sys.walls.members {
		got[id] = true
	}
	assert.Equal(t, map[uuid.UUID]bool{newWall.ID: true, newDoor.ID: true}, got)
	want := []blocker{{x: 1000, y: 500, w: 300, h: 20}, {x: 1300, y: 500, w: 50, h: 20, door: newDoor}}
	assert.Equal(t, want, sys.walls.blockers, "the index holds a rect of the old floor")
}

// A floor that keeps its walls keeps its index: it is built once, not every tick.
func TestMovementSystem_SameWalls_IndexIsKept(t *testing.T) {
	em := ecs.NewEntityManager()
	sys := NewMovementSystem()
	addWall(em, 400, 0, 20, 300)
	addDoor(em, 600, 100, 50, 20, false)
	mover(em, 100, 100, 1, 0)

	sys.Update(tickSeconds, em.GetAllEntities())
	built := sys.walls
	for range 10 {
		sys.Update(tickSeconds, em.GetAllEntities())
	}

	assert.Same(t, built, sys.walls)
}

// A wall added during a floor, outside any floor build, still blocks: the index
// is rebuilt the tick it appears.
func TestMovementSystem_WallAddedMidFloor_Blocks(t *testing.T) {
	em := ecs.NewEntityManager()
	sys := NewMovementSystem()
	walker := mover(em, 100, 300, 1, 0)
	sys.Update(tickSeconds, em.GetAllEntities())

	addWall(em, 200, 0, 20, constants.MapHeight)
	for range 120 {
		sys.Update(tickSeconds, em.GetAllEntities())
	}

	assert.InDelta(t, 200-constants.PlayerRadius, transformOfEntity(walker).X, 1e-9)
}

// The spatial hash keeps rows apart only while a world is at most 255 cells
// tall (FS-QG1HR D4).
func TestSpatialHashRows(t *testing.T) {
	assert.Equal(t, 255, SpatialHashMaxRows)
	assert.Equal(t, 24, SpatialHashRows(constants.MapHeight))
	assert.Equal(t, 96, SpatialHashRows(3840))
	assert.Equal(t, 255, SpatialHashRows(10_200))
	assert.Equal(t, 256, SpatialHashRows(10_201))
}

// One movement tick on a floor of floor 1's size, 4 delvers and 70 monsters
// walking among a dungeon's worth of rects, with the index and with the full
// scan it replaced. FS-KE075 §E R28.
func BenchmarkMovement_FloorOneScale(b *testing.B) {
	for _, bc := range []struct {
		name    string
		against func(*MovementSystem) func(walls, doors []*ecs.Entity) wallTests
	}{
		{"index", func(s *MovementSystem) func(walls, doors []*ecs.Entity) wallTests { return s.wallIndexOf }},
		{"full scan", func(*MovementSystem) func(walls, doors []*ecs.Entity) wallTests {
			return func(walls, doors []*ecs.Entity) wallTests { return newFullScan(walls, doors) }
		}},
	} {
		b.Run(bc.name, func(b *testing.B) {
			tw := newTraceWorld(3, 5760, 3840, 74)
			sys := &MovementSystem{MapWidth: 5760, MapHeight: 3840}
			against := bc.against(sys)
			rng := rand.New(rand.NewSource(3))
			walls, doors := blockersOf(tw.all)
			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				st := drawSteer(rng, i, len(tw.movers), len(tw.doors), len(tw.all))
				sys.update(tickSeconds, tw.apply(st), against)
			}
			b.ReportMetric(float64(len(walls)+len(doors)), "rects")
		})
	}
}
