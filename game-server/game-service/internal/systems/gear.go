package systems

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
)

/*
	GearSystem makes what a delver wears count. FS-4R9M9 §Requirements 39–43.

	Every tick, in every world, it sums the affixes of the items in a delver's
	weapon, armor and ring slots into their GearBonusComponent, which the
	CombatSystem reads beside the character's own stats. A unique's fixed
	affixes (tier 0) count like any other. The two bonuses that live on other
	components are applied here: the maxima of health and mana, by the change in
	the bonus so level-up growth on the same maxima is kept, and movement speed.

	Vitality, the character's own and the gear's, is max HP: each point adds
	HealthPerVitality to the health bonus, so it follows the same rules as gear
	max HP: gaining it never heals, losing it clamps (user decision 2026-10-09).

	Worn uniques' passive effects are summed here too, each once however many
	copies are worn (R29): kill_frenzy's stacks inside the attack speed cap
	(R32) and floor_attributes (R37). The frenzy timer runs down here.
*/

// GearCaps are the ceilings on summed percentages, in whole percent.
type GearCaps struct {
	AttackSpeedPercent int
	MoveSpeedPercent   int
}

// UniqueEffectTuning is how strong the worn uniques' effects are: the passive
// ones the GearSystem sums and the combat ones the CombatSystem resolves.
type UniqueEffectTuning struct {
	// FrenzyAttackSpeedPercent is each kill_frenzy stack's attack speed.
	FrenzyAttackSpeedPercent int
	// ReflectPercent is the share of a monster's strike melee_reflect returns.
	ReflectPercent int
	// PierceExtraTargets is how many more distinct targets a pierce wearer's
	// projectiles can hit after their first.
	PierceExtraTargets int
	// BurningTrail is burning_dash's trail.
	BurningTrail BurningTrailTuning
}

// BurningTrailTuning is burning_dash's trail: how long it burns, how often it
// pulses, how far either side of the dashed path it reaches, and the power its
// magic hit adds the wearer's level to.
type BurningTrailTuning struct {
	Seconds      float64
	PulseSeconds float64
	HalfWidth    float64
	BasePower    int
}

// AttributeTuning is what an attribute point is worth where it is not read
// directly by a formula.
type AttributeTuning struct {
	// HealthPerVitality is the max HP each point of Vitality adds.
	HealthPerVitality int
}

type GearSystem struct {
	em         *ecs.EntityManager
	caps       GearCaps
	effects    UniqueEffectTuning
	attributes AttributeTuning
}

func NewGearSystem(em *ecs.EntityManager, caps GearCaps, effects UniqueEffectTuning, attributes AttributeTuning) *GearSystem {
	return &GearSystem{em: em, caps: caps, effects: effects, attributes: attributes}
}

// wornSlots are every slot whose item counts as gear, armorSlots the ones read
// for armor base ratings and wornWeapon the weapon's. All are drawn from the one
// list of slots, EquipmentSlots.
var (
	wornSlots  = slotsWhere(func(slot EquipmentSlot) bool { return slot.Gear })
	armorSlots = slotsWhere(func(slot EquipmentSlot) bool { return slot.ItemType == types.ItemTypeArmor })
	wornWeapon = SlotsFor(types.ItemTypeWeapon, "")[0]
)

func slotsWhere(keep func(EquipmentSlot) bool) []EquipmentSlot {
	var slots []EquipmentSlot
	for _, slot := range EquipmentSlots {
		if keep(slot) {
			slots = append(slots, slot)
		}
	}
	return slots
}

// NOTE: this runs every game tick
func (s *GearSystem) Update(deltaTime float64, entities []*ecs.Entity) {
	// floors climbed this run; a hub has none
	climbed := 0
	if floor, ok := CurrentFloor(entities); ok {
		climbed = max(floor.Depth-1, 0)
	}

	for _, entity := range entities {
		if !entity.HasComponent(ecs.ComponentTypePlayer) || !entity.HasComponent(ecs.ComponentTypeEquipment) {
			continue
		}

		frenzy := runDownFrenzy(entity, deltaTime)
		bonus, seated := gearBonus(entity)
		s.sum(entity, bonus, frenzy, climbed)
		applyMaxima(entity, bonus, seated)
		applyMoveSpeed(entity, bonus)
	}
}

// gearBonus is the entity's bonus component, added on its first gear pass; seated
// reports that it was just added.
func gearBonus(entity *ecs.Entity) (bonus *components.GearBonusComponent, seated bool) {
	if gc, ok := entity.GetComponent(ecs.ComponentTypeGearBonus); ok {
		return gc.(*components.GearBonusComponent), false
	}
	bonus = &components.GearBonusComponent{}
	entity.AddComponent(bonus)
	return bonus, true
}

// runDownFrenzy ticks the entity's frenzy timer and clears its stacks when it
// runs out, reporting the stacks still live this tick.
func runDownFrenzy(entity *ecs.Entity, deltaTime float64) int {
	fc, ok := entity.GetComponent(ecs.ComponentTypeFrenzy)
	if !ok {
		return 0
	}
	frenzy := fc.(*components.FrenzyComponent)
	frenzy.Remaining -= deltaTime
	if frenzy.Remaining <= 0 {
		frenzy.Stacks, frenzy.Remaining = 0, 0
	}
	return frenzy.Stacks
}

// sum recomputes this tick's bonus from what is worn, keeping only the record of
// what the maxima already carry. The worn uniques' passive effects count once
// each, before the caps. Vitality, own and worn, adds to the max HP bonus.
func (s *GearSystem) sum(entity *ecs.Entity, bonus *components.GearBonusComponent, frenzy, climbed int) {
	*bonus = components.GearBonusComponent{
		AppliedMaxHealth: bonus.AppliedMaxHealth,
		AppliedMaxMana:   bonus.AppliedMaxMana,
	}

	// a unique's effect counts once however many copies are worn
	var frenzyWorn, floorAttributesWorn bool
	for _, slot := range wornSlots {
		item := wornItem(s.em, entity, slot)
		if item == nil {
			continue
		}
		for _, affix := range item.Affixes {
			addAffix(bonus, affix)
		}
		frenzyWorn = frenzyWorn || item.UniqueEffectCode == types.UniqueEffectKillFrenzy
		floorAttributesWorn = floorAttributesWorn || item.UniqueEffectCode == types.UniqueEffectFloorAttributes
	}

	if frenzyWorn {
		bonus.AttackSpeedPercent += frenzy * s.effects.FrenzyAttackSpeedPercent
	}
	if floorAttributesWorn {
		bonus.Strength += climbed
		bonus.Agility += climbed
		bonus.Intelligence += climbed
		bonus.Vitality += climbed
	}

	vitality := bonus.Vitality
	if sc, ok := entity.GetComponent(ecs.ComponentTypeStats); ok {
		vitality += sc.(*components.StatsComponent).Vitality
	}
	bonus.MaxHealth += vitality * s.attributes.HealthPerVitality

	bonus.AttackSpeedPercent = min(bonus.AttackSpeedPercent, s.caps.AttackSpeedPercent)
	bonus.MoveSpeedPercent = min(bonus.MoveSpeedPercent, s.caps.MoveSpeedPercent)
}

func addAffix(bonus *components.GearBonusComponent, affix types.Affix) {
	switch affix.Stat {
	case types.AffixStrength:
		bonus.Strength += affix.Value
	case types.AffixAgility:
		bonus.Agility += affix.Value
	case types.AffixIntelligence:
		bonus.Intelligence += affix.Value
	case types.AffixMaxHealth:
		bonus.MaxHealth += affix.Value
	case types.AffixMaxMana:
		bonus.MaxMana += affix.Value
	case types.AffixAttackSpeed:
		bonus.AttackSpeedPercent += affix.Value
	case types.AffixMoveSpeed:
		bonus.MoveSpeedPercent += affix.Value
	case types.AffixCritChance:
		bonus.CritChance += affix.Value
	case types.AffixFlatDamage:
		bonus.FlatDamage += affix.Value
	case types.AffixDefense:
		bonus.Defense += affix.Value
	case types.AffixMagicResistance:
		bonus.MagicResistance += affix.Value
	}
}

// applyMaxima moves the health and mana maxima by the change in their bonus.
// Gaining maximum never raises current; losing it lowers current to the new
// maximum. On a delver's first gear pass, the one that seats their gear, the
// gain is current too: seated at full, they stay at full including gear. A
// delver already at 0 is never raised.
func applyMaxima(entity *ecs.Entity, bonus *components.GearBonusComponent, seated bool) {
	if hc, ok := entity.GetComponent(ecs.ComponentTypeHealth); ok {
		health := hc.(*components.HealthComponent)
		health.MaxHealth, health.CurrentHealth = shiftMaximum(health.MaxHealth, health.CurrentHealth, bonus.MaxHealth-bonus.AppliedMaxHealth, seated)
	}
	bonus.AppliedMaxHealth = bonus.MaxHealth

	if mc, ok := entity.GetComponent(ecs.ComponentTypeMana); ok {
		mana := mc.(*components.ManaComponent)
		mana.MaxMana, mana.CurrentMana = shiftMaximum(mana.MaxMana, mana.CurrentMana, bonus.MaxMana-bonus.AppliedMaxMana, seated)
	}
	bonus.AppliedMaxMana = bonus.MaxMana
}

func shiftMaximum(maximum, current, delta int, seated bool) (int, int) {
	maximum += delta
	if seated && current > 0 {
		current += delta
	}
	return maximum, max(min(current, maximum), 0)
}

// applyMoveSpeed sets movement speed from the default, so gear never compounds.
func applyMoveSpeed(entity *ecs.Entity, bonus *components.GearBonusComponent) {
	vc, ok := entity.GetComponent(ecs.ComponentTypeVelocity)
	if !ok {
		return
	}
	vc.(*components.VelocityComponent).Speed = constants.DefaultSpeed * (1 + float64(bonus.MoveSpeedPercent)/100)
}

// WornUniqueEffects is the set of unique effect codes the entity wears in its
// equipment slots: a set, so two copies of a unique count once. FS-4R9M9
// §Requirements 29.
func WornUniqueEffects(em *ecs.EntityManager, entity *ecs.Entity) map[string]bool {
	effects := make(map[string]bool)
	for _, slot := range wornSlots {
		if item := wornItem(em, entity, slot); item != nil && item.UniqueEffectCode != "" {
			effects[item.UniqueEffectCode] = true
		}
	}
	return effects
}

// wornItem is the item in one of the entity's equipment slots, nil when empty.
func wornItem(em *ecs.EntityManager, entity *ecs.Entity, slot EquipmentSlot) *components.ItemComponent {
	ec, ok := entity.GetComponent(ecs.ComponentTypeEquipment)
	if !ok {
		return nil
	}
	itemID := *slot.Holder(ec.(*components.EquipmentComponent))
	if itemID == nil {
		return nil
	}
	itemEntity, ok := em.GetEntity(*itemID)
	if !ok {
		return nil
	}
	ic, ok := itemEntity.GetComponent(ecs.ComponentTypeItem)
	if !ok {
		return nil
	}
	return ic.(*components.ItemComponent)
}
