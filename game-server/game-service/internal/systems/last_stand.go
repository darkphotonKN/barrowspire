package systems

import (
	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

// lastStand saves a Guardian from a hit of damage that would take them to 0,
// once per floor (FS-E1ZDG §C R11-13): they are left at 1 HP with their
// stamina at its max, and the Last Stand is spent until the party moves up a
// floor. Any hit counts, a boss's included; a fall is no hit and never comes
// here. False, with nothing written, for a hit that leaves the target
// standing, a Last Stand already spent, or any body but a Guardian's.
func lastStand(target *ecs.Entity, health *components.HealthComponent, damage int) bool {
	standing := health.CurrentHealth-damage > 0
	if standing || target.HasComponent(ecs.ComponentTypeLastStandSpent) || Specialization(target) != passivetree.Guardian {
		return false
	}
	health.CurrentHealth = 1
	if rc, ok := target.GetComponent(ecs.ComponentTypeResource); ok {
		pool := rc.(*components.ResourceComponent)
		pool.Current = pool.Max
	}
	target.AddComponent(&components.LastStandSpentComponent{})
	return true
}
