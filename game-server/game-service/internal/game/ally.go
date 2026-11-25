package game

import (
	"errors"
	"fmt"
	"log/slog"
	"math"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/navigation"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/google/uuid"
)

/**
* Hired allies (FS-4EC7Z §C). An encounter NPC made an ally has a hirer, a
* delver by member id, and fights on the party's side: it follows, fights
* monsters through the one hit path with its kind's sheet, holds a plate and
* fires a trap (systems.BodyAlly), takes poison, and is hunted by monsters as
* any encounter NPC out of a cage is. Its kills give no experience and are its
* hirer's for loot (systems.KillRecord.ByAlly). It is a floor entity: a climb
* leaves it behind, gone with the floor (R12).
*
* makeAllies is the one way in: a freed cage (§D R13) and, later, a hire
* (§D R15) both call it.
**/

// The ally refusals' reasons, from which the client writes its own lines.
// FS-4EC7Z §F R27.
const (
	RefusalCageLocked    = "cage_locked"
	RefusalTooManyAllies = "too_many_allies"
)

var (
	// ErrTooManyAllies refuses a freeing or a hire that would take the party
	// past AllyCap allies, refused whole. FS-4EC7Z §C R10.
	ErrTooManyAllies = errors.New("the party would have too many allies")
	// ErrNotAllyKind refuses making an ally of an encounter NPC whose kind has
	// no ally sheet: a pilgrim.
	ErrNotAllyKind = errors.New("this kind of encounter NPC never becomes an ally")
)

/**
* makeAllies makes every one of group an ally of hirer (a member id), each
* with its kind's sheet at the floor's monster level, or none of them: a group
* that would take the floor's living allies past AllyCap is refused whole
* (ErrTooManyAllies), as is one holding a kind no sheet names. Its NPCs keep
* their health; each follows from where it stands. FS-4EC7Z §C R9-R10.
**/
func (s *Session) makeAllies(group []*ecs.Entity, hirer uuid.UUID) error {
	if s.livingAllies()+len(group) > AllyCap {
		return ErrTooManyAllies
	}
	for _, e := range group {
		nc, ok := e.GetComponent(ecs.ComponentTypeEncounterNPC)
		if !ok {
			return fmt.Errorf("make ally: entity %s is no encounter NPC", e.ID)
		}
		if _, ok := AllySheets[nc.(*components.EncounterNPCComponent).Kind]; !ok {
			return ErrNotAllyKind
		}
	}
	level := s.floorMonsterLevel()
	for _, e := range group {
		makeAlly(e, hirer, level)
	}
	slog.Debug("Allies made", "sessionID", s.ID, "hirer", hirer, "allies", len(group))
	return nil
}

// makeAlly turns npc into an ally of hirer with its kind's sheet at level:
// its stance and hirer, its fighting (an AllyComponent, a combat and its
// intents) and its pace. FS-4EC7Z §C R9.
func makeAlly(npc *ecs.Entity, hirer uuid.UUID, level int) {
	nc, _ := npc.GetComponent(ecs.ComponentTypeEncounterNPC)
	encounterNPC := nc.(*components.EncounterNPCComponent)
	sheet := AllySheets[encounterNPC.Kind]
	encounterNPC.Stance, encounterNPC.HirerID = components.StanceAlly, hirer
	encounterNPC.Action = components.EncounterActionIdle

	fodder := monsterSheets[standardFodder].statsAt(level)
	npc.AddComponent(&components.AllyComponent{AttackRange: sheet.AttackRange, AttackInterval: sheet.AttackInterval})
	npc.AddComponent(&components.CombatComponent{
		Attack:  max(int(math.Round(float64(fodder.Damage)*sheet.DamageFactor)), 1),
		Defense: int(math.Round(float64(fodder.Defense) * sheet.DefenseFactor)),
	})
	npc.AddComponent(components.NewAttackIntentComponent())
	if vc, ok := npc.GetComponent(ecs.ComponentTypeVelocity); ok {
		vc.(*components.VelocityComponent).Speed = sheet.MoveSpeed
	} else {
		npc.AddComponent(components.NewVelocityComponent(0, 0, sheet.MoveSpeed))
	}
}

// allyHealth is the health of an NPC of kind that will become an ally, at a
// floor's monster level: its sheet's factor of a standard fodder's.
func allyHealth(kind components.EncounterNPCKind, level int) int {
	return max(int(math.Round(float64(monsterSheets[standardFodder].statsAt(level).HP)*AllySheets[kind].HealthFactor)), 1)
}

// livingAllies is how many live allies stand on the floor: the party's, all
// of them, since a run's roster is its party (ADR-0035).
func (s *Session) livingAllies() int {
	n := 0
	for _, e := range s.EntityManager.GetAllEntities() {
		if systems.BodyKindOf(e) == systems.BodyAlly {
			n++
		}
	}
	return n
}

// allyAI is the floor's ally AI: on a dungeon floor it paths over the floor's
// grid, the monsters' own, its reach in the floor's cells; false on a floor
// with no cells, which holds no encounter.
func (s *Session) allyAI() (*systems.AllyAISystem, bool) {
	cell := s.dungeonCellSize()
	if cell <= 0 {
		return nil, false
	}
	reach := systems.AllyReach{
		Near:   AllyFollowNearCells * cell,
		Far:    AllyFollowFarCells * cell,
		Engage: AllyEngageCells * cell,
	}
	return systems.NewAllyAISystem(navGridOf(s.navGrid), reach), true
}

// navGridOf is grid as the systems read it, a nil interface for no grid.
func navGridOf(grid *navigation.Grid) systems.NavGrid {
	if grid == nil {
		return nil
	}
	return grid
}
