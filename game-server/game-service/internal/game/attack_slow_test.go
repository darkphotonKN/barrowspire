package game

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-JS7C8 §C R20: the attack slow holds wherever the combat system resolves a
// player's cast, a run and a field world alike. I-JS7C8-1.

// slowedTicks is the 0.6 s window at the world's own tick rate.
var slowedTicks = int(math.Round(0.6 * float64(constants.GameFrameRate)))

// walkAfterSlash walks the player +y, slashes, ticks the cast in, and reports
// each step over the window and two ticks after it, with the player's Speed.
func walkAfterSlash(t *testing.T, s *Session, playerID uuid.UUID, body *ecs.Entity) ([]float64, float64) {
	t.Helper()

	require.NoError(t, s.handleMove(playerID, 0, 1))
	tick(s) // gear sets Speed; the walk at full speed
	at := transformOf(t, body)
	require.NoError(t, s.handleCastSkill(playerID, "slash", at.X+100, at.Y))
	tick(s) // the walk, then the cast resolves

	out := make([]float64, 0, slowedTicks+2)
	from := *transformOf(t, body)
	for range slowedTicks + 2 {
		tick(s)
		to := transformOf(t, body)
		out = append(out, math.Hypot(to.X-from.X, to.Y-from.Y))
		from = *to
	}

	vc, _ := body.GetComponent(ecs.ComponentTypeVelocity)
	return out, vc.(*components.VelocityComponent).Speed
}

func assertSlowedThenFull(t *testing.T, got []float64, speed float64) {
	t.Helper()
	dt := 1.0 / float64(constants.GameFrameRate)
	want := make([]float64, len(got))
	for i := range want {
		want[i] = speed * dt
		if i < slowedTicks {
			want[i] = 0.45 * speed * dt
		}
	}
	assert.InDeltaSlice(t, want, got, 1e-9, "slowed for 0.6 s, full on the first tick after")
}

func TestAttackSlow_InARun(t *testing.T) {
	s := unstartedRun(t)
	warrior, body := placeDelver(t, s, "warrior", 500, 500)

	got, speed := walkAfterSlash(t, s, warrior, body)
	assert.Equal(t, constants.DefaultSpeed, speed, "Speed, the wire's direction.speed, is unchanged")
	assertSlowedThenFull(t, got, speed)
}

func TestAttackSlow_InAFieldWorld(t *testing.T) {
	room := devRoom(t)
	visitor, body := devVisitor(t, room)

	got, speed := walkAfterSlash(t, room, visitor, body)
	assertSlowedThenFull(t, got, speed)
}
