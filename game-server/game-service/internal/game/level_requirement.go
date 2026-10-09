package game

import "fmt"

// canWear reports whether a character at level may equip an item that requires
// requiredLevel. An unset requirement (0) is level 1. This is the only place
// the rule lives: seating (R31) and in-run equip (R32) both ask it, and
// FS-4R9M9 changes only where an item's required level comes from, never this.
// FS-BDA7X §Requirements 30–34.
func canWear(requiredLevel, level int) bool {
	return max(requiredLevel, 1) <= level
}

// requiredLevelMessage is what a player refused an equip is told.
func requiredLevelMessage(requiredLevel int) string {
	return fmt.Sprintf("This item requires level %d.", max(requiredLevel, 1))
}
