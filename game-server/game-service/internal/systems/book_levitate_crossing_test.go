package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/navigation"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §J R51 as reconciled at wave 2. I-X2CMM-16: FS-5FZ4J has no fall
// rule, so a delver whose afloat ends over a shut pit is set down on the
// nearest walkable cell, unhurt.

// chasmCell is the set-down floor's cell edge, px.
const chasmCell = 80.0

// chasmFloor is a 10 x 10 floor of ground with a pit band over columns 4 and
// 5: their cells unwalkable on the grid and a shut pit barrier laid over them.
func chasmFloor(t *testing.T) (*ecs.EntityManager, *navigation.Grid, *ecs.Entity) {
	t.Helper()
	walkable := make([]bool, 10*10)
	for i := range walkable {
		walkable[i] = i%10 != 4 && i%10 != 5
	}
	em := ecs.NewEntityManager()
	pit := addPit(em, 4*chasmCell, 0, 2*chasmCell, 10*chasmCell)
	return em, navigation.NewGrid(10, 10, chasmCell, walkable), pit
}

// lapse ticks the books past an afloat about to end, over ground.
func lapse(em *ecs.EntityManager, ground BookGround) {
	NewBookSystem(em).Update(0.1, em.GetAllEntities(), ground)
}

// placeOf is an entity's centre.
func placeOf(e *ecs.Entity) [2]float64 {
	x, y := centreOf(e)
	return [2]float64{x, y}
}

// Afloat ending over a shut pit sets the delver down on the nearest walkable
// cell's centre, unhurt: their timed open and cast break and a charge in
// flight ends, as any move by a page does.
func TestBook_AfloatEndingOverAPit_SetsTheDelverDownOnTheNearestCell(t *testing.T) {
	em, grid, _ := chasmFloor(t)
	delver := lift(walkingDelver(em, 420, 300, 1, 0), 0.05)
	delver.AddComponent(&components.TimedOpenComponent{})
	mustBook(t, delver).Casting = &components.BookCasting{}
	var ended []*ecs.Entity

	lapse(em, BookGround{Footing: grid, EndCharge: func(e *ecs.Entity) { ended = append(ended, e) }})

	assert.Equal(t, [2]float64{6.5 * chasmCell, 3.5 * chasmCell}, placeOf(delver), "on cell (6, 3), the nearest ground")
	hc, _ := delver.GetComponent(ecs.ComponentTypeHealth)
	assert.Equal(t, 100, hc.(*components.HealthComponent).CurrentHealth, "unhurt")
	assert.False(t, afloat(delver))
	assert.False(t, delver.HasComponent(ecs.ComponentTypeTimedOpen), "the timed open breaks")
	assert.Nil(t, mustBook(t, delver).Casting, "the cast breaks")
	assert.Equal(t, []*ecs.Entity{delver}, ended, "a charge in flight ends")
}

// Nothing is set down where afloat did not end over a shut pit, or where the
// world has no footing to read.
func TestBook_AfloatEnding_SetsNoOneDownElsewhere(t *testing.T) {
	cases := []struct {
		name     string
		x        float64
		footless bool
		alter    func(pit, delver *ecs.Entity)
	}{
		{name: "off the pit", x: 200},
		{name: "over the lowered bridge's lane", x: 420, alter: func(pit, _ *ecs.Entity) {
			oc, _ := pit.GetComponent(ecs.ComponentTypeOpenable)
			oc.(*components.OpenableComponent).IsOpen = true
		}},
		{name: "with no footing, off a dungeon floor", x: 420, footless: true},
		{name: "still afloat", x: 420, alter: func(_, delver *ecs.Entity) { lift(delver, 8) }},
		{name: "out of play", x: 420, alter: func(_, delver *ecs.Entity) {
			hc, _ := delver.GetComponent(ecs.ComponentTypeHealth)
			hc.(*components.HealthComponent).CurrentHealth = 0
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			em, grid, pit := chasmFloor(t)
			delver := lift(walkingDelver(em, tc.x, 300, 1, 0), 0.05)
			if tc.alter != nil {
				tc.alter(pit, delver)
			}
			ground := BookGround{Footing: grid}
			if tc.footless {
				ground = BookGround{}
			}

			lapse(em, ground)

			assert.Equal(t, [2]float64{tc.x, 300}, placeOf(delver))
		})
	}
}

// A pit with no walkable cell left on the floor sets no one down: the
// delver stays where they are.
func TestBook_AfloatEndingOverAPit_NoGroundAnywhere_StaysPut(t *testing.T) {
	em, _, _ := chasmFloor(t)
	delver := lift(walkingDelver(em, 420, 300, 1, 0), 0.05)
	rock := navigation.NewGrid(10, 10, chasmCell, make([]bool, 100))

	lapse(em, BookGround{Footing: rock})

	require.False(t, afloat(delver))
	assert.Equal(t, [2]float64{420, 300}, placeOf(delver))
}

// A chasm wider than 2 cells with rock behind its far edge: afloat ending
// near that edge sets the delver down on the bank the pit reaches, though a
// walkable cell beyond the rock lies nearer in a straight line. Columns 0-1
// ground, 2-6 pit, 7 rock, 8-9 ground.
func TestBook_AfloatEndingOverAWideChasm_SetsDownOnTheBankThePitReaches(t *testing.T) {
	walkable := make([]bool, 10*10)
	for i := range walkable {
		col := i % 10
		walkable[i] = col <= 1 || col >= 8
	}
	em := ecs.NewEntityManager()
	addPit(em, 2*chasmCell, 0, 5*chasmCell, 10*chasmCell)
	grid := navigation.NewGrid(10, 10, chasmCell, walkable)
	delver := lift(walkingDelver(em, 6.4*chasmCell, 3.5*chasmCell, 1, 0), 0.05)

	lapse(em, BookGround{Footing: grid})

	assert.Equal(t, [2]float64{1.5 * chasmCell, 3.5 * chasmCell}, placeOf(delver), "on cell (1, 3), across the pit, not (8, 3) behind the rock")
}

// A pit with no bank its cells reach (walled in by rock) falls back to the
// nearest walkable cell in a straight line.
func TestBook_AfloatEndingOverAWalledPit_SetsDownOnTheStraightNearest(t *testing.T) {
	walkable := make([]bool, 10*10)
	for i := range walkable {
		col := i % 10
		walkable[i] = col <= 1 || col >= 8
	}
	em := ecs.NewEntityManager()
	addPit(em, 3*chasmCell, 0, 4*chasmCell, 10*chasmCell) // columns 3-6, rock at 2 and 7
	grid := navigation.NewGrid(10, 10, chasmCell, walkable)
	delver := lift(walkingDelver(em, 6.4*chasmCell, 3.5*chasmCell, 1, 0), 0.05)

	lapse(em, BookGround{Footing: grid})

	assert.Equal(t, [2]float64{8.5 * chasmCell, 3.5 * chasmCell}, placeOf(delver))
}
