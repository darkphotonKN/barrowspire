package components

import "github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"

// AttackPinComponent is a player's attack pin: the window after one of their
// attacking casts resolves in which the MovementSystem does not walk them and
// the CombatSystem refuses their casts, the parry excepted. The CombatSystem
// starts it and runs it down; it is gone once the window is over. Never on the
// wire. FS-JS7C8 §Change: Attacking pins the attacker R49–R59.
type AttackPinComponent struct {
	// Remaining is the seconds left on the window.
	Remaining float64
}

func (a *AttackPinComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeAttackPin
}
