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

// FS-X2CMM §B R11, §D R17, §J R55 as reconciled at wave 2, §K R59; FS-4EC7Z
// §C R10, §D R13, §F R27. I-X2CMM-19.

// mercenaryAtTheCage is a Captives run with a level-3 mercenary standing at
// its cage, in reach of it, the run's own delver in the start room.
func mercenaryAtTheCage(t *testing.T, seed uint64) (*Session, uuid.UUID, *ecs.Entity, *ecs.Entity) {
	t.Helper()
	s, _, _ := captivesRun(t, seed, 1)
	return atTheCage(t, s)
}

// atTheCage stands a level-3 mercenary at the run's cage, in reach of it.
func atTheCage(t *testing.T, s *Session) (*Session, uuid.UUID, *ecs.Entity, *ecs.Entity) {
	t.Helper()
	cage := theCage(t, s)
	merc, body := placeDelverAt(t, s, "mercenary", 3, 0, 0)
	standAtFixture(t, body, cage)
	return s, merc, body, cage
}

// pickTheLock casts Pick the Lock at the cage as the client does, by its
// entity id.
func pickTheLock(s *Session, merc uuid.UUID, cage *ecs.Entity) error {
	return s.castSkill(merc, types.PlayerCastSkillPayload{SkillID: "pick_the_lock", TargetID: cage.ID.String()})
}

// A level-3 mercenary beside the cage picks its lock without its key: after
// the 4 s cast the cage is open and the captives are the mercenary's allies;
// the page cost nothing and its 30 s cooldown runs. The page is offered: on
// the book, ready. R55, R11, R59; FS-4EC7Z §D R13.
func TestCastSkill_PickTheLock_OpensTheCageWithoutItsKey(t *testing.T) {
	s, merc, body, cage := mercenaryAtTheCage(t, 4)
	require.False(t, captivesOf(t, s).KeyCarried)
	assert.Equal(t, false, pageOnWire(t, s, merc, components.PagePickTheLock)["spent"], "offered: on the book")

	require.NoError(t, pickTheLock(s, merc, cage))
	require.NotNil(t, bookOf(t, body).Casting, "a 4 s cast")
	passSeconds(s, 3.9)
	assert.False(t, cageOf(t, cage).Open, "shut until the cast completes")
	passSeconds(s, 0.2)

	assert.True(t, cageOf(t, cage).Open)
	for _, e := range npcsOf(s) {
		assert.Equal(t, components.StanceAlly, npcOf(t, e).Stance)
		assert.Equal(t, merc, npcOf(t, e).HirerID, "the mercenary's allies")
	}
	assert.Equal(t, 30.0, bookOf(t, body).Cooldowns[components.PagePickTheLock].Total, "paid for: its cooldown runs")
	assert.Empty(t, s.sender.(*recordingSender).to(merc), "nothing told")
}

// A Pick the Lock the open-cage entry point refuses at the cast's end ends
// with nothing spent, the cage as it was, and the mercenary is told why on
// the cast's reply: too_many_allies past the party's cap, cage_open for a
// cage its key opened during the cast. FS-4EC7Z §C R10, §F R27; FS-X2CMM §D
// R17.
func TestCastSkill_PickTheLock_RefusedAtTheCastsEndAndToldWhy(t *testing.T) {
	tests := []struct {
		name   string
		during func(t *testing.T, s *Session, delver uuid.UUID, cage *ecs.Entity)
		reason string
	}{
		{"past the ally cap", func(t *testing.T, s *Session, delver uuid.UUID, _ *ecs.Entity) {
			// two allies already: the two captives would be four
			for range AllyCap - 1 {
				npc := CreateEncounterNPCEntity(s.EntityManager, EncounterNPCConfig{Kind: components.EncounterNPCCaptive, Stance: components.StancePeaceful, Health: 100})
				require.NoError(t, s.makeAllies([]*ecs.Entity{npc}, delver))
			}
		}, RefusalTooManyAllies},
		{"opened by its key meanwhile", func(t *testing.T, s *Session, delver uuid.UUID, cage *ecs.Entity) {
			require.NoError(t, s.OpenCage(cage.ID, delver))
			// held still, so the freed walking past breaks no cast
			for _, e := range npcsOf(s) {
				e.RemoveComponent(ecs.ComponentTypeVelocity)
			}
		}, RefusalCageOpen},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			run, ids, _ := captivesRun(t, 5, 1)
			s, merc, body, cage := atTheCage(t, run)
			require.NoError(t, pickTheLock(s, merc, cage))
			passSeconds(s, 1)
			tt.during(t, s, ids[0], cage)
			wasOpen := cageOf(t, cage).Open

			passSeconds(s, 3.1)

			assert.Nil(t, bookOf(t, body).Casting, "the cast ended")
			assert.NotContains(t, bookOf(t, body).Cooldowns, components.PagePickTheLock, "nothing spent")
			assert.Equal(t, wasOpen, cageOf(t, cage).Open, "the cage as it was")
			reply := lastReply(t, s.sender.(*recordingSender), merc)
			sent := s.sender.(*recordingSender).to(merc)
			assert.Equal(t, string(constants.ActionCastSkill), sent[len(sent)-1].Action)
			assert.Equal(t, false, reply["success"])
			assert.Equal(t, tt.reason, reply["reason"])
			assert.NotEmpty(t, reply["message"])
		})
	}
}

// Only the shut cage is picked: the sealed floors built no locked doors or chests,
// so anything else, or a cage out of reach, is refused at the cast with
// nothing started and nothing told. R55 as reconciled at wave 2, R12; §A R4.
func TestCastSkill_PickTheLock_OnlyTheCageInReach(t *testing.T) {
	s, merc, body, cage := mercenaryAtTheCage(t, 4)
	npc := npcsOf(s)[0]

	require.NoError(t, s.castSkill(merc, types.PlayerCastSkillPayload{SkillID: "pick_the_lock", TargetID: npc.ID.String()}))
	assert.Nil(t, bookOf(t, body).Casting, "a captive is no lock")

	farFrom(t, s, body)
	require.NoError(t, pickTheLock(s, merc, cage))
	assert.Nil(t, bookOf(t, body).Casting, "out of reach")
	assert.Empty(t, s.sender.(*recordingSender).to(merc))
}

// A cage its key already opened is no lock to pick: the cast is refused as
// the book refuses, nothing started and nothing told, the 4 s never spent on
// a cage_open. R55, R4.
func TestCastSkill_PickTheLock_AnOpenCageIsRefusedAtTheCast(t *testing.T) {
	s, merc, body, cage := mercenaryAtTheCage(t, 4)
	require.NoError(t, s.OpenCage(cage.ID, merc))
	require.True(t, cageOf(t, cage).Open)

	require.NoError(t, pickTheLock(s, merc, cage))

	assert.Nil(t, bookOf(t, body).Casting, "nothing started")
	assert.NotContains(t, bookOf(t, body).Cooldowns, components.PagePickTheLock)
	assert.Empty(t, s.sender.(*recordingSender).to(merc), "nothing told")
}
