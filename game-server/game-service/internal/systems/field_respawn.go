package systems

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

// riseSlack absorbs the float drift of counting a wait down a tick at a time,
// so a wait of N ticks ends on the Nth.
const riseSlack = 1e-9

/**
* FieldRespawnSystem is a field's costless death (FS-X2F2H §Requirements
* 22–23): a fallen player lies where they fell for the delay, then stands at
* the field's arrival point, at full health and a full class resource, in play
* again (a mercenary's parry charges stay at the 0 death left them: FS-MAMHR
* §Requirements 21, 22).
* Nothing else on the body changes: what they wear and carry stays theirs.
*
* The wait starts on the tick the player falls (the EliminationSystem marks
* them, earlier on the same tick) and is counted down by the tick's own
* deltaTime, so a test steps it with the clock it chooses.
**/
type FieldRespawnSystem struct {
	arrivalX, arrivalY float64
	delay              float64 // s
}

func NewFieldRespawnSystem(arrivalX, arrivalY, delay float64) *FieldRespawnSystem {
	return &FieldRespawnSystem{arrivalX: arrivalX, arrivalY: arrivalY, delay: delay}
}

func (s *FieldRespawnSystem) Update(deltaTime float64, entities []*ecs.Entity) {
	for _, entity := range entities {
		if !entity.HasComponent(ecs.ComponentTypePlayer) {
			continue
		}
		hc, ok := entity.GetComponent(ecs.ComponentTypeHealth)
		if !ok || !hc.(*components.HealthComponent).IsEliminated {
			continue
		}

		rc, waiting := entity.GetComponent(ecs.ComponentTypeRespawn)
		if !waiting {
			entity.AddComponent(&components.RespawnComponent{Remaining: s.delay})
			continue
		}

		respawn := rc.(*components.RespawnComponent)
		respawn.Remaining -= deltaTime
		if respawn.Remaining > riseSlack {
			continue
		}

		s.rise(entity, hc.(*components.HealthComponent))
	}
}

// rise stands the body at the arrival point at full health and a full class
// resource; parry charges are never refilled, only earned. Each
// component is replaced, never written in place, so a reader beside the tick
// (the leave check) sees the body fallen or risen, never half of each.
func (s *FieldRespawnSystem) rise(entity *ecs.Entity, fallen *components.HealthComponent) {
	health := *fallen
	health.CurrentHealth = health.MaxHealth
	health.IsEliminated = false
	entity.AddComponent(&health)

	if rc, ok := entity.GetComponent(ecs.ComponentTypeResource); ok {
		pool := *rc.(*components.ResourceComponent)
		if pool.Kind != components.ResourceParryCharges {
			pool.Current, pool.Accrued = pool.Max, 0
		}
		entity.AddComponent(&pool)
	}

	entity.AddComponent(components.NewTransformComponent(s.arrivalX, s.arrivalY))
	if vc, ok := entity.GetComponent(ecs.ComponentTypeVelocity); ok {
		velocity := vc.(*components.VelocityComponent)
		velocity.VX, velocity.VY = 0, 0
	}

	entity.RemoveComponent(ecs.ComponentTypeRespawn)
}
