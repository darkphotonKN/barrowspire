package serializer

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-MQYEX §Requirements 18–19. I-MQYEX-1.

// A delver with a timed open is told it on their own current_player: the
// container, the time counted so far and the time it takes. One without has no
// such key.
func TestFormatStateToClientState_TellsADelverTheirOwnTimedOpen(t *testing.T) {
	em := ecs.NewEntityManager()
	opening, idle := uuid.New(), uuid.New()
	container := uuid.New()
	seatWithResource(em, opening, "warrior", stamina(100, 100), components.AttackDash).
		AddComponent(&components.TimedOpenComponent{ContainerID: container, Elapsed: 0.4, Duration: 1.5, FromX: 10, FromY: 10})
	seatWithResource(em, idle, "mage", mana(150, 150), components.AttackTripleFireball)

	_, mine := wireFor(t, em, types.WorldTypeRun, opening)
	_, theirs := wireFor(t, em, types.WorldTypeRun, idle)

	assert.Equal(t,
		map[string]any{"entity_id": container.String(), "elapsed": 0.4, "duration": 1.5},
		mine["current_player"].(map[string]any)["timed_open"])
	assert.NotContains(t, theirs["current_player"], "timed_open", "absent with none")
}

// Nobody else is told a delver's timed open, a party's teammate included, and
// no container's entry carries anything of it. D11, ADR-0064.
func TestFormatStateToClientState_TimedOpenIsItsOwnersAlone(t *testing.T) {
	w := newPartyWorld()
	chest := w.em.CreateEntity()
	chest.AddComponent(components.NewContainerComponent(uuid.New()))
	chest.AddComponent(components.NewTransformComponent(20, 20))
	chest.AddComponent(components.NewItemIDListComponent(nil))
	chest.AddComponent(components.NewOpenableComponent(false))
	for _, entity := range w.em.GetAllEntities() {
		if pc, ok := entity.GetComponent(ecs.ComponentTypePlayer); ok && pc.(*components.PlayerComponent).MemberID == w.mage {
			entity.AddComponent(&components.TimedOpenComponent{ContainerID: chest.ID, Elapsed: 1.0, Duration: 1.5})
		}
	}

	// one serialization, cut for a teammate and for the owner
	frameFor := func(recipient uuid.UUID) (string, map[string]any) {
		s := NewStateSerializer(w.em, w.parties)
		backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeRun, w.em.GetAllEntities())
		require.NoError(t, err)
		encoded, err := json.Marshal(s.FormatStateToClientState(backendState, recipient))
		require.NoError(t, err)
		var frame map[string]any
		require.NoError(t, json.Unmarshal(encoded, &frame))
		return string(encoded), frame
	}

	raw, frame := frameFor(w.wren)
	assert.NotContains(t, raw, "timed_open", "a teammate's timed open is never sent")
	containers := frame["containers"].([]any)
	require.Len(t, containers, 1)
	entry := containers[0].(map[string]any)
	keys := make([]string, 0, len(entry))
	for k := range entry {
		keys = append(keys, k)
	}
	assert.ElementsMatch(t, []string{"container_id", "entity_id", "kind", "position", "is_open", "items"}, keys)
	assert.Equal(t, false, entry["is_open"])

	_, mages := frameFor(w.mage)
	assert.Contains(t, mages["current_player"], "timed_open", "its owner is told it")
}
