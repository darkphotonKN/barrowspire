package components

import "github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"

type CombatComponent struct {
	Attack      int
	Defense     int
	AttackSpeed float64
	AttackRange int
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
