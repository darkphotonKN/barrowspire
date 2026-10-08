package components

import "github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"

// BurningTrailComponent is the burning trail an Ashwalk Greaves wearer's dash
// leaves along the path dashed. It is a floor entity: it has no place of its
// own and no Player component, so a floor change clears it. The CombatSystem
// pulses it and removes it when it burns out. FS-4R9M9 §Requirements 36.
type BurningTrailComponent struct {
	// Attack is the wearer's magic hit as the trail was laid: every pulse lands
	// it, and every kill it makes is theirs.
	Attack AttackSnapshot
	// FromX, FromY to ToX, ToY is the path dashed; HalfWidth is how far either
	// side of it the trail reaches.
	FromX, FromY float64
	ToX, ToY     float64
	HalfWidth    float64
	// Remaining is the seconds it still burns; UntilPulse the seconds until it
	// next hits.
	Remaining  float64
	UntilPulse float64
}

func (b *BurningTrailComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeBurningTrail
}
