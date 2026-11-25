package serializer

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-7P736 §A R12; AC 8. I-7P736-1.

// otherPlayerOf is the other_players entry for member in a recipient's frame.
func otherPlayerOf(t *testing.T, frame map[string]any, member uuid.UUID) map[string]any {
	t.Helper()
	others, ok := frame["other_players"].([]any)
	require.True(t, ok)
	for _, o := range others {
		other := o.(map[string]any)
		if other["id"] == member.String() {
			return other
		}
	}
	require.FailNow(t, "no other_players entry", "member %s", member)
	return nil
}

// While a delver rolls, `roll {dir_x, dir_y}` is on their own current_player
// and on every other recipient's other_players entry for them; with
// `roll_cooldown {remaining, total}`, the owner's alone, beside it. Both are
// absent once over: the roll the tick after its last, the cooldown once
// ready.
func TestFormatStateToClientState_TheRollAndItsCooldownOnTheWire(t *testing.T) {
	em := ecs.NewEntityManager()
	roller, watcher := uuid.New(), uuid.New()
	body := seatWithResource(em, roller, "warrior", stamina(100, 100), "")
	seatWithResource(em, watcher, "archer", stamina(100, 100), "")

	_, frame := wireFor(t, em, types.WorldTypeRun, roller)
	me := frame["current_player"].(map[string]any)
	assert.NotContains(t, me, "roll", "not rolling")
	assert.NotContains(t, me, "roll_cooldown", "ready")

	require.True(t, systems.StartRoll(body, 3, 4))

	_, frame = wireFor(t, em, types.WorldTypeRun, roller)
	me = frame["current_player"].(map[string]any)
	assert.Equal(t, map[string]any{"dir_x": 0.6, "dir_y": 0.8}, me["roll"])
	assert.Equal(t, map[string]any{"remaining": 3.0, "total": 3.0}, me["roll_cooldown"])

	_, frame = wireFor(t, em, types.WorldTypeRun, watcher)
	other := otherPlayerOf(t, frame, roller)
	assert.Equal(t, map[string]any{"dir_x": 0.6, "dir_y": 0.8}, other["roll"], "every viewer sees it")
	assert.NotContains(t, other, "roll_cooldown", "the owner's alone")
	assert.NotContains(t, frame["current_player"].(map[string]any), "roll", "the watcher is not rolling")

	rolls := systems.NewRollSystem()
	move := systems.NewMovementSystem()
	dt := 1.0 / float64(constants.GameFrameRate)
	for systems.Rolling(body) {
		rolls.Update(dt, em.GetAllEntities())
		move.Update(dt, em.GetAllEntities())
	}
	_, frame = wireFor(t, em, types.WorldTypeRun, roller)
	me = frame["current_player"].(map[string]any)
	assert.NotContains(t, me, "roll", "over")
	cooldown := me["roll_cooldown"].(map[string]any)
	assert.Less(t, cooldown["remaining"], 3.0)
	assert.Equal(t, 3.0, cooldown["total"])
	_, frame = wireFor(t, em, types.WorldTypeRun, watcher)
	assert.NotContains(t, otherPlayerOf(t, frame, roller), "roll")

	for range 100 {
		rolls.Update(dt, em.GetAllEntities())
	}
	_, frame = wireFor(t, em, types.WorldTypeRun, roller)
	assert.NotContains(t, frame["current_player"].(map[string]any), "roll_cooldown", "ready again")
}
