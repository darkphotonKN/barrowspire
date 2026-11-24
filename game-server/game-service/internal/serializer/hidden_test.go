package serializer

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-5FZ4J §F R37-R38, §I R46: an undetected secret door is no barrier on the
// wire; a detected one is, shut. What it conceals, a chest or a piece, is in
// no list until the mark is gone.
func TestSerialize_UndetectedAndConcealedAreSentToNoOne(t *testing.T) {
	em := ecs.NewEntityManager()
	_, _, _, _ = sealedFloor(em)
	door := em.CreateEntity()
	door.AddComponent(&components.BarrierComponent{Kind: components.BarrierSecretDoor, Cells: []components.Cell{{X: 5, Y: 5}}})
	door.AddComponent(components.NewDoorComponent(80, 80))
	door.AddComponent(components.NewTransformComponent(400, 400))
	door.AddComponent(components.NewOpenableComponent(false))
	detection := &components.DetectableComponent{Spots: []components.Spot{{X: 440, Y: 440}}}
	door.AddComponent(detection)

	shrine := em.CreateEntity()
	shrine.AddComponent(&components.SealPieceComponent{Kind: components.SealPieceShrine, Cell: components.Cell{X: 7, Y: 5}})
	shrine.AddComponent(components.NewTransformComponent(600, 440))
	shrine.AddComponent(&components.ConcealedComponent{By: door.ID})
	chest := em.CreateEntity()
	chest.AddComponent(components.NewContainerComponent(uuid.New()))
	chest.AddComponent(components.NewTransformComponent(640, 440))
	chest.AddComponent(components.NewItemIDListComponent(nil))
	chest.AddComponent(components.NewOpenableComponent(false))
	chest.AddComponent(&components.ConcealedComponent{By: door.ID})

	kinds := func(list any, key string) []string {
		var out []string
		for _, e := range asList(list) {
			out = append(out, e.(map[string]any)[key].(string))
		}
		return out
	}
	wire := sealWireOf(t, em, types.WorldTypeRun)
	assert.Equal(t, []string{"gate"}, kinds(wire["barriers"], "kind"), "undetected: no secret door")
	assert.NotContains(t, kinds(wire["seal_pieces"], "kind"), "shrine", "concealed: no shrine")
	assert.Empty(t, asList(wire["containers"]), "concealed: no chest")

	detection.Detected = true
	shrine.RemoveComponent(ecs.ComponentTypeConcealed)
	chest.RemoveComponent(ecs.ComponentTypeConcealed)
	wire = sealWireOf(t, em, types.WorldTypeRun)
	assert.ElementsMatch(t, []string{"gate", "secret_door"}, kinds(wire["barriers"], "kind"))
	assert.Contains(t, kinds(wire["seal_pieces"], "kind"), "shrine")
	assert.Len(t, asList(wire["containers"]), 1)
}

// FS-5FZ4J §I R46: key_carried is set while the party carries the stair key,
// absent otherwise.
func TestSerialize_SealKeyCarried(t *testing.T) {
	em := ecs.NewEntityManager()
	seal, _, _, _ := sealedFloor(em)
	require.NotContains(t, sealWireOf(t, em, types.WorldTypeRun)["seal"], "key_carried")
	sc, _ := seal.GetComponent(ecs.ComponentTypeSeal)
	sc.(*components.SealComponent).KeyCarried = true
	assert.Equal(t, true, sealWireOf(t, em, types.WorldTypeRun)["seal"].(map[string]any)["key_carried"])
}

func asList(v any) []any {
	list, _ := v.([]any)
	return list
}
