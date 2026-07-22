package components

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

type PlayerComponent struct {
	MemberID             uuid.UUID
	Class                string
	Username             string
	HasHit               bool
	AttackActive         bool
	AttackCooldown       float64
	AttackTargetEntityID uuid.UUID
	Escape               bool
}

func (p *PlayerComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypePlayer
}

func NewPlayerComponent(memberID uuid.UUID, className string, username string, hasHit, attackActive bool, escape bool) *PlayerComponent {
	return &PlayerComponent{MemberID: memberID, Class: className, Username: username, HasHit: hasHit, AttackActive: attackActive, Escape: escape}
}
