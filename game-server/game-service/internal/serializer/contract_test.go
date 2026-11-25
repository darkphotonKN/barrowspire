package serializer

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// withContract puts the delve's contract, taken by taker, on the run-level
// entity em holds.
func withContract(t *testing.T, em *ecs.EntityManager, taker uuid.UUID, state components.ContractState, heading string) {
	t.Helper()
	for _, e := range em.GetAllEntities() {
		if e.HasComponent(ecs.ComponentTypeFloor) {
			e.AddComponent(&components.ContractComponent{Taker: taker, Mark: uuid.New(), State: state, Heading: heading})
			return
		}
	}
	t.Fatal("no run-level entity")
}

// otherPlayer is the other player of id in frame.
func otherPlayer(t *testing.T, frame map[string]any, id uuid.UUID) map[string]any {
	t.Helper()
	for _, o := range frame["other_players"].([]any) {
		if other := o.(map[string]any); other["id"] == id.String() {
			return other
		}
	}
	t.Fatalf("no other player %s", id)
	return nil
}

// FS-4EC7Z §F R25: the contract rides the taker's current_player alone, its
// state and, while active, its heading; nobody else is told it.
func TestFormatStateToClientState_ContractOnTheTakersCurrentPlayerOnly(t *testing.T) {
	em := ecs.NewEntityManager()
	onTomeRunFloor(em, 2)
	taker, other := uuid.New(), uuid.New()
	addDelver(em, taker, 0, 0, 100)
	addDelver(em, other, 100, 0, 100)
	withContract(t, em, taker, components.ContractActive, "north-east")

	me := tomeWire(t, em, types.WorldTypeRun, taker)["current_player"].(map[string]any)
	assert.Equal(t, map[string]any{"state": "active", "heading": "north-east"}, me["contract"])

	them := tomeWire(t, em, types.WorldTypeRun, other)
	assert.NotContains(t, them["current_player"], "contract", "not the taker's")
	assert.NotContains(t, otherPlayer(t, them, taker), "contract", "never on another player")
}

// FS-4EC7Z §F R25: a settled or lost contract carries its state and no
// heading; with no contract taken the key is absent.
func TestFormatStateToClientState_ContractSettledLostOrNone(t *testing.T) {
	for _, state := range []components.ContractState{components.ContractSettled, components.ContractLost} {
		em := ecs.NewEntityManager()
		onTomeRunFloor(em, 2)
		taker := uuid.New()
		addDelver(em, taker, 0, 0, 100)
		withContract(t, em, taker, state, "")
		me := tomeWire(t, em, types.WorldTypeRun, taker)["current_player"].(map[string]any)
		assert.Equal(t, map[string]any{"state": string(state)}, me["contract"])
	}

	em := ecs.NewEntityManager()
	onTomeRunFloor(em, 2)
	me := uuid.New()
	addDelver(em, me, 0, 0, 100)
	assert.NotContains(t, tomeWire(t, em, types.WorldTypeRun, me)["current_player"], "contract")
}

// FS-4EC7Z §F R25: contract_settled is on the public state of a delver who
// holds Contract Settled, seen by everyone; absent for anyone else.
func TestFormatStateToClientState_ContractSettledIsPublic(t *testing.T) {
	em := ecs.NewEntityManager()
	onTomeRunFloor(em, 3)
	holder, other := uuid.New(), uuid.New()
	systems.SettleContract(addDelver(em, holder, 0, 0, 100), 1.15)
	addDelver(em, other, 100, 0, 100)

	mine := tomeWire(t, em, types.WorldTypeRun, holder)["current_player"].(map[string]any)
	assert.Equal(t, true, mine["contract_settled"])
	theirs := tomeWire(t, em, types.WorldTypeRun, other)
	assert.Equal(t, true, otherPlayer(t, theirs, holder)["contract_settled"], "public")
	require.Contains(t, theirs, "current_player")
	assert.NotContains(t, theirs["current_player"], "contract_settled")
}
