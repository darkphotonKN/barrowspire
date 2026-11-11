package game

import (
	"encoding/json"
	"flag"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
)

var updateTownGolden = flag.Bool("update", false, "rewrite the hub town golden the client is held to")

// hubTownGoldenPath is the town as hub_map.go lays it out, checked in where the
// client reads it: this test holds hub_map.go to it, and the client's vitest
// suites hold its mirrors (HUB_FURNISHINGS, HUB_FIXED_RESIDENTS, HUB_DOOR_SPURS,
// the test copies of the buildings) to it. A deliberate change to the town is
// `go test ./internal/game -run TestHubTown_MatchesTheGolden -update`, then the
// client's mirrors until vitest is green again. FS-B0H2D §Requirements 19, 23.
var hubTownGoldenPath = filepath.Join("..", "..", "..", "..", "game-client", "src", "render", "world", "hubTown.golden.json")

type townGolden struct {
	Buildings      []townGoldenBuilding `json:"buildings"`
	FixedResidents []townGoldenResident `json:"fixedResidents"`
}

type townGoldenBuilding struct {
	Name string  `json:"name"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
	W    float64 `json:"w"`
	H    float64 `json:"h"`
	// The gap in its south wall, as cut: the south wall's own rect between its
	// two segments. The client's door spurs and its test walls are held to it.
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
	town := townGolden{Buildings: []townGoldenBuilding{}, FixedResidents: []townGoldenResident{}}
	for _, b := range hubBuildings {
		building := townGoldenBuilding{Name: b.Name, X: b.X, Y: b.Y, W: b.W, H: b.H, Partitions: []townGoldenRect{}, Furnishings: []townGoldenFurnishing{}}
		building.DoorGap = townGoldenRect{X: b.X + doorGapWest(b), Y: b.Y + b.H - hubWallThickness, W: hubDoorWidth, H: hubWallThickness}
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
// its footprint, its door gap is the opening its south wall leaves, its
// partition is its walls reaching the edge off the outline,
// its furnishings are its walls clear of every edge, and each fixed resident
// stands where the golden says.
func TestHubTown_BuiltHubStandsTheGoldenTown(t *testing.T) {
	town := townFromHubMap()
	houses := hubWalls(t)
	require.Len(t, houses, len(town.Buildings), "the built hub has a different number of buildings")

	for _, b := range town.Buildings {
		house := houseOf(t, houses, b.Name)
		assert.Equal(t, box{X: b.X, Y: b.Y, W: b.W, H: b.H}, footprintOf(house), "the %s's footprint", b.Name)

		gap, ok := doorGapOf(house)
		require.True(t, ok, "the %s has no single gap in its south wall", b.Name)
		assert.Equal(t, box{X: b.DoorGap.X, Y: b.DoorGap.Y, W: b.DoorGap.W, H: b.DoorGap.H}, gap, "the %s's door gap", b.Name)

		partitions := []box{}
		for _, p := range b.Partitions {
			partitions = append(partitions, box{X: p.X, Y: p.Y, W: p.W, H: p.H})
		}
		assert.ElementsMatch(t, partitions, partitionsOf(house), "the %s's partition", b.Name)

		want := []box{}
		for _, f := range b.Furnishings {
			want = append(want, box{X: f.X, Y: f.Y, W: f.W, H: f.H})
		}
		assert.ElementsMatch(t, want, furnishingsOf(house), "the %s's furnishings", b.Name)
	}

	standing := map[string][2]float64{}
	for _, npc := range npcsIn(builtHub()) {
		if npc.NPC.Function == components.NPCFunctionNone && npc.NPC.Wander == nil {
			standing[npc.Name] = [2]float64{npc.At.X, npc.At.Y}
		}
	}
	want := map[string][2]float64{}
	for _, r := range town.FixedResidents {
		want[r.Name] = [2]float64{r.X, r.Y}
	}
	assert.Equal(t, want, standing, "the built hub's fixed residents")
}
