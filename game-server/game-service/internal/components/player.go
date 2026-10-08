package components

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

type PlayerComponent struct {
	MemberID uuid.UUID
	// CharacterID is the character in play this delver is seated as: who a
	// run's experience is reported for. FS-BDA7X §Requirements 7, 22.
	CharacterID uuid.UUID
	Class       string
	Username    string
	Escape      bool
	// LeftBehind marks a dead delver whose body stayed on a floor the party has
	// since climbed away from. Their record persists for run-end accounting, but
	// they are no longer present on the current floor. FS-F6F88 §Requirements 15.
	LeftBehind bool
}

func (p *PlayerComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypePlayer
}

func NewPlayerComponent(memberID uuid.UUID, className string, username string, escape bool) *PlayerComponent {
	return &PlayerComponent{MemberID: memberID, Class: className, Username: username, Escape: escape}
}
