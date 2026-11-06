package systems

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/navigation"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const navCell = 80.0

/*
behindAWall is a fixture dungeon floor of 80 px cells: two halls joined by a
gap at the east end of the rock between them.

	##########
	#........#   the monster's hall, rows 1-2
	#........#
	#######..#   the rock between, a gap at columns 7-8
	#........#   the delver's hall, rows 4-5
	#........#
	##########
*/
var behindAWall = []string{
	"##########",
	"#........#",
	"#........#",
	"#######..#",
	"#........#",
	"#........#",
	"##########",
}

// floorOf lays a fixture floor out: a wall entity on every rock cell, as a
// dungeon floor's shell walls stand on its rock (ADR-0061), its navigation
// grid, and a movement system bounded to it.
func floorOf(t *testing.T, em *ecs.EntityManager, rows []string) (*navigation.Grid, *MovementSystem) {
	t.Helper()
	cols := len(rows[0])
	walkable := make([]bool, 0, cols*len(rows))
	for y, row := range rows {
		require.Len(t, row, cols)
		for x, c := range row {
			walkable = append(walkable, c == '.')
			if c == '#' {
				wall := em.CreateEntity()
				wall.AddComponent(components.NewTransformComponent(float64(x)*navCell, float64(y)*navCell))
				wall.AddComponent(&components.WallComponent{Width: navCell, Height: navCell})
			}
		}
	}
	move := &MovementSystem{MapWidth: float64(cols) * navCell, MapHeight: float64(len(rows)) * navCell}
	return navigation.NewGrid(cols, len(rows), navCell, walkable), move
}

// patrol ticks the AI and then movement, as a run's tick does, for seconds.
func patrol(em *ecs.EntityManager, ai *MonsterAISystem, move *MovementSystem, seconds float64) {
	for range ticks(seconds) {
		entities := em.GetAllEntities()
		ai.Update(tickSeconds, entities)
		move.Update(tickSeconds, entities)
	}
}

// provoke has the delver hit the monster, so it is taken up at any distance.
func provoke(g, d *ecs.Entity) { monster(g).LastAttacker = d.ID }

// On a dungeon floor a monster on the far side of rock from its target walks
// round by path and reaches it; on floor 2, with no grid, the same setup
// chases straight and stays pressed against the rock. FS-KE075 §D R23, R26;
// AC "a monster on the far side of a wall".
func TestMonsterAISystem_TargetBehindAWall(t *testing.T) {
	tests := []struct {
		name    string
		onFloor func(*navigation.Grid) NavGrid
		reaches bool
	}{
		{"floor 1: walks round by path", func(g *navigation.Grid) NavGrid { return g }, true},
		{"floor 2: chases straight into the rock", func(*navigation.Grid) NavGrid { return nil }, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			grid, move := floorOf(t, em, behindAWall)
			// off its cell's centre, so its first steps hug the rock below
			g := hunter(em, 130, 205)
			// straight-line distance stays inside the leash all the way round
			d := delver(em, 360, 440)
			provoke(g, d)

			patrol(em, NewMonsterAISystem(firstRoll, tt.onFloor(grid)), move, 15)

			gap := distance(transformOf(t, g), transformOf(t, d))
			if tt.reaches {
				assert.LessOrEqual(t, gap, monster(g).AttackRange, "never reached its target")
				return
			}
			assert.Greater(t, gap, 200.0, "got round the rock with no grid")
			assert.InDelta(t, 220.0, transformOf(t, g).Y, 1, "not pressed against the rock's top")
		})
	}
}

// countingGrid is a grid that counts its searches, and the tick each happened
// on; with fail set, every search finds nothing.
type countingGrid struct {
	*navigation.Grid
	fail     bool
	tick     int
	searches []int
}

func (c *countingGrid) Path(dst []int, from, to int) ([]int, bool) {
	c.searches = append(c.searches, c.tick)
	if c.fail {
		return dst, false
	}
	return c.Grid.Path(dst, from, to)
}

// openGround is a 20 x 20 floor of nothing but walkable cells.
func openGround(t *testing.T, em *ecs.EntityManager) *navigation.Grid {
	t.Helper()
	rows := make([]string, 20)
	for i := range rows {
		rows[i] = "...................."
	}
	grid, _ := floorOf(t, em, rows)
	return grid
}

// rooted stands a monster at (x, y) that cannot move, so its path is never
// used up and only its target's moves drive its searches.
func rooted(em *ecs.EntityManager, x, y float64) *ecs.Entity {
	g := hunter(em, x, y)
	velocityOfEntity(g).Speed = 0
	return g
}

func velocityOfEntity(e *ecs.Entity) *components.VelocityComponent {
	c, _ := e.GetComponent(ecs.ComponentTypeVelocity)
	return c.(*components.VelocityComponent)
}

// circle moves the delver round (cx, cy) at radius r, a new cell most ticks.
func circle(t *testing.T, d *ecs.Entity, cx, cy, r float64, tick int) {
	angle := float64(tick) * 0.05
	moveTo(t, d, cx+r*math.Cos(angle), cy+r*math.Sin(angle))
}

// A chasing monster whose target keeps changing cell searches again, but never
// twice within 0.5 s. FS-KE075 §D R24; AC "searches at most once per 0.5 s".
func TestMonsterAISystem_MovingTarget_SearchesAtMostEveryHalfSecond(t *testing.T) {
	em := ecs.NewEntityManager()
	grid := &countingGrid{Grid: openGround(t, em)}
	g := rooted(em, 800, 800)
	d := delver(em, 1100, 800)
	provoke(g, d)
	ai := NewMonsterAISystem(firstRoll, grid)

	n := ticks(3)
	for tick := range n {
		grid.tick = tick
		circle(t, d, 800, 800, 300, tick)
		ai.Update(tickSeconds, em.GetAllEntities())
	}

	require.NotEmpty(t, grid.searches)
	assert.GreaterOrEqual(t, len(grid.searches), 6, "a moving target is searched for again")
	assert.LessOrEqual(t, len(grid.searches), 7)
	for i := 1; i < len(grid.searches); i++ {
		apart := float64(grid.searches[i]-grid.searches[i-1]) * tickSeconds
		assert.GreaterOrEqual(t, apart, 0.5-1e-9, "searches %d and %d %.3f s apart", i-1, i, apart)
	}
}

// A target that keeps to its cell is searched for once: the monster follows
// that path rather than searching again. FS-KE075 §D R24.
func TestMonsterAISystem_StillTarget_SearchedForOnce(t *testing.T) {
	em := ecs.NewEntityManager()
	grid := &countingGrid{Grid: openGround(t, em)}
	g := rooted(em, 200, 200)
	d := delver(em, 600, 200)
	provoke(g, d)
	ai := NewMonsterAISystem(firstRoll, grid)

	for range ticks(3) {
		ai.Update(tickSeconds, em.GetAllEntities())
	}

	assert.Len(t, grid.searches, 1)
}

// A search that finds nothing leaves the monster steering straight at its
// target, today's chase, and it tries again no more than every 0.5 s: it
// never spins on searches. FS-KE075 §D R27.
func TestMonsterAISystem_SearchFails_SteersStraightAndRetriesAtTheThrottle(t *testing.T) {
	em := ecs.NewEntityManager()
	grid := &countingGrid{Grid: openGround(t, em), fail: true}
	g := rooted(em, 200, 200)
	d := delver(em, 600, 500)
	provoke(g, d)
	ai := NewMonsterAISystem(firstRoll, grid)

	for tick := range ticks(2) {
		grid.tick = tick
		ai.Update(tickSeconds, em.GetAllEntities())
	}

	assert.InDelta(t, 0.8, velocityOf(t, g).VX, 1e-9)
	assert.InDelta(t, 0.6, velocityOf(t, g).VY, 1e-9)
	assert.LessOrEqual(t, len(grid.searches), 5)
	for i := 1; i < len(grid.searches); i++ {
		assert.GreaterOrEqual(t, float64(grid.searches[i]-grid.searches[i-1])*tickSeconds, 0.5-1e-9)
	}
}

// A target sharing the monster's cell, or in a neighbouring cell the step rule
// allows, is steered at straight, with no search. FS-KE075 §D R23.
func TestMonsterAISystem_TargetNear_SteersStraightWithoutASearch(t *testing.T) {
	tests := []struct {
		name         string
		dx, dy       float64
		wantVX, want float64
	}{
		{"same cell", 20, 0, 1, 0},
		{"orthogonal neighbour", 0, 90, 0, 1},
		{"diagonal neighbour", 60, 80, 0.6, 0.8},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			grid := &countingGrid{Grid: openGround(t, em)}
			g := hunter(em, 210, 210)
			d := delver(em, 210+tt.dx, 210+tt.dy)
			provoke(g, d)
			monster(g).AttackRange = 1 // chasing, not swinging

			NewMonsterAISystem(firstRoll, grid).Update(tickSeconds, em.GetAllEntities())

			assert.Empty(t, grid.searches)
			assert.InDelta(t, tt.wantVX, velocityOf(t, g).VX, 1e-9)
			assert.InDelta(t, tt.want, velocityOf(t, g).VY, 1e-9)
		})
	}
}

// A target diagonally next door past a rock corner is not near: the monster
// takes the path round the corner, never straight through it. FS-KE075 §D R23.
func TestMonsterAISystem_TargetPastARockCorner_IsPathedTo(t *testing.T) {
	em := ecs.NewEntityManager()
	grid, _ := floorOf(t, em, []string{
		".#..",
		"....",
		"....",
	})
	counting := &countingGrid{Grid: grid}
	g := hunter(em, 40, 40)
	d := delver(em, 120, 120)
	provoke(g, d)
	monster(g).AttackRange = 1

	NewMonsterAISystem(firstRoll, counting).Update(tickSeconds, em.GetAllEntities())

	assert.Len(t, counting.searches, 1)
	// the path runs down the west side: straight down, not diagonally into the rock
	assert.InDelta(t, 0.0, velocityOf(t, g).VX, 1e-9)
	assert.InDelta(t, 1.0, velocityOf(t, g).VY, 1e-9)
}

// With no target a monster on a dungeon floor wanders to the centre of a
// walkable cell within 150 px of home, whatever the roll. FS-KE075 §D R25.
func TestMonsterAISystem_WanderDestination_IsAWalkableCellNearHome(t *testing.T) {
	rows := []string{
		"..........",
		"..##......",
		"..##......",
		"..........",
		"..........",
	}
	for roll := 0.0; roll < 1; roll += 0.03 {
		em := ecs.NewEntityManager()
		grid, _ := floorOf(t, em, rows)
		g := rooted(em, 330, 170)

		NewMonsterAISystem(func() float64 { return roll }, grid).Update(tickSeconds, em.GetAllEntities())

		w := monster(g).Wander
		require.True(t, w.HasDestination, "roll %v", roll)
		c, ok := grid.Cell(w.DestinationX, w.DestinationY)
		require.True(t, ok, "roll %v: destination (%v, %v) on rock", roll, w.DestinationX, w.DestinationY)
		cx, cy := grid.Centre(c)
		assert.Equal(t, cx, w.DestinationX, "roll %v: not a cell centre", roll)
		assert.Equal(t, cy, w.DestinationY, "roll %v: not a cell centre", roll)
		assert.LessOrEqual(t, math.Hypot(cx-330, cy-170), constants.MonsterHomeRadius, "roll %v", roll)
	}
}

// Every walkable cell within the home radius is a destination some roll picks.
func TestMonsterAISystem_WanderDestination_EveryNearCellCanBePicked(t *testing.T) {
	em := ecs.NewEntityManager()
	grid := openGround(t, em)
	want := grid.Within(nil, 410, 410, constants.MonsterHomeRadius)
	picked := map[int]bool{}
	for i := range 1000 {
		em := ecs.NewEntityManager()
		g := rooted(em, 410, 410)
		roll := float64(i) / 1000
		NewMonsterAISystem(func() float64 { return roll }, grid).Update(tickSeconds, em.GetAllEntities())
		w := monster(g).Wander
		c, _ := grid.Cell(w.DestinationX, w.DestinationY)
		picked[c] = true
	}
	assert.Len(t, picked, len(want))
}

// A monster pulled off to the far side of the rock with nobody left to chase
// walks home by path; on floor 2 the same monster, wandering straight at
// points by home, stays on the far side. FS-KE075 §D R25; AC "a leashing
// monster walks home by path".
func TestMonsterAISystem_Leashed_WalksHomeByPath(t *testing.T) {
	tests := []struct {
		name    string
		onFloor func(*navigation.Grid) NavGrid
		home    bool
	}{
		{"floor 1", func(g *navigation.Grid) NavGrid { return g }, true},
		{"floor 2", func(*navigation.Grid) NavGrid { return nil }, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			grid, move := floorOf(t, em, behindAWall)
			g := hunter(em, 120, 120)
			moveTo(t, g, 120, 440)

			patrol(em, NewMonsterAISystem(firstRoll, tt.onFloor(grid)), move, 20)

			y := transformOf(t, g).Y
			if tt.home {
				assert.Less(t, y, 240.0, "still on the far side of the rock")
				assert.LessOrEqual(t, distance(transformOf(t, g), components.NewTransformComponent(120, 120)),
					constants.MonsterHomeRadius+navCell, "not by home")
				return
			}
			assert.Greater(t, y, 320.0, "got home with no grid")
		})
	}
}

// A monster that drops its target forgets the path it had to them.
func TestMonsterAISystem_TargetDropped_ForgetsThePath(t *testing.T) {
	em := ecs.NewEntityManager()
	grid := openGround(t, em)
	g := rooted(em, 200, 200)
	d := delver(em, 600, 200)
	provoke(g, d)
	ai := NewMonsterAISystem(firstRoll, grid)
	ai.Update(tickSeconds, em.GetAllEntities())
	require.NotEmpty(t, monster(g).Route.Cells)

	moveTo(t, d, 1500, 1500) // beyond the leash
	ai.Update(tickSeconds, em.GetAllEntities())

	assert.True(t, monster(g).Wander.HasDestination)
	assert.Empty(t, monster(g).Route.Cells, "still holding the path to the dropped target")
}

// A target whose centre is off the walkable cells (pushed onto a rock cell's
// edge, say) has no cell to search to: the monster steers straight at them,
// today's chase, and never searches, so it cannot spin on searches that fail.
// FS-KE075 §D R27, §Edge States.
func TestMonsterAISystem_TargetOffTheWalkableCells_SteersStraightWithoutASearch(t *testing.T) {
	em := ecs.NewEntityManager()
	grid, _ := floorOf(t, em, []string{
		"......",
		"......",
		".....#",
	})
	counting := &countingGrid{Grid: grid}
	g := hunter(em, 40, 40)
	d := delver(em, 420, 200) // in the rock cell at (5, 2)
	provoke(g, d)
	ai := NewMonsterAISystem(firstRoll, counting)

	for range ticks(2) {
		ai.Update(tickSeconds, em.GetAllEntities())
	}

	assert.Empty(t, counting.searches)
	want := math.Atan2(200-40, 420-40)
	assert.InDelta(t, math.Cos(want), velocityOf(t, g).VX, 1e-9)
	assert.InDelta(t, math.Sin(want), velocityOf(t, g).VY, 1e-9)
}
