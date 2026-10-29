package levelgen

import (
	"strings"
)

// renderASCII draws a layout one character per cell: '#' wall, '.' open,
// 'E' mouth, 'o' clearing centre (the cell just below-right of the centre
// point when it falls on a cell corner).
func renderASCII(p Params, l Layout) string {
	grid := make([]byte, p.Cols*p.Rows)
	for i := range grid {
		grid[i] = '#'
	}
	for _, pt := range l.Open {
		if c, ok := cellAt(p, pt); ok {
			grid[c] = '.'
		}
	}
	half := float64(p.TrailWidth) / 2 * p.CellSize
	for c := range grid {
		x, y := c%p.Cols, c/p.Cols
		onBorder := x < p.Border || y < p.Border || x >= p.Cols-p.Border || y >= p.Rows-p.Border
		if !onBorder || grid[c] != '.' {
			continue
		}
		along, at := cellMid(y, p.CellSize), l.Entrance.At.Y
		if p.Entrance == SideNorth || p.Entrance == SideSouth {
			along, at = cellMid(x, p.CellSize), l.Entrance.At.X
		}
		if along-at < half && at-along < half {
			grid[c] = 'E'
		}
	}
	for _, d := range l.DeadEnds {
		if c, ok := cellAt(p, d.Center); ok {
			grid[c] = 'o'
		}
	}

	var sb strings.Builder
	for y := 0; y < p.Rows; y++ {
		sb.Write(grid[y*p.Cols : (y+1)*p.Cols])
		sb.WriteByte('\n')
	}
	return sb.String()
}
