package game

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/google/uuid"
)

/**
* fieldKillCredit is a field world's experience consumer: a kill's XP goes to
* the killing blow alone, never shared (FS-X2F2H §Requirements 30, D12). It
* stands where a run's KillExperience stands; the run's party-wide award is
* unchanged.
**/
type fieldKillCredit struct {
	s *Session
}

func newFieldKillCredit(s *Session) *fieldKillCredit {
	return &fieldKillCredit{s: s}
}

// ConsumeKill gives the kill's experience, at the Spire's formula, to the
// killer. A kill with no player killer earns nothing.
func (c *fieldKillCredit) ConsumeKill(record systems.KillRecord) {
	if record.KillerMemberID == uuid.Nil {
		return
	}
	amount := killExperience(record)
	if amount <= 0 {
		return
	}

	c.s.creditKill(record.KillerMemberID, amount)
}

/**
* creditKill gives the member's body here the experience, alive or fallen, and
* levels it on the spot, and tallies it on their open visit. A member with no
* body here (they left, and a projectile of theirs landed after) earns nothing.
*
* Under the world's lock: whichever way out ends the visit takes the body and
* the visit together (endVisitLocked), so a kill either lands in the visit it
* was made in or finds nobody, never a later visit.
**/
func (s *Session) creditKill(memberID uuid.UUID, amount int) {
	s.mu.Lock()
	defer s.mu.Unlock()

	entityID, here := s.playerIDToEntitiesID[memberID]
	if !here {
		return
	}
	body, ok := s.EntityManager.GetEntity(entityID)
	if !ok {
		return
	}
	pc, ok := body.GetComponent(ecs.ComponentTypePlayer)
	if !ok {
		return
	}

	gainExperience(body, Classes[pc.(*components.PlayerComponent).Class].Growth, amount)

	if visit, open := s.visits[memberID]; open {
		visit.ExperienceGained += amount
		s.visits[memberID] = visit
	}
}
