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

// FS-X2CMM §B R11, §C R13, §D R17, §J R56, §K R59; FS-4EC7Z §C R10, §D R15,
// §F R22, R27. I-X2CMM-20.

// mercenaryNear is a level-9 mercenary standing about 3 cells from npc, the
// run's own delvers where they were.
func mercenaryNear(t *testing.T, s *Session, npc *ecs.Entity) (uuid.UUID, *ecs.Entity) {
	t.Helper()
	merc, body := placeDelverAt(t, s, "mercenary", 9, 0, 0)
	standBeside(t, s, body, npc, 3*s.bookCellSize())
	return merc, body
}

// strikeADeal casts Strike a Deal at npc as the client does, by the entity id
// encounter_npcs carries.
func strikeADeal(s *Session, merc uuid.UUID, npc *ecs.Entity) error {
	return s.castSkill(merc, types.PlayerCastSkillPayload{SkillID: "strike_a_deal", TargetID: npc.ID.String()})
}

// standStill runs the floor n ticks with no monster on it and every body
// unhurt, so nothing but the clock moves the cast.
func standStill(s *Session, n int) {
	for range n {
		clearMonsters(s)
		keepStanding(s.EntityManager)
		tick(s)
	}
}

// A level-9 mercenary strikes a deal with the Cutthroats, aiming at one of
// them 3 cells off: after the 2 s cast the whole group is the mercenary's
// allies for the floor, each acknowledging; no gold changes hands, the page
// cost nothing and its 900 s cooldown runs. The page is offered: on the book.
// R56, R11, R59; FS-4EC7Z §D R15.
func TestCastSkill_StrikeADeal_HiresTheCutthroats(t *testing.T) {
	s, _, _ := cutthroatsRun(t, 7, 1, 0)
	npc := npcsOf(s)[1]
	merc, body := mercenaryNear(t, s, npc)
	assert.Equal(t, false, pageOnWire(t, s, merc, components.PageStrikeADeal)["spent"], "offered: on the book")

	require.NoError(t, strikeADeal(s, merc, npc))
	require.NotNil(t, bookOf(t, body).Casting, "a 2 s cast")
	standStill(s, castTicks(2)-1)
	assert.False(t, cutthroatsOf(t, s).Hired, "not until the cast completes")
	standStill(s, 2)

	assertHiredBy(t, s, merc)
	assert.Equal(t, 900.0, bookOf(t, body).Cooldowns[components.PageStrikeADeal].Total, "paid for: its cooldown runs")
	assert.Empty(t, s.sender.(*recordingSender).to(merc), "nothing told")
}

// A Strike a Deal the hire entry point refuses at the cast's end ends with
// nothing spent and nothing hired, and the mercenary is told why on the
// cast's reply: not_willing for the Lost Pilgrims or caged Captives,
// already_hired for a group allied to another, too_many_allies past the
// party's cap. FS-4EC7Z §C R10, §D R15, §F R27; FS-X2CMM §D R17.
func TestCastSkill_StrikeADeal_RefusedAtTheCastsEndAndToldWhy(t *testing.T) {
	tests := []struct {
		name   string
		run    func(t *testing.T) (*Session, uuid.UUID)
		reason string
	}{
		{"caged captives are not willing", func(t *testing.T) (*Session, uuid.UUID) {
			s, ids, _ := captivesRun(t, 4, 1)
			return s, ids[0]
		}, RefusalNotWilling},
		{"pilgrims are not willing", func(t *testing.T) (*Session, uuid.UUID) {
			s, _ := pilgrimsRun(t, 4, 1)
			return s, delverIDs(s)[0]
		}, RefusalNotWilling},
		{"hired by another", func(t *testing.T) (*Session, uuid.UUID) {
			s, ids, _ := cutthroatsRun(t, 9, 1, 0)
			require.NoError(t, s.Hire(npcsOf(s)[0].ID, ids[0]))
			// held still, so following their hirer takes none out of range
			for _, e := range npcsOf(s) {
				e.RemoveComponent(ecs.ComponentTypeVelocity)
			}
			return s, ids[0]
		}, RefusalAlreadyHired},
		{"past the ally cap", func(t *testing.T) (*Session, uuid.UUID) {
			s, ids, _ := cutthroatsRun(t, 12, 1, 0)
			other := CreateEncounterNPCEntity(s.EntityManager, EncounterNPCConfig{Kind: components.EncounterNPCCaptive, Stance: components.StancePeaceful, Health: 100})
			require.NoError(t, s.makeAllies([]*ecs.Entity{other}, ids[0]))
			return s, ids[0]
		}, RefusalTooManyAllies},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, _ := tt.run(t)
			_, enc, ok := theEncounter(s)
			require.True(t, ok)
			npc, ok := s.EntityManager.GetEntity(enc.NPCs[0])
			require.True(t, ok)
			allies := s.livingAllies()
			merc, body := mercenaryNear(t, s, npc)

			require.NoError(t, strikeADeal(s, merc, npc))
			require.NotNil(t, bookOf(t, body).Casting, "taken at the cast")
			standStill(s, castTicks(2)+1)

			assert.Nil(t, bookOf(t, body).Casting, "the cast ended")
			assert.NotContains(t, bookOf(t, body).Cooldowns, components.PageStrikeADeal, "nothing spent")
			assert.Equal(t, allies, s.livingAllies(), "nothing hired")
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

// Strike a Deal is aimed at a living encounter NPC within 4 cells, the one
// body a group shows: the encounter itself (no body on the wire), a cage, or
// a Cutthroat 5 cells off is refused at the cast, nothing started and nothing
// told. R56, R13-R14; §A R4.
func TestCastSkill_StrikeADeal_OnlyANearEncounterNPC(t *testing.T) {
	s, _, _ := cutthroatsRun(t, 7, 1, 0)
	encounter, _, ok := theEncounter(s)
	require.True(t, ok)
	npc := npcsOf(s)[0]
	merc, body := mercenaryNear(t, s, npc)

	require.NoError(t, s.castSkill(merc, types.PlayerCastSkillPayload{SkillID: "strike_a_deal", TargetID: encounter.ID.String()}))
	assert.Nil(t, bookOf(t, body).Casting, "the encounter has no body to aim at")

	standBeside(t, s, body, npc, 5*s.bookCellSize())
	require.NoError(t, strikeADeal(s, merc, npc))
	assert.Nil(t, bookOf(t, body).Casting, "out of range")
	assert.Empty(t, s.sender.(*recordingSender).to(merc))
	assert.False(t, cutthroatsOf(t, s).Hired)
}
