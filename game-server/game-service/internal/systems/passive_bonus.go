package systems

import (
	"math"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
)

/*
	The passive tree's effect on the body. FS-8RZ51 §F R24–R28, ADR-0082.

	ApplyPassiveBonus is the one apply path: every seating builds the body's
	PassiveBonusComponent from the ranks it holds, and a spend in town
	rebuilds the HUB world body's. Nothing else writes it. The GearSystem sums
	its attributes and speeds into the gear bonus, inside gear's caps, and the
	ResourceSystem reads its regen, so every reader of gear's bonus reads the
	tree's with it (R25).

	sumPassives is the one place a node's per-rank value becomes a stat, and
	a kicker node at its last rank becomes a held rule (R29), which the
	CombatSystem's kickers read (kickers.go). A stat it has no row for adds
	nothing until its slice gives it one; a node with no per-rank value (the
	ability and specialization nodes, R30, R31) adds nothing at all.
*/

// ApplyPassiveBonus builds the body's passive bonus from the ranks it holds and
// moves its maxima by the change. The first call, at seating, takes the body's
// max HP then (own: class base plus level growth, no gear) as the basis of a
// percent of max HP; later calls keep that basis, so a level-up since does not
// recompute it (R26). A max that rose raises its current by the same amount,
// so a full bar stays full (R27); a body at 0 is never raised. The Berserker's
// price, taken off the max once at seating or at the pick, clamps its current
// instead (FS-E1ZDG §D R15, R17). The component is replaced, never written.
func ApplyPassiveBonus(entity *ecs.Entity) {
	pc, ok := entity.GetComponent(ecs.ComponentTypePlayer)
	if !ok {
		return
	}
	class := pc.(*components.PlayerComponent).Class

	var health *components.HealthComponent
	if hc, ok := entity.GetComponent(ecs.ComponentTypeHealth); ok {
		health = hc.(*components.HealthComponent)
	}
	var pool *components.ResourceComponent
	var kind components.ResourceKind
	if rc, ok := entity.GetComponent(ecs.ComponentTypeResource); ok {
		pool = rc.(*components.ResourceComponent)
		kind = pool.Kind
	}

	// no bonus yet: this is the seating
	applied, built := passiveBonusOf(entity)
	own := applied.OwnMaxHealth
	if !built && health != nil {
		own = health.MaxHealth
	}

	next := sumPassives(class, PassiveRanks(entity), own, kind)
	next.OwnMaxHealth = own
	if health != nil {
		health.MaxHealth, health.CurrentHealth = raiseMaximum(health.MaxHealth, health.CurrentHealth, next.MaxHealth-applied.AppliedMaxHealth)
		health.MaxHealth, health.CurrentHealth = lowerMaximum(health.MaxHealth, health.CurrentHealth, next.MaxHealthTaken-applied.MaxHealthTaken)
	}
	next.AppliedMaxHealth = next.MaxHealth
	if pool != nil {
		pool.Max, pool.Current = raiseMaximum(pool.Max, pool.Current, next.MaxResource-applied.AppliedMaxResource)
	}
	next.AppliedMaxResource = next.MaxResource

	entity.AddComponent(&next)
}

// raiseMaximum moves a maximum by delta and its current with it, never raising
// one at 0 and never leaving 0..maximum.
func raiseMaximum(maximum, current, delta int) (int, int) {
	maximum += delta
	if current > 0 {
		current += delta
	}
	return maximum, max(min(current, maximum), 0)
}

// lowerMaximum lowers a maximum by taken and clamps its current to it: the
// Berserker's price, which leaves a full bar full at seating and a bar below
// the new max where it is at the pick (FS-E1ZDG §D R15, R17).
func lowerMaximum(maximum, current, taken int) (int, int) {
	maximum -= taken
	return maximum, max(min(current, maximum), 0)
}

// passiveBonus is the body's passive bonus; zero for a body seated with none
// or an entity that is no body.
func passiveBonus(entity *ecs.Entity) components.PassiveBonusComponent {
	bonus, _ := passiveBonusOf(entity)
	return bonus
}

func passiveBonusOf(entity *ecs.Entity) (components.PassiveBonusComponent, bool) {
	pc, ok := entity.GetComponent(ecs.ComponentTypePassiveBonus)
	if !ok {
		return components.PassiveBonusComponent{}, false
	}
	return *pc.(*components.PassiveBonusComponent), true
}

// sumPassives is what ranks of class's tree add to a body whose own max HP is
// ownMaxHealth and whose class resource is pool: each held node's per-rank
// value times its rank. A rank of another class's node, or above a node's max,
// counts for nothing more. Each stat reads in the unit the tree gives it.
func sumPassives(class string, ranks passivetree.Ranks, ownMaxHealth int, pool components.ResourceKind) components.PassiveBonusComponent {
	var bonus components.PassiveBonusComponent
	var maxHealthPercent float64
	for _, node := range passivetree.Nodes(class) {
		rank := min(ranks[node.ID], node.MaxRank)
		if node.PerRank == nil || rank <= 0 {
			continue
		}
		amount := node.PerRank.Amount * float64(rank)
		switch node.PerRank.Stat {
		case passivetree.StatMaxHP:
			maxHealthPercent += amount
		case passivetree.StatStrength:
			bonus.Strength += whole(amount)
		case passivetree.StatAgility:
			bonus.Agility += whole(amount)
		case passivetree.StatIntelligence:
			bonus.Intelligence += whole(amount)
		case passivetree.StatAttackSpeed:
			bonus.AttackSpeedPercent += whole(amount)
		case passivetree.StatMoveSpeed:
			bonus.MoveSpeedPercent += whole(amount)
		case passivetree.StatCrit:
			bonus.CritPoints += whole(amount)
		case passivetree.StatParryWindow:
			bonus.ParryWindowSeconds += amount
		case passivetree.StatMaxStamina:
			if pool == components.ResourceStamina {
				bonus.MaxResource += whole(amount)
			}
		case passivetree.StatMaxMana:
			if pool == components.ResourceMana {
				bonus.MaxResource += whole(amount)
			}
		case passivetree.StatStaminaRegen:
			if pool == components.ResourceStamina {
				bonus.RegenPercent += amount
			}
		case passivetree.StatManaRegen:
			if pool == components.ResourceMana {
				bonus.RegenPercent += amount
			}
		case passivetree.StatSlashDamage:
			addTo(&bonus.CoefficientPercent, components.AttackSlash, amount)
		case passivetree.StatFireballDamage:
			// the left-click fireball only (R29)
			addTo(&bonus.CoefficientPercent, components.AttackFireball, amount)
		case passivetree.StatCutDamage:
			// the cut only, not the riposte it arms into (R29)
			addTo(&bonus.CoefficientPercent, components.AttackCut, amount)
		case passivetree.StatRiposteDamage:
			addTo(&bonus.CoefficientPercent, components.AttackRiposte, amount)
		case passivetree.StatCutCooldown:
			// the cut's row only, not the riposte resolving in its slot (R29)
			addTo(&bonus.CooldownPercent, components.AttackCut, amount)
		case passivetree.StatDashCost:
			addTo(&bonus.CostChange, components.AttackDash, whole(amount))
		case passivetree.StatTripleFireballCost:
			addTo(&bonus.CostChange, components.AttackTripleFireball, whole(amount))
		case passivetree.StatFireballSpeed:
			// both fireball kinds (R29)
			addTo(&bonus.ProjectileSpeedPercent, components.AttackFireball, amount)
			addTo(&bonus.ProjectileSpeedPercent, components.AttackTripleFireball, amount)
		}
		if node.Kicker != "" && rank >= node.MaxRank {
			if bonus.Kickers == nil {
				bonus.Kickers = make(map[passivetree.Kicker]bool)
			}
			bonus.Kickers[node.Kicker] = true
		}
	}
	if bonus.Kickers[passivetree.KickerDeepWellRegen] && pool == components.ResourceMana {
		bonus.RegenPercent += deepWellRegenPercent
	}
	// one rounding over the summed percent, to the nearest whole point (R26)
	bonus.MaxHealth = whole(float64(ownMaxHealth) * maxHealthPercent / 100)
	spec, _ := passivetree.SpecializationOf(class, ranks)
	withBloodPrice(&bonus, spec, ownMaxHealth)
	return bonus
}

func whole(amount float64) int {
	return int(math.Round(amount))
}

// addTo adds value to what key holds in *m, making the map on first use.
func addTo[K comparable, V int | float64](m *map[K]V, key K, value V) {
	if *m == nil {
		*m = make(map[K]V)
	}
	(*m)[key] += value
}
