package game

import (
	"slices"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §J R51 as reconciled at wave 2, on FS-5FZ4J §E R33's Chasm.
// I-X2CMM-16.

// floatFor sets the delver afloat for secs, as a Levitate on them does.
func floatFor(delver *ecs.Entity, secs float64) {
	bc, ok := delver.GetComponent(ecs.ComponentTypeBook)
	if !ok {
		bc = components.NewBookComponent(nil)
		delver.AddComponent(bc)
	}
	bc.(*components.BookComponent).States[components.BookStateAfloat] = secs
}

// An afloat delver walks straight over the shut pits to the stairs side, and
// along the ledge over its spike plates, firing none.
func TestLevitate_AnAfloatDelverCrossesTheChasmFiringNothing(t *testing.T) {
	s, ids, _ := chasmRun(t, 1, 1)
	g := s.dungeon.chasm
	f := chasmFrameOfFloor(s)
	delver := delverEntity(t, s, ids[0])
	band := nearestDeep(s, g.lane)
	floatFor(delver, 60)

	end := walkDeep(t, s, delver, acrossOf(s, g.pits[0]), band-1, 3)
	assert.Greater(t, deepOf(f, end), band+1, "over the shut pits to the stairs side")

	end = walkLedge(t, s, delver)
	assert.Greater(t, deepOf(f, end), band+1, "along the ledge")
	for _, c := range g.spikes {
		assert.True(t, trapOf(trapAt(s, c)).Armed, "a spike plate on the ledge stayed armed")
	}
}

// Afloat ending over a pit sets the delver down, unhurt, on the centre of the
// nearest walkable cell, off the band.
func TestLevitate_AfloatEndingOverAPit_SetsTheDelverDownUnhurt(t *testing.T) {
	s, ids, _ := chasmRun(t, 1, 1)
	g := s.dungeon.chasm
	delver := delverEntity(t, s, ids[0])
	pit := g.pits[0]
	over := components.Cell{X: pit.X, Y: pit.Y}
	standOn(t, s, delver, over)
	floatFor(delver, 0.01)
	hc := healthComponentOf(delver)
	hc.CurrentHealth = hc.MaxHealth

	for range 3 {
		clearMonsters(s)
		tick(s)
	}

	at := transformOf(t, delver)
	cell := s.dungeon.cellOf(point{at.X, at.Y})
	centre := s.dungeon.cellCentre(cell)
	assert.Equal(t, [2]float64{centre.x, centre.y}, [2]float64{at.X, at.Y}, "on a cell's centre")
	require.True(t, s.navGrid.Walkable(cell.X, cell.Y), "on walkable ground")
	for _, r := range append(slices.Clone(g.pits), g.lane) {
		assert.False(t, slices.Contains(cellsOf(r), cell), "off the pits")
	}
	assert.Equal(t, hc.MaxHealth, hc.CurrentHealth, "unhurt")
}
