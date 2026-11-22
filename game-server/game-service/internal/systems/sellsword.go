package systems

import (
	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

// The Sellsword's numbers (FS-E1ZDG §J R34–R35). Decided.
const (
	// sellswordParryCharges is a Sellsword's parry-charge max.
	sellswordParryCharges = 5
	// sellswordChargePercent is what each charge held adds as a cast
	// resolves: that percent of the cut's raw damage, and of attack speed.
	sellswordChargePercent = 5.0
)

// ApplySellswordPool makes a Sellsword's parry-charge max 5, the count where
// it is: at seating, and at the pick (FS-E1ZDG §J R34). Any other body is
// left alone.
func ApplySellswordPool(entity *ecs.Entity) {
	if Specialization(entity) != passivetree.Sellsword {
		return
	}
	if rc, ok := entity.GetComponent(ecs.ComponentTypeResource); ok {
		if pool := rc.(*components.ResourceComponent); pool.Kind == components.ResourceParryCharges {
			pool.Max = sellswordParryCharges
		}
	}
}

// sellswordStacks is the parry charges a Sellsword holds as a cast resolves,
// before its cost is spent: each one a stack, so anything that spends or
// loses charges drops them (FS-E1ZDG §J R35–R36). 0 for any other body.
func sellswordStacks(caster *ecs.Entity, pool *components.ResourceComponent) int {
	if pool == nil || pool.Kind != components.ResourceParryCharges || Specialization(caster) != passivetree.Sellsword {
		return 0
	}
	return pool.Current
}

// withSellswordStacks is the attack row as stacks raise it: a cut's
// coefficient, so its raw damage before crit and mitigation, 5% higher a
// stack. Any other attack is left alone. The row itself is never written.
func withSellswordStacks(spec attackSpec, stacks int) attackSpec {
	if spec.kind == components.AttackCut {
		spec.coefficient *= 1 + sellswordChargePercent*float64(stacks)/100
	}
	return spec
}

// sellswordAttackSpeedPercent is the attack speed stacks add, 5% a stack, on
// top of worn attack speed after its cap.
func sellswordAttackSpeedPercent(stacks int) float64 {
	return sellswordChargePercent * float64(stacks)
}
