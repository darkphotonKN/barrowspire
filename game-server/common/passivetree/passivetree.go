// Package passivetree is the single passive tree definition (FS-8RZ51 R1),
// shared by character-service (which saves a spend) and game-service (which
// offers it and applies the bonuses), so the rule that allows a spend is the
// rule that saves it. Tune a value by editing this package only.
package passivetree

import "github.com/darkphotonKN/barrowspire-server/common/progression"

// Earned is the passive points a character of level has earned: one per
// level-up from 2 to 19 and two at level 20 (FS-8RZ51 R4). Levels outside
// 1..MaxLevel clamp to the nearest bound.
func Earned(level int32) int {
	switch {
	case level <= 1:
		return 0
	case level >= progression.MaxLevel:
		return int(progression.MaxLevel)
	default:
		return int(level - 1)
	}
}
