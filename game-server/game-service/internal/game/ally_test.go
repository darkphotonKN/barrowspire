package game

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

// standingNPC stands an encounter NPC of kind in stance at (x, y), 1000
// health, outside any session.
func standingNPC(em *ecs.EntityManager, kind components.EncounterNPCKind, stance components.EncounterStance, x, y float64) *ecs.Entity {
	return CreateEncounterNPCEntity(em, EncounterNPCConfig{Kind: kind, Stance: stance, X: x, Y: y, Health: 1000})
}

// FS-4EC7Z §C R9, FS-5FZ4J §C R18: a freed captive, an ally, standing on a
// pressure plate holds it; a caged one or a peaceful pilgrim does not.
func TestPlateHeld_AnAllyOnItHoldsIt(t *testing.T) {
	const size = 80.0
	cell := components.Cell{X: 3, Y: 4}
	x, y := 3*size+size/2, 4*size+size/2
	cases := []struct {
		name   string
		stance components.EncounterStance
		kind   components.EncounterNPCKind
		holds  bool
	}{
		{"a freed captive, an ally", components.StanceAlly, components.EncounterNPCCaptive, true},
		{"a caged captive", components.StanceCaged, components.EncounterNPCCaptive, false},
		{"a peaceful pilgrim", components.StancePeaceful, components.EncounterNPCPilgrim, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			npc := standingNPC(em, c.kind, c.stance, x, y)
			if c.stance == components.StanceAlly {
				nc, _ := npc.GetComponent(ecs.ComponentTypeEncounterNPC)
				nc.(*components.EncounterNPCComponent).HirerID = uuid.New()
			}
			holds, by := plateHeld(cell, size, em.GetAllEntities())
			assert.Equal(t, c.holds, holds)
			if c.holds {
				assert.Equal(t, npc.ID, by.ID)
			}
		})
	}
}

// FS-4EC7Z §C R11: a kill an ally made gives no experience to anyone, and
// sets off none of its hirer's kill effects.
func TestKillCredit_AnAllysKillGivesNoExperience(t *testing.T) {
	s := unstartedRun(t)
	hirer := seatMember(t, s, types.CharacterInPlay{Name: "Wren", Class: "warrior"})
	other := seatMember(t, s, types.CharacterInPlay{Name: "Kaelen", Class: "mage"})

	record := ghoulKilledBy(hirer.id)
	record.ByAlly = true
	s.publishKills([]systems.KillRecord{record})

	assert.Equal(t, 0, hirer.body.stats.Experience, "not the hirer")
	assert.Equal(t, 0, other.body.stats.Experience, "nor anyone")

	s.publishKills([]systems.KillRecord{ghoulKilledBy(hirer.id)})
	assert.Equal(t, 10, hirer.body.stats.Experience, "the hirer's own kill still gives it")
}

// FS-4EC7Z §C R11, FS-5FZ4J §G R44: an ally's kill rolls its drop as its
// hirer's: a blessed hirer's better chance applies.
func TestKillCredit_AnAllysKillDropsAsTheHirersKill(t *testing.T) {
	record := ghoulKilledBy(uuid.New())
	record.ByAlly = true
	table, ok := monsterDropFor(record)
	require.True(t, ok)
	plain := min(table.Chance*floorFactor(record.Floor), 1)
	between := fixedRoll{at: plain * (1 + (BlessingDropFactor-1)/2)}

	s := dropSession()
	hirer := s.EntityManager.CreateEntity()
	hirer.AddComponent(components.NewPlayerComponent(record.KillerMemberID, "warrior", "Wren", false))
	systems.Bless(hirer)

	newMonsterDrops(s, between).ConsumeKill(record)
	assert.NotEmpty(t, dropPiles(s), "the blessed hirer's chance")
}
