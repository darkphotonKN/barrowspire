package progression_test

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/progression"
)

// r14 is FS-BDA7X R14 verbatim: total experience to reach each level and the
// experience to the next one (0 at the cap). Every row is pinned.
var r14 = []struct {
	level  int32
	reach  int64
	toNext int64
}{
	{1, 0, 100},
	{2, 100, 130},
	{3, 230, 160},
	{4, 390, 210},
	{5, 600, 270},
	{6, 870, 340},
	{7, 1210, 440},
	{8, 1650, 560},
	{9, 2210, 720},
	{10, 2930, 920},
	{11, 3850, 1180},
	{12, 5030, 1510},
	{13, 6540, 1930},
	{14, 8470, 2480},
	{15, 10950, 3170},
	{16, 14120, 4060},
	{17, 18180, 5190},
	{18, 23370, 6650},
	{19, 30020, 8510},
	{20, 38530, 0},
}

func TestLevelFor_EveryR14Boundary_MatchesTable(t *testing.T) {
	for _, row := range r14 {
		if got := progression.LevelFor(row.reach); got != row.level {
			t.Errorf("LevelFor(%d) = %d, want %d", row.reach, got, row.level)
		}
		if row.level > 1 {
			if got := progression.LevelFor(row.reach - 1); got != row.level-1 {
				t.Errorf("LevelFor(%d) = %d, want %d", row.reach-1, got, row.level-1)
			}
		}
	}
}

func TestLevelFloor_EveryLevel_IsTotalToReach(t *testing.T) {
	for _, row := range r14 {
		if got := progression.LevelFloor(row.level); got != row.reach {
			t.Errorf("LevelFloor(%d) = %d, want %d", row.level, got, row.reach)
		}
	}
}

func TestNextLevelAt_EveryLevel_IsNextRowOrAbsentAtCap(t *testing.T) {
	for _, row := range r14 {
		next, ok := progression.NextLevelAt(row.level)
		if row.level == progression.MaxLevel {
			if ok {
				t.Errorf("NextLevelAt(%d) = %d, want absent at the cap", row.level, next)
			}
			continue
		}
		if !ok || next != row.reach+row.toNext {
			t.Errorf("NextLevelAt(%d) = (%d, %v), want (%d, true)", row.level, next, ok, row.reach+row.toNext)
		}
	}
}

func TestLevelFor_IssueSamples(t *testing.T) {
	tests := []struct {
		name string
		exp  int64
		want int32
	}{
		{"fresh character", 0, 1},
		{"one short of level 2", 99, 1},
		{"exactly level 2", 100, 2},
		{"one short of the cap", 38529, 19},
		{"exactly the cap", 38530, 20},
		{"far above the cap stays 20", 1_000_000, 20},
		{"negative is treated as fresh", -5, 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := progression.LevelFor(tt.exp); got != tt.want {
				t.Errorf("LevelFor(%d) = %d, want %d", tt.exp, got, tt.want)
			}
		})
	}
}

func TestLevelFloorAndNext_OutOfRangeLevels_Clamp(t *testing.T) {
	if got := progression.LevelFloor(0); got != 0 {
		t.Errorf("LevelFloor(0) = %d, want 0", got)
	}
	if got := progression.LevelFloor(99); got != 38530 {
		t.Errorf("LevelFloor(99) = %d, want 38530", got)
	}
	if _, ok := progression.NextLevelAt(99); ok {
		t.Errorf("NextLevelAt(99) should be absent")
	}
	if next, ok := progression.NextLevelAt(0); !ok || next != 100 {
		t.Errorf("NextLevelAt(0) = (%d, %v), want (100, true)", next, ok)
	}
}
