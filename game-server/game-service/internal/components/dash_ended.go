package components

import "github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"

// DashEndedComponent marks a warrior holding Bull Rush's rule whose charge has
// just ended: their first hit while it lasts is a forced crit, and takes it.
// The CombatSystem lays it as a charge ends and runs it down. Never on the
// wire. FS-8RZ51 §F R29.
type DashEndedComponent struct {
	// Remaining is the seconds left for that hit to land.
	Remaining float64
}

func (d *DashEndedComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeDashEnded
}
