package levelgen

import (
	"strings"
	"testing"
)

// drawCuts draws a w x h room's cuts row by row: '#' cut, '.' floor.
func drawCuts(s RoomShape, w, h int) string {
	cut := map[Cell]bool{}
	for _, c := range shapeCuts(s, w, h) {
		cut[c] = true
	}
	var b strings.Builder
	for y := range h {
		for x := range w {
			if cut[Cell{X: x, Y: y}] {
				b.WriteByte('#')
			} else {
				b.WriteByte('.')
			}
		}
		b.WriteByte('\n')
	}
	return b.String()
}

// FS-KE075 §Change: Room variety R69: what each shape cuts, at a few sizes.
func TestShapeCuts_EachShape(t *testing.T) {
	tests := []struct {
		shape RoomShape
		w, h  int
		want  string
	}{
		{ShapeRectangle, 4, 4, "....\n....\n....\n....\n"},
		{ShapeLNorthWest, 5, 5, "##...\n##...\n.....\n.....\n.....\n"},
		{ShapeLSouthEast, 8, 7, "........\n........\n........\n........\n.....###\n.....###\n.....###\n"},
		{ShapeLNorthEast, 6, 5, "....##\n....##\n......\n......\n......\n"},
		{ShapeCross, 6, 6, "##..##\n##..##\n......\n......\n##..##\n##..##\n"},
		{ShapeCross, 8, 7, "##....##\n##....##\n........\n........\n........\n##....##\n##....##\n"},
		{ShapePillared, 7, 6, ".......\n..#.#..\n.......\n.......\n..#.#..\n.......\n"},
		{ShapePillared, 8, 7, "........\n........\n..#..#..\n........\n..#..#..\n........\n........\n"},
		{ShapeCutCorners, 5, 5, "#...#\n.....\n.....\n.....\n#...#\n"},
		{ShapeCutCorners, 6, 6, "##..##\n#....#\n......\n......\n#....#\n##..##\n"},
	}
	for _, tt := range tests {
		t.Run(string(tt.shape), func(t *testing.T) {
			if got := drawCuts(tt.shape, tt.w, tt.h); got != tt.want {
				t.Errorf("%s %dx%d cuts\n%s\nwant\n%s", tt.shape, tt.w, tt.h, got, tt.want)
			}
		})
	}
}

// R70: a shape a room is too small for cuts nothing and is never drawn; the
// centre cell is never cut by a shape that fits.
func TestShapeCuts_FitAndCentre(t *testing.T) {
	shapes := append([]RoomShape{ShapeRectangle, ShapeCross, ShapePillared, ShapeCutCorners}, lShapes...)
	for _, s := range shapes {
		for w := 4; w <= 8; w++ {
			for h := 4; h <= 7; h++ {
				cuts := shapeCuts(s, w, h)
				if !s.Fits(w, h) {
					if len(cuts) > 0 {
						t.Errorf("%s does not fit %dx%d but cuts %v", s, w, h, cuts)
					}
					continue
				}
				for _, c := range cuts {
					if c == (Cell{X: w / 2, Y: h / 2}) {
						t.Errorf("%s %dx%d cuts its centre cell", s, w, h)
					}
				}
			}
		}
	}
	if ShapeLNorthWest.Fits(4, 7) || ShapeCross.Fits(5, 7) || ShapePillared.Fits(6, 7) || ShapeCutCorners.Fits(8, 4) {
		t.Error("a shape fits a room below its size")
	}
}
