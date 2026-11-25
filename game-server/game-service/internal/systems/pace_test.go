package systems

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
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

var updatePaceGolden = flag.Bool("update", false, "rewrite the pace golden the client reads")

/*
The pace pin for this package (FS-TAGWA R7, ADR-0099): every projectile row of
the attack table flies at its full-pace figure times PaceScale. A row added
with a projectile and no figure here fails.
*/
var fullPaceProjectileSpeed = map[components.AttackKind]float64{
	components.AttackArrow:          480,
	components.AttackFireball:       350,
	components.AttackShadowShot:     260,
	components.AttackTripleFireball: 360,
}

func TestPace_EveryDelverProjectileRowIsPaced(t *testing.T) {
	rows := 0
	for kind, spec := range attackTable {
		if spec.projectile.speed == 0 {
			continue
		}
		rows++
		full, ok := fullPaceProjectileSpeed[kind]
		require.True(t, ok, "%s's projectile has no full-pace row: add it, paced", kind)
		assert.Equal(t, full*constants.PaceScale, spec.projectile.speed, "%s's projectile", kind)
	}
	assert.Equal(t, len(fullPaceProjectileSpeed), rows, "every full-pace row is a projectile row of the table")
}

// The hound and the block follow the delver's walk on their own (R3): a
// hound moves at the paced walk.
func TestPace_TheHoundAndTheBlockFollowThePacedWalk(t *testing.T) {
	em := ecs.NewEntityManager()
	hound := callHound(t, em, houndArcher(em), 60)
	vc, ok := hound.GetComponent(ecs.ComponentTypeVelocity)
	require.True(t, ok)
	assert.Equal(t, 200*constants.PaceScale, vc.(*components.VelocityComponent).Speed, "the hound's pace")

}

// A block pushed by a delver at the paced walk takes a cell at half that walk
// to build the push: still on its cell just short of it, on the next once past.
func TestPace_ABlockPushTakesACellAtHalfThePacedWalk(t *testing.T) {
	cell := blockCell / (200 * constants.PaceScale * BlockPushSpeedShare)

	short := newPushWorld(t)
	x, y := westOfBlock()
	short.addDelver(x, y, 1, 0)
	short.run(cell - 0.1)
	assert.Equal(t, components.Cell{X: 5, Y: 5}, cellOf(short.block), "not yet pushed")

	past := newPushWorld(t)
	past.addDelver(x, y, 1, 0)
	past.run(cell + 0.2)
	assert.Equal(t, components.Cell{X: 6, Y: 5}, cellOf(past.block), "pushed one cell")
}

// paceGoldenPath is the pace as the client reads it (FS-TAGWA R9, ADR-0099):
// this test holds the constants to it, and the client imports it in place of
// any speed literal of its own. A pace tweak is
// `go test ./internal/systems -run TestPaceGolden -update`.
var paceGoldenPath = filepath.Join("..", "..", "..", "..", "game-client", "src", "data", "pace.golden.json")

type paceGolden struct {
	PaceScale           float64 `json:"paceScale"`
	DefaultSpeed        float64 `json:"defaultSpeed"`
	BlockPushSpeedShare float64 `json:"blockPushSpeedShare"`
}

func TestPaceGolden_MatchesTheConstants(t *testing.T) {
	live := paceGolden{
		PaceScale:           constants.PaceScale,
		DefaultSpeed:        constants.DefaultSpeed,
		BlockPushSpeedShare: BlockPushSpeedShare,
	}
	if *updatePaceGolden {
		raw, err := json.MarshalIndent(live, "", "  ")
		require.NoError(t, err)
		require.NoError(t, os.WriteFile(paceGoldenPath, append(raw, '\n'), 0o644))
	}
	raw, err := os.ReadFile(paceGoldenPath)
	require.NoError(t, err, "read the pace golden (run with -update to write it)")
	var want paceGolden
	require.NoError(t, json.Unmarshal(raw, &want), "parse the pace golden")
	assert.Equal(t, want, live, "the pace golden is stale: run with -update, then the client's tests")
}
