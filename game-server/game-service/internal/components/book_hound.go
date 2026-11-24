package components

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

// HoundAction is what a hound is doing, as every recipient is told it.
// FS-X2CMM §F R34.
type HoundAction string

const (
	HoundActionIdle HoundAction = "idle"
	HoundActionRun  HoundAction = "run"
	HoundActionBite HoundAction = "bite"
	// HoundActionDead is a hound at no health, on the one state it is sent
	// before it goes, leaving nothing.
	HoundActionDead HoundAction = "dead"
)

// HoundComponent is a hound's bite and heel, on the hound's own book effect
// entity beside its health and its walk. Its archer is the book effect's
// caster; what it bites with and how far it reaches are fixed at the call, in
// the cell of the floor it was called on. Never a delver and never a monster.
// FS-X2CMM §E R28–R29.
type HoundComponent struct {
	// OwnerMemberID is the archer's player id: whose kills its kills are,
	// and the owner the wire names.
	OwnerMemberID uuid.UUID
	// BitePower is a bite's physical power: 8 + 0.5 × the archer's level.
	BitePower float64
	// Reach is how near, in px, a monster must stand to be bitten; Sight how
	// near to be gone after; Heel how near it keeps to its archer.
	Reach, Sight, Heel float64
	// BiteIn is the seconds before it may bite again; BiteShow the seconds
	// left that its last bite shows.
	BiteIn, BiteShow float64
	// Action is what it is doing this tick.
	Action HoundAction
	// Route is its path over a dungeon floor's cells, as a monster's is.
	Route Route
}

func (h *HoundComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeHound
}
