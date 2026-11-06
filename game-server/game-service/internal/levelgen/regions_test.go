package levelgen

import (
	"reflect"
	"strings"
	"testing"
)

// cellMask parses rows of '.' (set) and anything else (clear) into a row-major mask.
func cellMask(rows ...string) (cols int, mask []bool) {
	cols = len(rows[0])
	for _, r := range rows {
		for _, c := range r {
			mask = append(mask, c == '.')
		}
	}
	return cols, mask
}

func TestCorridorSegments_PartitionIntoConnectedBoundedPieces(t *testing.T) {
	long := strings.Repeat(".", 40)
	tests := []struct {
		name      string
		rows      []string
		maxSide   int
		wantCount int
	}{
		{"a short corridor is one segment", []string{"..........", ".........."}, 16, 1},
		{"a 40-cell corridor cuts into three", []string{long, long, long}, 16, 3},
		{"two corridors apart are two segments", []string{"...#...", "...#..."}, 16, 2},
		{"an L corridor within the bound is one segment", []string{
			"..####",
			"..####",
			"......",
			"......",
		}, 16, 1},
		{"an L corridor past the bound is cut", []string{
			"..####",
			"..####",
			"......",
			"......",
		}, 3, 3},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cols, mask := cellMask(tt.rows...)
			rows := len(tt.rows)

			segs := corridorSegments(cols, rows, mask, tt.maxSide)

			if len(segs) != tt.wantCount {
				t.Fatalf("%d segments, want %d: %v", len(segs), tt.wantCount, segs)
			}
			owner := make([]int, len(mask))
			for i, seg := range segs {
				x0, y0, x1, y1 := cols, rows, -1, -1
				for _, c := range seg {
					if !mask[c] {
						t.Fatalf("segment %d holds non-corridor cell %d", i, c)
					}
					if owner[c] != 0 {
						t.Fatalf("cell %d is in segments %d and %d", c, owner[c]-1, i)
					}
					owner[c] = i + 1
					x, y := c%cols, c/cols
					x0, y0, x1, y1 = min(x0, x), min(y0, y), max(x1, x), max(y1, y)
				}
				if w, h := x1-x0+1, y1-y0+1; max(w, h) > tt.maxSide {
					t.Fatalf("segment %d spans %dx%d, longer side over %d", i, w, h, tt.maxSide)
				}
				if n := reachableWithin(cols, rows, seg); n != len(seg) {
					t.Fatalf("segment %d is not 4-connected: %d of %d cells joined", i, n, len(seg))
				}
			}
			for c := range mask {
				if mask[c] && owner[c] == 0 {
					t.Fatalf("corridor cell %d is in no segment", c)
				}
			}
		})
	}
}

// reachableWithin counts the cells of seg 4-connected to its first cell
// through seg itself.
func reachableWithin(cols, rows int, seg []int) int {
	in := make([]bool, cols*rows)
	for _, c := range seg {
		in[c] = true
	}
	return reachable(cols, rows, seg[:1], in)
}

func TestRoomDoorways_RoomCellsTouchingCorridor(t *testing.T) {
	// A 3x3 room at (1, 1) with a corridor leaving east from its middle row and
	// one cell touching its bottom-left corner only diagonally.
	cols, corridor := cellMask(
		"#######",
		"#######",
		"####...",
		"#######",
		".######",
	)
	room := CellRect{X: 1, Y: 1, W: 3, H: 3}

	got := roomDoorways(cols, len(corridor)/cols, room, corridor)

	want := []Cell{{X: 3, Y: 2}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("roomDoorways() = %v, want %v", got, want)
	}
}

func TestShellCells_EightAdjacentNonWalkable(t *testing.T) {
	cols, open := cellMask(
		"#####",
		"#####",
		"##.##",
		"#####",
		"#####",
	)

	got := shellCells(cols, len(open)/cols, open)

	for c := range open {
		x, y := c%cols, c/cols
		want := !open[c] && x >= 1 && x <= 3 && y >= 1 && y <= 3
		if got[c] != want {
			t.Errorf("cell (%d, %d): shell = %v, want %v", x, y, got[c], want)
		}
	}
}

func TestMergeCells_CoversMaskInCellUnits(t *testing.T) {
	cols, mask := cellMask(
		"..#",
		"..#",
		"...",
	)

	got := mergeCells(cols, 3, mask)

	want := []CellRect{{X: 0, Y: 0, W: 2, H: 2}, {X: 0, Y: 2, W: 3, H: 1}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("mergeCells() = %v, want %v", got, want)
	}
}
