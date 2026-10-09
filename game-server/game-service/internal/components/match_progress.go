package components

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

type MatchProgressComponent struct {
	// Roster is every delver who has been on the run, by member id. It is the
	// run's actual party, which the co-op end rule counts against (FS-77AB6
	// §Requirements 15); a delver removed by disconnect cleanup stays on it.
	Roster map[uuid.UUID]bool

	// players that are dead [uuid]*ecs.Entity (Player)
	DeadPlayers map[uuid.UUID]ecs.Component

	// Ended latches the run's end once it has been signalled, so it is signalled
	// exactly once (FS-QG1HR D5, FS-77AB6 §Requirements 16).
	Ended bool
}

func (p *MatchProgressComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeMatchProgress
}

func NewMatchProgressComponent() *MatchProgressComponent {
	return &MatchProgressComponent{
		Roster:      make(map[uuid.UUID]bool),
		DeadPlayers: make(map[uuid.UUID]ecs.Component),
	}
}
