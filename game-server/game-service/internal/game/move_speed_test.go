package game

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Every movement input walks a delver at their own speed in world space: a
// diagonal (two keys held, the client sends vx and vy of ±1 both) no faster
// than a single key, and an intent longer than one no faster either. Owner's
// report 2026-11-12: W+D and A+S felt especially fast.
func TestHandleMove_EveryInputWalksAtTheDelversSpeed(t *testing.T) {
	inputs := []struct {
		name   string
		vx, vy float64
	}{
		{"W", 0, -1},
		{"A", -1, 0},
		{"S", 0, 1},
		{"D", 1, 0},
		{"W+A", -1, -1},
		{"W+D", 1, -1},
		{"S+A", -1, 1},
		{"S+D", 1, 1},
		{"an intent longer than one", 3, 4},
	}
	worlds := map[string]WorldBounds{"a run": RunBounds(), "the hub": HubBounds()}

	for worldName, bounds := range worlds {
		for _, in := range inputs {
			t.Run(worldName+"/"+in.name, func(t *testing.T) {
				// alone, in the open, a second's walk short of every edge
				s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, nil, bounds)
				playerID, delver := placeDelver(t, s, "warrior", 600, 600)
				from := *transformOf(t, delver)
				vc, ok := delver.GetComponent(ecs.ComponentTypeVelocity)
				require.True(t, ok)
				speed := vc.(*components.VelocityComponent).Speed
				require.Positive(t, speed)

				require.NoError(t, s.handleMove(playerID, in.vx, in.vy))
				ticks(s, constants.GameFrameRate)

				to := *transformOf(t, delver)
				covered := math.Hypot(to.X-from.X, to.Y-from.Y)
				assert.InDelta(t, speed, covered, 0.5, "world px covered in one second")
			})
		}
	}
}
