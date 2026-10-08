package components

import "github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"

type CombatComponent struct {
	Attack  int
	Defense int
	// MagicResistance mitigates magic hits as Defense does physical ones. A
	// delver's comes from worn armor alone, so theirs stays 0; a monster's comes
	// from its stat sheet. FS-77AB6 §Requirements 19.
	MagicResistance int
	AttackSpeed     float64
	AttackRange     int
}

func (s *CombatComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeCombat
}

func NewCombatComponent(attack, defense, AttackRange int, AttackSpeed float64) *CombatComponent {
	return &CombatComponent{
		Attack:      attack,
		Defense:     defense,
		AttackSpeed: AttackSpeed,
		AttackRange: AttackRange,
	}
}
