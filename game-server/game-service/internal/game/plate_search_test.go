package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/stretchr/testify/assert"
)

// FS-5FZ4J §C R20: the search over pushes says whether a delver entering a
// room at start can push its blocks onto every plate, one after another.
func TestPlatesCoverable(t *testing.T) {
	c := func(x, y int) components.Cell { return components.Cell{X: x, Y: y} }
	cases := []struct {
		name          string
		w, h          int
		plates, block []components.Cell
		start         components.Cell
		want          bool
	}{
		{"one block pushed along its row", 6, 5, []components.Cell{c(4, 2)}, []components.Cell{c(2, 2)}, c(0, 0), true},
		{"one block pushed round a corner", 6, 5, []components.Cell{c(4, 3)}, []components.Cell{c(2, 1)}, c(0, 0), true},
		{"a block in a corner never moves", 6, 5, []components.Cell{c(3, 3)}, []components.Cell{c(0, 0)}, c(5, 4), false},
		{"a block against a wall only slides along it", 6, 5, []components.Cell{c(2, 3)}, []components.Cell{c(2, 0)}, c(5, 4), false},
		{"a block on the plate already", 6, 5, []components.Cell{c(2, 2)}, []components.Cell{c(2, 2)}, c(0, 0), true},
		{"two blocks, two plates", 7, 6, []components.Cell{c(5, 2), c(5, 4)}, []components.Cell{c(2, 2), c(2, 4)}, c(0, 0), true},
		{"two blocks pushed west side by side", 6, 5, []components.Cell{c(2, 1), c(2, 3)}, []components.Cell{c(3, 1), c(3, 3)}, c(5, 2), true},
		{"two blocks pushed east in a 5 x 5 room", 5, 5, []components.Cell{c(3, 2), c(3, 3)}, []components.Cell{c(2, 2), c(2, 3)}, c(0, 0), true},
		{"fewer blocks than plates", 6, 5, []components.Cell{c(2, 2), c(3, 3)}, []components.Cell{c(1, 2)}, c(0, 0), false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			assert.Equal(t, tc.want, platesCoverable(tc.w, tc.h, tc.plates, tc.block, tc.start))
		})
	}
}

// FS-KE075 §Change: Room variety R75: a shaped room's cut cell is a wall to
// the search: a pillar in the only lane stops a push that the plain room
// allows.
func TestPlatesCoverableAmid_CutCellsAreWalls(t *testing.T) {
	plate, block, start := []components.Cell{{X: 3, Y: 1}}, []components.Cell{{X: 1, Y: 1}}, components.Cell{X: 0, Y: 1}
	// a 5 x 3 room: the block pushed east along the middle row onto the plate
	assert.True(t, platesCoverable(5, 3, plate, block, start))
	wall := make([]bool, 5*3)
	wall[1*5+2] = true // a pillar between block and plate
	wall[0*5+2], wall[2*5+2] = true, true
	assert.False(t, platesCoverableAmid(5, 3, wall, plate, block, start))
}
