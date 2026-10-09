package systems

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

type RulesSystem struct{}

/**
* This system is in charge of observing the game state to move the
* game towards the "game over" state.
**/
func NewRulesSystem() *RulesSystem {
	return &RulesSystem{}
}

// NOTE: this runs every game tick
//
// Update applies the co-op end rule: a run ends when every delver on its roster
// has resolved, by escaping, dying, or being removed by disconnect cleanup
// (FS-77AB6 §Requirements 15). A delver mid-reconnect still has a body in the
// world and is still in play. The rule is monotonic, so the end is latched on
// the run-level entity and signalled exactly once (§Requirements 16). A world
// with no run-level entity, the hub, never ends.
func (s *RulesSystem) Update(deltaTime float64, entities []*ecs.Entity, endSessionCh chan bool) {
	var matchProgress *components.MatchProgressComponent
	for _, entity := range entities {
		if mc, ok := entity.GetComponent(ecs.ComponentTypeMatchProgress); ok {
			matchProgress = mc.(*components.MatchProgressComponent)
			break
		}
	}

	if matchProgress == nil || matchProgress.Ended {
		return
	}

	inPlay := 0
	for _, entity := range entities {
		pc, isPlayer := entity.GetComponent(ecs.ComponentTypePlayer)
		if !isPlayer {
			continue
		}
		player := pc.(*components.PlayerComponent)
		matchProgress.Roster[player.MemberID] = true

		if hc, ok := entity.GetComponent(ecs.ComponentTypeHealth); ok && hc.(*components.HealthComponent).IsEliminated {
			if _, recorded := matchProgress.DeadPlayers[player.MemberID]; !recorded {
				matchProgress.DeadPlayers[player.MemberID] = player
			}
		}

		if InPlay(entity) {
			inPlay++
		}
	}

	// a run still being built has nobody on it yet: that is not a resolved party
	if len(matchProgress.Roster) == 0 || inPlay > 0 {
		return
	}

	matchProgress.Ended = true
	endSessionCh <- true
}

// InPlay reports whether a delver is still in the run's play: alive, not escaped
// and not left behind on a floor below. A resolved delver stays in the world,
// receiving state, but cannot act, be targeted or be damaged (FS-77AB6
// §Requirements 17). Anything that is not a delver is never in play.
func InPlay(entity *ecs.Entity) bool {
	pc, isPlayer := entity.GetComponent(ecs.ComponentTypePlayer)
	if !isPlayer {
		return false
	}
	player := pc.(*components.PlayerComponent)
	if player.Escape || player.LeftBehind {
		return false
	}

	hc, ok := entity.GetComponent(ecs.ComponentTypeHealth)
	if !ok {
		return false
	}
	health := hc.(*components.HealthComponent)

	return health.CurrentHealth > 0 && !health.IsEliminated
}
