package levelgen

// ForestParams is the Forlorn Forest's starting parameter set (FS-3QHQZ R12):
// 26 x 17 cells of 80 px (2 080 x 1 360 px), entrance east, 2-cell (160 px)
// trails. Tune here; the property test over 1 000 seeds is the gate.
var ForestParams = Params{
	CellSize:       80,
	Cols:           26,
	Rows:           17,
	Entrance:       SideEast,
	TrailWidth:     2,
	SpanShare:      0.6,
	TurnChance:     0.3,
	Branches:       IntRange{Min: 3, Max: 5},
	BranchSteps:    IntRange{Min: 2, Max: 4},
	MaxBranchDepth: 2,
	ClearingRadius: 2,
	Gap:            1,
	Border:         1,
	WallBudget:     120,
	RetryLimit:     32,
}
