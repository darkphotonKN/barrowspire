package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §B R11, §F R32, §J R57, §K R59; FS-4EC7Z §E R16, §F R25, R27.
// I-X2CMM-21.

// mercenaryOnContractRun is contractRun's floor with a level-15 mercenary
// in its start room beside its one warrior, whose member id comes last.
func mercenaryOnContractRun(t *testing.T, seed uint64) (*Session, uuid.UUID, *ecs.Entity, uuid.UUID) {
	t.Helper()
	s, ids, _ := contractRun(t, seed, 1)
	merc, body := placeDelverAt(t, s, "mercenary", 15, 0, 0)
	farFrom(t, s, body)
	return s, merc, body, ids[0]
}

// A level-15 mercenary's Take a Contract places the delve's contract on the
// tick: the mark stands on the floor, the page is spent for the delve with
// nothing paid, and the taker's next frame carries the contract and its
// heading, the page still on the book as spent. R57, R11, R32; FS-4EC7Z §F
// R25.
func TestCastSkill_TakeAContract_PlacesTheMarkTheTakerHunts(t *testing.T) {
	s, merc, body, _ := mercenaryOnContractRun(t, 3)
	assert.Equal(t, false, pageOnWire(t, s, merc, components.PageTakeAContract)["spent"], "offered: on the book, ready")

	require.NoError(t, castPageSkill(s, merc, "take_a_contract"))

	theMark(t, s)
	assert.True(t, bookOf(t, body).Spent[components.PageTakeAContract], "once per delve")
	me := frameOf(t, s, types.WorldTypeRun, merc)["current_player"].(map[string]any)
	contract, ok := me["contract"].(map[string]any)
	require.True(t, ok, "the taker hunts it: %v", me["contract"])
	assert.Equal(t, string(components.ContractActive), contract["state"])
	assert.NotEmpty(t, contract["heading"])
	assert.Equal(t, true, pageOnWire(t, s, merc, components.PageTakeAContract)["spent"])

	// killing it grants the mercenary Contract Settled, on the public state
	slayMark(t, s, merc, body, theMark(t, s))
	frame := frameOf(t, s, types.WorldTypeRun, merc)
	me = frame["current_player"].(map[string]any)
	assert.Equal(t, string(components.ContractSettled), me["contract"].(map[string]any)["state"])
	assert.Equal(t, true, me["contract_settled"])
}

// A Take a Contract the contract entry point refuses is refused with nothing
// spent, the once-a-delve use kept, and the mercenary is told why on the
// cast's reply: contract_taken when one was taken this delve, the others'
// reasons for the top floor and a floor with no room for the mark. FS-4EC7Z §E
// R16, §F R27; FS-X2CMM §A R4.
func TestCastSkill_TakeAContract_RefusedAndToldWhyNothingSpent(t *testing.T) {
	tests := []struct {
		name   string
		ready  func(t *testing.T, s *Session, warrior uuid.UUID)
		reason string
	}{
		{"taken this delve", func(t *testing.T, s *Session, warrior uuid.UUID) {
			require.NoError(t, s.TakeContract(warrior))
		}, RefusalContractTaken},
		{"the top floor", func(t *testing.T, s *Session, _ uuid.UUID) { currentFloor(t, s).Count = 2 }, RefusalContractNoStairs},
		{"no room for the mark", func(_ *testing.T, s *Session, _ uuid.UUID) { s.dungeon = nil }, RefusalContractNoRoom},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, merc, body, warrior := mercenaryOnContractRun(t, 3)
			tt.ready(t, s, warrior)
			marks := len(contractMarks(s))

			assert.NoError(t, castPageSkill(s, merc, "take_a_contract"))

			assert.False(t, bookOf(t, body).Spent[components.PageTakeAContract], "the use unspent")
			assert.Len(t, contractMarks(s), marks, "no mark of the mercenary's")
			sent := s.sender.(*recordingSender).to(merc)
			require.NotEmpty(t, sent, "told why")
			reply := sent[len(sent)-1]
			assert.Equal(t, string(constants.ActionCastSkill), reply.Action)
			assert.Equal(t, false, reply.Payload["success"])
			assert.Equal(t, tt.reason, reply.Payload["reason"])
			assert.NotEmpty(t, reply.Payload["message"])
		})
	}
}

// A cast the book's own gates refuse is still refused with no message back,
// as every page's is: a level-14 mercenary's page is locked. FS-X2CMM §A R4.
func TestCastSkill_TakeAContract_LockedSendsNothing(t *testing.T) {
	s, _, _ := contractRun(t, 3, 1)
	merc, body := placeDelverAt(t, s, "mercenary", 14, 0, 0)
	farFrom(t, s, body)

	assert.NoError(t, castPageSkill(s, merc, "take_a_contract"))

	assert.Empty(t, contractMarks(s))
	assert.Empty(t, s.sender.(*recordingSender).to(merc))
}
