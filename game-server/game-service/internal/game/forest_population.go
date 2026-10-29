package game

import (
	"log/slog"
	"math"
	"math/rand/v2"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/levelgen"
)

/*
	The Forlorn Forest's population: which clearings hold an elite and which a
	chest, and where its monsters stand. FS-3QHQZ §Requirements 15–16. Both are
	drawn from sources derived from the layout's boot seed, one stream each, so
	the whole forest is rebuilt from that one seed and retuning one draw never
	shifts the other.
*/

// The streams the Forest's draws are derived on, beside the layout's seed.
const (
	forestClearingStream uint64 = 0xc1ea_7146
	forestSpawnStream    uint64 = 0x5_9a7e
)

// forestRand is the source for one of the Forest's draws, derived from seed.
func forestRand(seed, stream uint64) *rand.Rand {
	return rand.New(rand.NewPCG(seed, stream))
}

// forestClearings is what each dead end's clearing holds, in the layout's
// dead-end order: an elite or a chest, never both.
type forestClearings struct {
	Elites []levelgen.DeadEnd
	Chests []levelgen.DeadEnd
}

/**
* assignForestClearings decides each clearing (R15): the main trail's dead end
* always holds an elite, the deepest clearing being the reward for walking
* furthest; every other one holds a chest at ForestChestShare, else an elite.
* With two or more dead ends at least one holds a chest: if the draws gave none,
* one side dead end, drawn at random, is turned into one. A lone main dead end
* holds an elite and no chest.
**/
func assignForestClearings(generated levelgen.Layout) forestClearings {
	rng := forestRand(generated.Seed, forestClearingStream)

	chest := make([]bool, len(generated.DeadEnds))
	var sides []int
	anyChest := false
	for i, deadEnd := range generated.DeadEnds {
		if deadEnd.Main {
			continue
		}
		sides = append(sides, i)
		chest[i] = rng.Float64() < ForestChestShare
		anyChest = anyChest || chest[i]
	}
	if !anyChest && len(sides) > 0 {
		chest[sides[rng.IntN(len(sides))]] = true
	}

	var clearings forestClearings
	for i, deadEnd := range generated.DeadEnds {
		if chest[i] {
			clearings.Chests = append(clearings.Chests, deadEnd)
		} else {
			clearings.Elites = append(clearings.Elites, deadEnd)
		}
	}
	return clearings
}

// eliteSpawnPoints is one elite spawn point at each elite clearing's centre. R16.
func (c forestClearings) eliteSpawnPoints() []FieldPoint {
	return centres(c.Elites)
}

// chests is one chest at each chest clearing's centre. R19.
func (c forestClearings) chests() []FieldPoint {
	return centres(c.Chests)
}

// centres is each dead end's clearing centre, in order.
func centres(deadEnds []levelgen.DeadEnd) []FieldPoint {
	var points []FieldPoint
	for _, deadEnd := range deadEnds {
		points = append(points, FieldPoint{X: deadEnd.Center.X, Y: deadEnd.Center.Y})
	}
	return points
}

/**
* forestSpawnPoints picks the Forest's standard spawn points (R16): a seeded
* count in [ForestSpawnPointsMin, ForestSpawnPointsMax], each at the centre of
* an open cell on a trail, at least ForestEntranceExclusion from the entrance
* and MonsterSpacing from every other point, and never inside a clearing. The
* cells are tried in a seeded order; a point that finds no valid cell is
* skipped and logged, never forced, and the forest runs with fewer monsters.
**/
func forestSpawnPoints(generated levelgen.Layout) []FieldPoint {
	rng := forestRand(generated.Seed, forestSpawnStream)
	want := ForestSpawnPointsMin + rng.IntN(ForestSpawnPointsMax-ForestSpawnPointsMin+1)

	entrance := generated.Entrance.At
	var candidates []FieldPoint
	for _, cell := range generated.Open {
		if math.Hypot(cell.X-entrance.X, cell.Y-entrance.Y) < ForestEntranceExclusion {
			continue
		}
		if inClearing(generated.DeadEnds, cell) {
			continue
		}
		candidates = append(candidates, FieldPoint{X: cell.X, Y: cell.Y})
	}
	rng.Shuffle(len(candidates), func(i, j int) {
		candidates[i], candidates[j] = candidates[j], candidates[i]
	})

	points := make([]FieldPoint, 0, want)
	for _, candidate := range candidates {
		if len(points) == want {
			break
		}
		if spacedFrom(points, candidate, MonsterSpacing) {
			points = append(points, candidate)
		}
	}

	if skipped := want - len(points); skipped > 0 {
		slog.Warn("Forest spawn points skipped: no valid cell",
			"seed", generated.Seed, "wanted", want, "placed", len(points), "skipped", skipped)
	}
	return points
}

// inClearing is whether p stands inside any dead end's clearing.
func inClearing(deadEnds []levelgen.DeadEnd, p levelgen.Point) bool {
	for _, deadEnd := range deadEnds {
		if math.Hypot(p.X-deadEnd.Center.X, p.Y-deadEnd.Center.Y) <= deadEnd.Radius {
			return true
		}
	}
	return false
}

// spacedFrom is whether p stands at least gap from every one of the points.
func spacedFrom(points []FieldPoint, p FieldPoint, gap float64) bool {
	for _, q := range points {
		if math.Hypot(p.X-q.X, p.Y-q.Y) < gap {
			return false
		}
	}
	return true
}
