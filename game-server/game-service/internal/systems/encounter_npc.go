package systems

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

/*
EncounterNPCSystem keeps a floor's encounter NPCs' clocks and their dead
(FS-4EC7Z §A R3), run after the combat in a run's tick: every one's Age counts
the tick, the clock its lines are said by; one the combat took to 0 lies dead
from that tick, stops colliding (its Velocity goes, as a monster's corpse's
does) and is removed once its corpse has lain corpseLifetime. It gives no
experience and drops nothing: no kill record is ever made for one.
*/
type EncounterNPCSystem struct {
	em             *ecs.EntityManager
	corpseLifetime float64
}

func NewEncounterNPCSystem(em *ecs.EntityManager, corpseLifetime float64) *EncounterNPCSystem {
	return &EncounterNPCSystem{em: em, corpseLifetime: corpseLifetime}
}

// Update counts the tick on every encounter NPC and settles its dead.
func (s *EncounterNPCSystem) Update(dt float64, entities []*ecs.Entity) {
	var expired []uuid.UUID
	for _, e := range entities {
		nc, ok := e.GetComponent(ecs.ComponentTypeEncounterNPC)
		if !ok {
			continue
		}
		npc := nc.(*components.EncounterNPCComponent)
		npc.Age += dt
		if alive(e) {
			continue
		}
		if npc.Action != components.EncounterActionDead {
			npc.Action = components.EncounterActionDead
			npc.CorpseRemaining = s.corpseLifetime
			e.RemoveComponent(ecs.ComponentTypeVelocity)
			continue
		}
		npc.CorpseRemaining -= dt
		if npc.CorpseRemaining <= 0 {
			expired = append(expired, e.ID)
		}
	}
	for _, id := range expired {
		s.em.RemoveEntity(id)
	}
}

// Say has npc say line now, on its own clock: the client shows it once per
// LineAt (FS-4EC7Z §F R22, R26).
func Say(npc *components.EncounterNPCComponent, line components.EncounterLine) {
	npc.Line, npc.LineAt = line, npc.Age
}

// hirerOf is the member id of entity's hirer when it is a hired ally,
// uuid.Nil for anything else (FS-4EC7Z §C R9).
func hirerOf(entity *ecs.Entity) uuid.UUID {
	nc, ok := entity.GetComponent(ecs.ComponentTypeEncounterNPC)
	if !ok {
		return uuid.Nil
	}
	if npc := nc.(*components.EncounterNPCComponent); npc.Stance == components.StanceAlly {
		return npc.HirerID
	}
	return uuid.Nil
}
