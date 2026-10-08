package components

import "github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"

// StairsComponent marks the way up to the next floor. Every floor but the top
// has one; interacting with it moves the whole party up once everyone still in
// the fight has gathered there. FS-F6F88 §Requirements 6, 17–22.
type StairsComponent struct{}

func (s *StairsComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeStairs
}

func NewStairsComponent() *StairsComponent {
	return &StairsComponent{}
}
