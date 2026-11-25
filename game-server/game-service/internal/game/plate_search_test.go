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
