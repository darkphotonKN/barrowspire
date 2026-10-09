package game

import "github.com/darkphotonKN/barrowspire-server/common/progression"

// seatLevel is the level a character is seated at: its own, held to 1..cap.
func seatLevel(level int) int {
	return min(max(level, 1), int(progression.MaxLevel))
}

// classAtLevel is a class's body at a level: the class preset plus
// (level − 1) × its growth, at full HP and MP. FS-BDA7X §Requirements 18–19.
func classAtLevel(class ClassConfig, level int) ClassConfig {
	gained := seatLevel(level) - 1
	g := class.Growth

	class.Stats.Strength += gained * g.Strength
	class.Stats.Agility += gained * g.Agility
	class.Stats.Intelligence += gained * g.Intelligence
	class.Stats.Vitality += gained * g.Vitality

	class.Health.MaxHealth += gained * g.MaxHealth
	class.Health.CurrentHealth = class.Health.MaxHealth
	class.Mana.MaxMana += gained * g.MaxMana
	class.Mana.CurrentMana = class.Mana.MaxMana

	return class
}
