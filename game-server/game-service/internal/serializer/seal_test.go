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

// sealedFloor is a run floor with a Lever Order of two levers, the first
// down, a mural, and its gate shut.
func sealedFloor(em *ecs.EntityManager) (seal, lever, mural, gate *ecs.Entity) {
	floor := em.CreateEntity()
	floor.AddComponent(&components.FloorComponent{Depth: 1, Count: 5, CellSize: 80})

	seal = em.CreateEntity()
	seal.AddComponent(components.NewSealComponent(components.SealLeverOrder, 1))

	lever = em.CreateEntity()
	lever.AddComponent(&components.SealPieceComponent{Seal: seal.ID, Kind: components.SealPieceLever,
		Cell: components.Cell{X: 3, Y: 4}, Glyph: "crow", Turn: 1, Active: true})
	lever.AddComponent(components.NewTransformComponent(280, 360))
	other := em.CreateEntity()
	other.AddComponent(&components.SealPieceComponent{Seal: seal.ID, Kind: components.SealPieceLever,
		Cell: components.Cell{X: 9, Y: 2}, Glyph: "moon", Turn: 2})
	other.AddComponent(components.NewTransformComponent(760, 200))

	mural = em.CreateEntity()
	mural.AddComponent(&components.SealPieceComponent{Seal: seal.ID, Kind: components.SealPieceMural, Cell: components.Cell{X: 1, Y: 1}})
	mural.AddComponent(components.NewTransformComponent(120, 120))

	gate = em.CreateEntity()
	gate.AddComponent(&components.BarrierComponent{Kind: components.BarrierGate,
		Cells: []components.Cell{{X: 20, Y: 10}, {X: 20, Y: 11}}})
	gate.AddComponent(components.NewDoorComponent(80, 160))
	gate.AddComponent(components.NewTransformComponent(1600, 800))
	gate.AddComponent(components.NewOpenableComponent(false))
	return seal, lever, mural, gate
}

// sealWireOf is what one recipient is sent of the entities, as JSON.
func sealWireOf(t *testing.T, em *ecs.EntityManager, world types.WorldType) map[string]any {
	t.Helper()
	s := NewStateSerializer(em, nil)
	backendState, err := s.SerializeBackendState(context.Background(), uuid.New(), world, em.GetAllEntities())
	require.NoError(t, err)
	raw, err := json.Marshal(s.FormatStateToClientState(backendState, uuid.New()))
	require.NoError(t, err)
	var wire map[string]any
	require.NoError(t, json.Unmarshal(raw, &wire))
	return wire
}

// FS-5FZ4J §I R46: a sealed floor sends its seal, its pieces and its barriers
// whole, every tick, in these shapes; the gate is a barrier, never a door.
func TestFormatStateToClientState_SealPiecesAndBarriers(t *testing.T) {
	em := ecs.NewEntityManager()
	_, lever, mural, gate := sealedFloor(em)

	wire := sealWireOf(t, em, types.WorldTypeRun)

	assert.Equal(t, map[string]any{"kind": "lever_order", "stage": 1.0, "stages": 1.0, "broken": false}, wire["seal"])

	pieces, ok := wire["seal_pieces"].([]any)
	require.True(t, ok, "seal_pieces is a list: %v", wire["seal_pieces"])
	require.Len(t, pieces, 3)
	byID := map[string]map[string]any{}
	for _, p := range pieces {
		byID[p.(map[string]any)["entity_id"].(string)] = p.(map[string]any)
	}
	assert.Equal(t, map[string]any{
		"entity_id": lever.ID.String(), "kind": "lever", "position": map[string]any{"x": 280.0, "y": 360.0},
		"cell": map[string]any{"x": 3.0, "y": 4.0}, "glyph": "crow", "active": true,
	}, byID[lever.ID.String()])
	assert.Equal(t, map[string]any{
		"entity_id": mural.ID.String(), "kind": "mural", "position": map[string]any{"x": 120.0, "y": 120.0},
		"cell": map[string]any{"x": 1.0, "y": 1.0}, "active": false,
	}, byID[mural.ID.String()], "no glyph on a mural")

	assert.Equal(t, []any{map[string]any{
		"entity_id": gate.ID.String(), "kind": "gate",
		"cells": []any{map[string]any{"x": 20.0, "y": 10.0}, map[string]any{"x": 20.0, "y": 11.0}},
		"open":  false,
	}}, wire["barriers"])
	assert.Empty(t, wire["doors"], "the gate is no door")
}

// FS-5FZ4J §I R46, R48: seal.broken turns true once every seal is broken,
// stage the last one's; the gate's open follows its Openable.
func TestFormatStateToClientState_BrokenSealAndOpenGate(t *testing.T) {
	em := ecs.NewEntityManager()
	seal, _, _, gate := sealedFloor(em)
	sc, _ := seal.GetComponent(ecs.ComponentTypeSeal)
	sc.(*components.SealComponent).Broken = true
	oc, _ := gate.GetComponent(ecs.ComponentTypeOpenable)
	oc.(*components.OpenableComponent).IsOpen = true

	wire := sealWireOf(t, em, types.WorldTypeRun)

	assert.Equal(t, map[string]any{"kind": "lever_order", "stage": 1.0, "stages": 1.0, "broken": true}, wire["seal"])
	assert.Equal(t, true, wire["barriers"].([]any)[0].(map[string]any)["open"])
}

// FS-5FZ4J §I R46: chained seals: kind and stage are the first unbroken one's.
func TestFormatStateToClientState_ChainedSealsNameTheFirstUnbroken(t *testing.T) {
	em := ecs.NewEntityManager()
	first, _, _, _ := sealedFloor(em)
	sc, _ := first.GetComponent(ecs.ComponentTypeSeal)
	sc.(*components.SealComponent).Broken = true
	second := em.CreateEntity()
	second.AddComponent(components.NewSealComponent(components.SealBraziers, 2))

	wire := sealWireOf(t, em, types.WorldTypeRun)

	assert.Equal(t, map[string]any{"kind": "braziers", "stage": 2.0, "stages": 2.0, "broken": false}, wire["seal"])
}

// FS-5FZ4J §I R46: a world with no seal, the hub, a field, the top floor or a
// floor of buildings, sends none of the keys.
func TestFormatStateToClientState_NoSealKeysWithoutASeal(t *testing.T) {
	for _, world := range []types.WorldType{types.WorldTypeHub, types.WorldTypeField, types.WorldTypeRun} {
		em := ecs.NewEntityManager()
		wire := sealWireOf(t, em, world)
		for _, key := range []string{"seal", "seal_pieces", "barriers"} {
			assert.NotContains(t, wire, key, "%s: %s", world, key)
		}
	}
}
