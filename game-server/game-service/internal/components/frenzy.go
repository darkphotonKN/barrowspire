package components

import "github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"

// FrenzyComponent is a delver's kill_frenzy stacks (Wightfang): one per kill,
// up to a cap, all expiring together when Remaining runs out. The stacks are
// kept while the unique is unworn; they only count while it is worn.
// FS-4R9M9 §Requirements 32; §Edge States "Unequip during a frenzy".
type FrenzyComponent struct {
	Stacks int
	// Remaining is seconds until the stacks expire, reset by every kill.
	Remaining float64
}

func (f *FrenzyComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeFrenzy
}
