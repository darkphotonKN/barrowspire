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

// addPilgrim stands a pilgrim at (x, y) with 80 of 120 health, cowering, who
// said the plea at 2.5 s of its age.
func addPilgrim(em *ecs.EntityManager, x, y float64) *ecs.Entity {
	e := em.CreateEntity()
	e.AddComponent(&components.EncounterNPCComponent{
		Kind: components.EncounterNPCPilgrim, Look: "pilgrim_b",
		Stance: components.StancePeaceful, Action: components.EncounterActionCower,
		FacingX: 1, Line: components.LinePilgrimPlea, LineAt: 2.5, Age: 3,
	})
	e.AddComponent(components.NewTransformComponent(x, y))
	e.AddComponent(components.NewVelocityComponent(0, 0, 0))
	e.AddComponent(components.NewHealthComponent(80, 120))
	return e
}

// FS-4EC7Z §F R22: an encounter NPC is sent on encounter_npcs with its kind,
// look, place, facing, health, stance, action and its line with line_at; no
// hirer_id for one that is no ally.
func TestFormatStateToClientState_EncounterNPCsOnTheWire(t *testing.T) {
	em := ecs.NewEntityManager()
	onTomeRunFloor(em, 2)
	me := uuid.New()
	addDelver(em, me, 0, 0, 100)
	p := addPilgrim(em, 300, 40)

	sent := tomeWire(t, em, types.WorldTypeRun, me)
	require.Contains(t, sent, "encounter_npcs")
	npcs := sent["encounter_npcs"].([]any)
	require.Len(t, npcs, 1)
	npc := npcs[0].(map[string]any)
	assert.Equal(t, p.ID.String(), npc["entity_id"])
	assert.Equal(t, "pilgrim", npc["kind"])
	assert.Equal(t, "pilgrim_b", npc["look"])
	assert.Equal(t, map[string]any{"x": 300.0, "y": 40.0}, npc["position"])
	assert.Equal(t, map[string]any{"x": 1.0, "y": 0.0}, npc["facing"])
	assert.Equal(t, 80.0, npc["health"])
	assert.Equal(t, 120.0, npc["max_health"])
	assert.Equal(t, "peaceful", npc["stance"])
	assert.Equal(t, "cower", npc["action"])
	assert.Equal(t, "pilgrim_plea", npc["line"])
	assert.Equal(t, 2.5, npc["line_at"])
	assert.NotContains(t, npc, "hirer_id")
}

// FS-4EC7Z §F R22: an NPC that has said nothing carries no line; a dead one
// is sent dead; an ally names its hirer.
func TestFormatStateToClientState_EncounterNPCLineDeadAndHirer(t *testing.T) {
	em := ecs.NewEntityManager()
	onTomeRunFloor(em, 2)
	me, hirer := uuid.New(), uuid.New()
	addDelver(em, me, 0, 0, 100)
	quiet := addPilgrim(em, 100, 0)
	nc, _ := quiet.GetComponent(ecs.ComponentTypeEncounterNPC)
	nc.(*components.EncounterNPCComponent).Line = ""
	ally := addPilgrim(em, 200, 0)
	ac, _ := ally.GetComponent(ecs.ComponentTypeEncounterNPC)
	ac.(*components.EncounterNPCComponent).Stance = components.StanceAlly
	ac.(*components.EncounterNPCComponent).HirerID = hirer
	dead := addPilgrim(em, 300, 0)
	hc, _ := dead.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 0

	byID := map[string]map[string]any{}
	for _, n := range tomeWire(t, em, types.WorldTypeRun, me)["encounter_npcs"].([]any) {
		byID[n.(map[string]any)["entity_id"].(string)] = n.(map[string]any)
	}
	assert.NotContains(t, byID[quiet.ID.String()], "line")
	assert.NotContains(t, byID[quiet.ID.String()], "line_at")
	assert.Equal(t, hirer.String(), byID[ally.ID.String()]["hirer_id"])
	assert.Equal(t, "dead", byID[dead.ID.String()]["action"])
}

// FS-4EC7Z §F R22: encounter NPCs are cut by interest as monsters are, and
// the key is absent where there are none: the hub, or a floor without one.
func TestFormatStateToClientState_EncounterNPCsCutByInterestAbsentElsewhere(t *testing.T) {
	em := ecs.NewEntityManager()
	onTomeRunFloor(em, 2)
	near, far := uuid.New(), uuid.New()
	addDelver(em, near, 0, 0, 100)
	addDelver(em, far, 5000, 0, 100)
	addPilgrim(em, 500, 0)

	assert.Contains(t, tomeWire(t, em, types.WorldTypeRun, near), "encounter_npcs")
	assert.NotContains(t, tomeWire(t, em, types.WorldTypeRun, far), "encounter_npcs", "beyond the interest radius")

	bare := ecs.NewEntityManager()
	onTomeRunFloor(bare, 2)
	me := uuid.New()
	addDelver(bare, me, 0, 0, 100)
	assert.NotContains(t, tomeWire(t, bare, types.WorldTypeRun, me), "encounter_npcs", "a floor without an encounter")
	assert.NotContains(t, tomeWire(t, bare, types.WorldTypeHub, me), "encounter_npcs", "the hub")
}
