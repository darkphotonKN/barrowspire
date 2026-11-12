package components

import "github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"

// AttackSlowComponent is a player's attack slow: the window after one of their
// casts resolves in which the MovementSystem walks them at a fraction of their
// move speed. The CombatSystem starts (or restarts) it and runs it down; it is
// gone once the window is over. Never on the wire. FS-JS7C8 §C R15–R19.
type AttackSlowComponent struct {
	// Remaining is the seconds left on the window.
	Remaining float64
}

func (a *AttackSlowComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeAttackSlow
}
