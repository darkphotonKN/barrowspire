package game

import (
	"encoding/json"
	"flag"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
)

var updateTownGolden = flag.Bool("update", false, "rewrite the hub town golden the client is held to")

// hubTownGoldenPath is the town as hub_map.go lays it out, checked in where the
// client reads it: this test holds hub_map.go to it, and the client's vitest
// suites hold its mirrors (HUB_SIZE, HUB_FURNISHINGS, HUB_FIXED_RESIDENTS, HUB_DOOR_SPURS,
// HUB_KEEP_OUT.wander, the test copies of the buildings) to it. A deliberate change to the town is
// `go test ./internal/game -run TestHubTown_MatchesTheGolden -update`, then the
// client's mirrors until vitest is green again. FS-B0H2D §Requirements 19, 23.
var hubTownGoldenPath = filepath.Join("..", "..", "..", "..", "game-client", "src", "render", "world", "hubTown.golden.json")

type townGolden struct {
	// The hub's size, HubMapWidth × HubMapHeight, so the client's HUB_SIZE is
	// held to the server's map and not to a second literal. FS-R4MYX §Requirements 1, 22.
	MapSize   townGoldenSize       `json:"mapSize"`
	Buildings []townGoldenBuilding `json:"buildings"`
	// The chapel's bell tower: one solid wall that is no building, which the
	// client tells by this rect. FS-R4MYX §Change: The chapel moves to the far
	// left and gains a bell tower, T8.
	BellTower      townGoldenRect       `json:"bellTower"`
	FixedResidents []townGoldenResident `json:"fixedResidents"`
	// Each wandering resident's quarter, so the client's keep-out rule and its
	// hidden-behind-a-building test read the server's. FS-R4MYX §Requirements 40.
	WanderRegions []townGoldenRegion `json:"wanderRegions"`
}

type townGoldenSize struct {
	W float64 `json:"w"`
	H float64 `json:"h"`
}

type townGoldenRegion struct {
	Name string  `json:"name"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	W    float64 `json:"w"`
	H    float64 `json:"h"`
}

type townGoldenBuilding struct {
	Name string  `json:"name"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	W    float64 `json:"w"`
	H    float64 `json:"h"`
	// The outer wall its street door is cut in: "south" or "east".
	// FS-R4MYX §Requirements 7.
	DoorFace string `json:"doorFace"`
	// The gap in its door face, as cut: that wall's own rect between its two
	// segments. The client's door spurs and its test walls are held to it.
	DoorGap townGoldenRect `json:"doorGap"`
	// The wall dividing its rooms, as walled: its segments either side of the
	// door gap. Empty for a one-room building.
	Partitions  []townGoldenRect       `json:"partitions"`
	Furnishings []townGoldenFurnishing `json:"furnishings"`
}

type townGoldenRect struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	W float64 `json:"w"`
	H float64 `json:"h"`
}

type townGoldenFurnishing struct {
	Kind string  `json:"kind"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	W    float64 `json:"w"`
	H    float64 `json:"h"`
}

type townGoldenResident struct {
	Name string  `json:"name"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
}

// townFromHubMap is the golden's shape filled from hub_map.go, in its order:
// the client's mirrors are held to the golden in that order.
func townFromHubMap() townGolden {
	town := townGolden{
		MapSize:        townGoldenSize{W: constants.HubMapWidth, H: constants.HubMapHeight},
		Buildings:      []townGoldenBuilding{},
		BellTower:      townGoldenRect(hubBellTower),
		FixedResidents: []townGoldenResident{},
		WanderRegions:  []townGoldenRegion{},
	}
	for _, b := range hubBuildings {
		building := townGoldenBuilding{Name: b.Name, X: b.X, Y: b.Y, W: b.W, H: b.H, Partitions: []townGoldenRect{}, Furnishings: []townGoldenFurnishing{}}
		building.DoorFace = b.DoorFace.String()
		gap := streetDoorGap(b)
		building.DoorGap = townGoldenRect{X: gap.X, Y: gap.Y, W: gap.Width, H: gap.Height}
		for _, w := range partitionWalls(b) {
			building.Partitions = append(building.Partitions, townGoldenRect{X: w.X, Y: w.Y, W: w.Width, H: w.Height})
		}
		for _, f := range b.Furnishings {
			building.Furnishings = append(building.Furnishings, townGoldenFurnishing(f))
		}
		town.Buildings = append(town.Buildings, building)
	}
	for _, r := range hubFixedResidents {
		town.FixedResidents = append(town.FixedResidents, townGoldenResident{Name: r.Name, X: r.X, Y: r.Y})
	}
	for _, r := range hubResidents {
		q := r.Region
		town.WanderRegions = append(town.WanderRegions, townGoldenRegion{Name: r.Name, X: q.X, Y: q.Y, W: q.W, H: q.H})
	}
	return town
}

// The client mirrors the town by hand; the golden is what ties the two
// together. A rect nudged here without -update goes red here, and one rewritten
// with -update goes red in the client until its mirror follows.
func TestHubTown_MatchesTheGolden(t *testing.T) {
	got := townFromHubMap()

	if *updateTownGolden {
		out, err := json.MarshalIndent(got, "", "  ")
		require.NoError(t, err)
		require.NoError(t, os.WriteFile(hubTownGoldenPath, append(out, '\n'), 0o644))
	}

	raw, err := os.ReadFile(hubTownGoldenPath)
	require.NoError(t, err, "read the town golden (run with -update to write it)")
	var want townGolden
	require.NoError(t, json.Unmarshal(raw, &want), "parse the town golden")

	assert.Equal(t, want, got, "hub_map.go's town differs from %s: run with -update if intended, then bring the client's mirrors in line", hubTownGoldenPath)
}

// The golden is taken from hub_map.go's data, so it is only worth holding the
// client to if the built hub stands exactly that: each building's walls enclose
// its footprint, its door gap is the opening its door face leaves, its
// partition is its walls reaching the edge off the outline,
// its furnishings are its walls clear of every edge, the bell tower is one
// wall on its rect under a house id of its own, each fixed resident stands
// where the golden says, and each wandering resident keeps the quarter it says.
func TestHubTown_BuiltHubStandsTheGoldenTown(t *testing.T) {
	town := townFromHubMap()
	houses := hubWalls(t)
	require.Len(t, houses, len(town.Buildings), "the built hub has a different number of buildings")

	onTheTower := [][]box{}
	for _, walls := range wallsByHouseID(t) {
		for _, w := range walls {
			if w == box(town.BellTower) {
				onTheTower = append(onTheTower, walls)
			}
		}
	}
	require.Len(t, onTheTower, 1, "the built hub's walls on the bell tower's rect")
	assert.Len(t, onTheTower[0], 1, "the bell tower's house id is shared with another wall")

	for _, b := range town.Buildings {
		house := houseOf(t, houses, b.Name)
		assert.Equal(t, box{X: b.X, Y: b.Y, W: b.W, H: b.H}, footprintOf(house), "the %s's footprint", b.Name)

		gap, face, ok := doorGapOf(house)
		require.True(t, ok, "the %s has no single door gap", b.Name)
		assert.Equal(t, b.DoorFace, face.String(), "the %s's door face", b.Name)
		assert.Equal(t, box{X: b.DoorGap.X, Y: b.DoorGap.Y, W: b.DoorGap.W, H: b.DoorGap.H}, gap, "the %s's door gap", b.Name)

		partitions := []box{}
		for _, p := range b.Partitions {
			partitions = append(partitions, box(p))
		}
		assert.ElementsMatch(t, partitions, partitionsOf(house), "the %s's partition", b.Name)

		want := []box{}
		for _, f := range b.Furnishings {
			want = append(want, box{X: f.X, Y: f.Y, W: f.W, H: f.H})
		}
		assert.ElementsMatch(t, want, furnishingsOf(house), "the %s's furnishings", b.Name)
	}

	standing := map[string][2]float64{}
	quarters := map[string][4]float64{}
	for _, npc := range npcsIn(builtHub()) {
		if npc.NPC.Function != components.NPCFunctionNone {
			continue
		}
		if q := npc.NPC.Wander; q != nil {
			quarters[npc.Name] = [4]float64{q.X, q.Y, q.W, q.H}
		} else {
			standing[npc.Name] = [2]float64{npc.At.X, npc.At.Y}
		}
	}
	want := map[string][2]float64{}
	for _, r := range town.FixedResidents {
		want[r.Name] = [2]float64{r.X, r.Y}
	}
	assert.Equal(t, want, standing, "the built hub's fixed residents")

	wantQuarters := map[string][4]float64{}
	for _, r := range town.WanderRegions {
		wantQuarters[r.Name] = [4]float64{r.X, r.Y, r.W, r.H}
	}
	assert.Equal(t, wantQuarters, quarters, "the built hub's wandering residents' quarters")
}
