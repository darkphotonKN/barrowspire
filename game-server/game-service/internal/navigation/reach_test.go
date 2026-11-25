package navigation_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// pitCols is a crossable rule for gridOf's grids: the rock cells whose
// column lies in [from, to] are pit, the rest rock.
func pitCols(from, to int) func(x, y float64) bool {
	return func(x, _ float64) bool {
		col := int(x / cell)
		return col >= from && col <= to
	}
}

// FS-X2CMM §J R51: the walkable cell nearest a point that is reached from
// the point's cell across crossable cells (a chasm's pits), never through
// rock. I-X2CMM-26.
func TestGridNearestAcross(t *testing.T) {
	// columns 0-1 ground, 2-5 pit, 6 rock, 7-8 ground
	g, cols := gridOf(t,
		"..#####..",
		"..#####..",
		"..#####..",
	)
	at := func(col, row int) int { return row*cols + col }

	t.Run("the bank the pit reaches, not the nearer cell behind rock", func(t *testing.T) {
		got, ok := g.NearestAcross(5.4*cell, 1.5*cell, pitCols(2, 5))
		assert.True(t, ok)
		assert.Equal(t, at(1, 1), got)
	})
	t.Run("the nearest of the banks the pit reaches", func(t *testing.T) {
		got, ok := g.NearestAcross(2.4*cell, 0.5*cell, pitCols(2, 6))
		assert.True(t, ok)
		assert.Equal(t, at(1, 0), got)
		got, ok = g.NearestAcross(5.6*cell, 2.5*cell, pitCols(2, 6))
		assert.True(t, ok)
		assert.Equal(t, at(7, 2), got)
	})
	t.Run("a pit walled in by rock reaches no bank", func(t *testing.T) {
		_, ok := g.NearestAcross(4.5*cell, 1.5*cell, pitCols(3, 4))
		assert.False(t, ok)
	})
	t.Run("a point on ground is its own cell", func(t *testing.T) {
		got, ok := g.NearestAcross(7.5*cell, 1.5*cell, pitCols(2, 5))
		assert.True(t, ok)
		assert.Equal(t, at(7, 1), got)
	})
	t.Run("a point on rock that is no pit reaches nothing", func(t *testing.T) {
		_, ok := g.NearestAcross(6.5*cell, 1.5*cell, pitCols(2, 5))
		assert.False(t, ok)
	})
	t.Run("off the grid", func(t *testing.T) {
		_, ok := g.NearestAcross(-cell, 1.5*cell, pitCols(2, 5))
		assert.False(t, ok)
	})
}
