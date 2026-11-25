package components

import "github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"

// What a page's timed book state keeps on its delver past its time left: each
// added by its page's resolver and taken off when its state ends, as a rune's
// catch and a hound's bite ride their own book effects. FS-X2CMM §E.

// LongNightComponent is the warrior's Long Night while it runs: Reach is how
// far, in px, it turns monsters, its 5 cells in the cell of the floor it was
// cast on. Its time left is the book's long night state. FS-X2CMM §E R31.
type LongNightComponent struct {
	Reach float64
}

func (n *LongNightComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeLongNight
}

// DraughtHealComponent is a drunk draught's heal over time on its drinker:
// Amount the whole health it gives, fixed at the drink, and Given what it has
// given so far. Its time left is the book's draught state. FS-X2CMM §E R27.
type DraughtHealComponent struct {
	Amount int
	Given  int
}

func (d *DraughtHealComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeDraughtHeal
}
