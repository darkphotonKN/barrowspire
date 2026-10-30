package levelgen

// ForestParams is the Forlorn Forest's parameter set (FS-KSD6K R1–R3): 39 x 25
// cells of 80 px (3 120 x 2 000 px), entrance east, 3-cell (240 px) trails.
// Tune here; the property test over 1 000 seeds is the gate. WallBudget is its
// logged maximum (52 rects) plus over 20%. RetryLimit is 64, not 32: at 4–7
// branches about three first attempts in four fall short of 4 branches, and
// 33 attempts left 3 boot seeds in 100 000 with no layout.
var ForestParams = Params{
	CellSize:       80,
	Cols:           39,
	Rows:           25,
	Entrance:       SideEast,
	TrailWidth:     3,
	SpanShare:      0.6,
	TurnChance:     0.3,
	Branches:       IntRange{Min: 4, Max: 7},
	BranchSteps:    IntRange{Min: 3, Max: 6},
	MaxBranchDepth: 2,
	ClearingRadius: 3,
	Gap:            1,
	Border:         1,
	WallBudget:     64,
	RetryLimit:     64,
}
