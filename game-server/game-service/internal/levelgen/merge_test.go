package levelgen

import (
	"reflect"
	"strings"
	"testing"
)

// wallMask parses rows of '#' (wall) and '.' (open) into a row-major mask.
func wallMask(rows ...string) (cols int, mask []bool) {
	cols = len(rows[0])
	for _, r := range rows {
		for _, c := range r {
			mask = append(mask, c == '#')
		}
	}
	return cols, mask
}

func TestMergeWalls_StacksEqualRuns(t *testing.T) {
	tests := []struct {
		name string
		rows []string
		want []Rect
	}{
		{
			name: "solid block is one rect",
			rows: []string{"###", "###"},
			want: []Rect{{X: 0, Y: 0, W: 30, H: 20}},
		},
		{
			name: "no walls is no rects",
			rows: []string{"..", ".."},
			want: nil,
		},
		{
			name: "ring splits into top, sides and bottom",
			rows: []string{
				"####",
				"#..#",
				"#..#",
				"####",
			},
			want: []Rect{
				{X: 0, Y: 0, W: 40, H: 10},
				{X: 0, Y: 10, W: 10, H: 20},
				{X: 30, Y: 10, W: 10, H: 20},
				{X: 0, Y: 30, W: 40, H: 10},
			},
		},
		{
			name: "a run that changes width starts a new rect",
			rows: []string{
				"##.",
				"##.",
				"###",
			},
			want: []Rect{
				{X: 0, Y: 0, W: 20, H: 20},
				{X: 0, Y: 20, W: 30, H: 10},
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cols, mask := wallMask(tt.rows...)

			got := mergeWalls(cols, len(tt.rows), mask, 10)

			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("mergeWalls(\n%s\n) = %+v, want %+v",
					strings.Join(tt.rows, "\n"), got, tt.want)
			}
		})
	}
}
