package components

import "github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"

type StatsComponent struct {
	Level        int
	Experience   int
	Strength     int
	Agility      int
	Intelligence int
	Vitality     int
	Kills        int
	Deaths       int
	Position     int
}

func (s *StatsComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeStats
}

func NewStatsComponent(strength, agility, vitality, intelligence int) *StatsComponent {
	return &StatsComponent{
		Level:        1,
		Experience:   0,
		Strength:     strength,
		Agility:      agility,
		Intelligence: intelligence,
		Vitality:     vitality,
		Kills:        0,
		Deaths:       0,
		Position:     0,
	}
}
