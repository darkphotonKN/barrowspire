package game

import (
	"github.com/darkphotonKN/barrowspire-server/common/progression"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
)

// seatLevel is the level a character is seated at: its own, held to 1..cap.
func seatLevel(level int) int {
	return min(max(level, 1), int(progression.MaxLevel))
}

// classAtLevel is a class's body at a level: the class preset plus
// (level − 1) × its growth, at full HP and a full class resource; parry charges
// are seated at 0. Only a mana pool grows with level. FS-BDA7X §Requirements
// 18–19; FS-8AY7S §Requirements 4, 15.
func classAtLevel(class ClassConfig, level int) ClassConfig {
	gained := seatLevel(level) - 1
	g := class.Growth

	class.Stats.Strength += gained * g.Strength
	class.Stats.Agility += gained * g.Agility
	class.Stats.Intelligence += gained * g.Intelligence
	class.Stats.Vitality += gained * g.Vitality

	class.Health.MaxHealth += gained * g.MaxHealth
	class.Health.CurrentHealth = class.Health.MaxHealth
	if growsWithLevel(class.Resource.Kind) {
		class.Resource.Max += gained * g.MaxMana
	}
	class.Resource.Current = class.Resource.Max
	if class.Resource.Kind == components.ResourceParryCharges {
		class.Resource.Current = 0
	}

	return class
}

// growsWithLevel reports whether a class resource of this kind takes the class
// growth's MaxMana: mana does; stamina and parry charges never grow with level.
// FS-8AY7S §Requirements 15.
func growsWithLevel(kind components.ResourceKind) bool {
	return kind == components.ResourceMana
}
