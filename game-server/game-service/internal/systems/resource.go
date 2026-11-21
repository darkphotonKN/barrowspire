package systems

import (
	"math"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

/*
ResourceSystem regenerates class resources. FS-8AY7S §Requirements 5–6.

Each tick, a delver in play gains regen per second × tick seconds of their
pool, stopping at max. The gain accrues in sub-units so no fraction is lost:
at 30 Hz, 20/s is exactly 2/3 of a point a tick and reads 20 after 30 ticks.
A pool with no regen never changes on its own; a delver out of play (dead,
escaped, left behind) gains nothing.
*/
type ResourceSystem struct{}

func NewResourceSystem() *ResourceSystem {
	return &ResourceSystem{}
}

func (s *ResourceSystem) Update(deltaTime float64, entities []*ecs.Entity) {
	for _, entity := range entities {
		rc, ok := entity.GetComponent(ecs.ComponentTypeResource)
		if !ok || !InPlay(entity) {
			continue
		}
		regenerate(rc.(*components.ResourceComponent), passiveBonus(entity).RegenPercent, deltaTime)
	}
}

// regenerate gains the pool its regen for deltaTime, its base raised by
// bonusPercent of itself (the passive tree's, FS-8RZ51 R26), accrued in
// sub-units so a bonus below a whole point is never rounded away.
func regenerate(pool *components.ResourceComponent, bonusPercent, deltaTime float64) {
	if pool.RegenPerSecond <= 0 {
		return
	}
	if pool.Current < pool.Max {
		perSecond := float64(pool.RegenPerSecond) * (1 + bonusPercent/100)
		// rounded to the nearest sub-unit: exact whenever the tick divides it
		pool.Accrued += int(math.Round(perSecond * deltaTime * components.ResourceSubUnitsPerPoint))
		pool.Current += pool.Accrued / components.ResourceSubUnitsPerPoint
		pool.Accrued %= components.ResourceSubUnitsPerPoint
	}
	if pool.Current >= pool.Max {
		pool.Current, pool.Accrued = pool.Max, 0
	}
}
