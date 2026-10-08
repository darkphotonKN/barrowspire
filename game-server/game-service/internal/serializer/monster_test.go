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

// addMonster stands a monster in the world the way a run spawns one.
func addMonster(em *ecs.EntityManager, name string, x, y float64, current, maxHealth int) *ecs.Entity {
	e := em.CreateEntity()
	e.AddComponent(&components.MonsterComponent{
		Archetype: components.MonsterArchetypeTroll,
		Level:     4,
		Name:      name,
		Action:    components.MonsterActionIdle,
		FacingX:   0,
		FacingY:   1,
	})
	e.AddComponent(components.NewTransformComponent(x, y))
	e.AddComponent(components.NewVelocityComponent(0, 0, 90))
	e.AddComponent(components.NewHealthComponent(current, maxHealth))
	return e
}

// wireOf is a client state as the client receives it.
func wireOf(t *testing.T, state *types.ClientGameState) map[string]any {
	t.Helper()
	raw, err := json.Marshal(state)
	require.NoError(t, err)
	var wire map[string]any
	require.NoError(t, json.Unmarshal(raw, &wire))
	return wire
}

// A run's broadcast carries every monster with everything the client draws it
// from, under the snake_case names it reads. FS-77AB6 §Requirements 32.
func TestFormatStateToClientState_CarriesEveryMonsterInARun(t *testing.T) {
	em := ecs.NewEntityManager()
	troll := addMonster(em, "Troll", 300, 200, 150, 207)
	addMonster(em, "Troll", 600, 400, 207, 207)
	s := NewStateSerializer(em)

	backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeRun, em.GetAllEntities())
	require.NoError(t, err)
	clientState := s.FormatStateToClientState(backendState, uuid.New())

	require.Len(t, clientState.Monsters, 2)

	wire := wireOf(t, clientState)
	monsters, ok := wire["monsters"].([]any)
	require.True(t, ok, "monsters is on the wire as a list")

	var got map[string]any
	for _, m := range monsters {
		if m.(map[string]any)["entity_id"] == troll.ID.String() {
			got = m.(map[string]any)
		}
	}
	require.NotNil(t, got, "the troll is in the broadcast by its entity id")

	assert.Equal(t, map[string]any{
		"entity_id":      troll.ID.String(),
		"archetype":      "troll",
		"name":           "Troll",
		"level":          float64(4),
		"elite":          false,
		"boss":           false,
		"position":       map[string]any{"x": float64(300), "y": float64(200)},
		"facing":         map[string]any{"x": float64(0), "y": float64(1)},
		"action":         "idle",
		"current_health": float64(150),
		"max_health":     float64(207),
	}, got)
}

// A monster at no health lies dead in the broadcast, whatever it was doing.
func TestSerializeBackendState_MonsterAtNoHealthIsDead(t *testing.T) {
	em := ecs.NewEntityManager()
	addMonster(em, "Ghoul", 300, 200, 0, 40)
	s := NewStateSerializer(em)

	backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeRun, em.GetAllEntities())
	require.NoError(t, err)

	require.Len(t, backendState.Monsters, 1)
	assert.Equal(t, string(components.MonsterActionDead), backendState.Monsters[0].Action)
}

// The hub never holds a monster, and its broadcast does not mention them.
// FS-77AB6 §Requirements 32.
func TestFormatStateToClientState_HubCarriesNoMonsters(t *testing.T) {
	em := ecs.NewEntityManager()
	s := NewStateSerializer(em)

	backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeHub, em.GetAllEntities())
	require.NoError(t, err)
	clientState := s.FormatStateToClientState(backendState, uuid.New())

	_, hasMonsters := wireOf(t, clientState)["monsters"]
	assert.False(t, hasMonsters, "the hub broadcast carries a monsters key")
}

// The pooled state is reset between ticks: a monster from one broadcast never
// lingers into the next.
func TestRestBackendStatePool_ClearsMonsters(t *testing.T) {
	em := ecs.NewEntityManager()
	addMonster(em, "Ghoul", 300, 200, 40, 40)
	s := NewStateSerializer(em)

	backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), types.WorldTypeRun, em.GetAllEntities())
	require.NoError(t, err)
	require.Len(t, backendState.Monsters, 1)

	s.RestBackendStatePool(backendState)

	assert.Empty(t, backendState.Monsters)
}
