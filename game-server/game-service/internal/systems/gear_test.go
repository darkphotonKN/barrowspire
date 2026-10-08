package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

// testGearCaps are FS-4R9M9's caps: +50% attack speed, +30% move speed.
var testGearCaps = GearCaps{AttackSpeedPercent: 50, MoveSpeedPercent: 30}

// vitalityAside leaves Vitality's max HP out of tests about something else.
var vitalityAside = AttributeTuning{}

// testUniqueEffects are FS-4R9M9's: +15% attack speed per frenzy stack, 20%
// reflected, one extra pierce, and a 3 s trail pulsing every 0.5 s within 30 px
// at power 4 + level.
var testUniqueEffects = UniqueEffectTuning{
	FrenzyAttackSpeedPercent: 15,
	ReflectPercent:           20,
	PierceExtraTargets:       1,
	BurningTrail:             BurningTrailTuning{Seconds: 3, PulseSeconds: 0.5, HalfWidth: 30, BasePower: 4},
}

// wear puts an item carrying affixes into one of e's equipment slots and
// returns the item entity.
func wear(em *ecs.EntityManager, e *ecs.Entity, slot func(*components.EquipmentComponent, *uuid.UUID), itemType types.ItemType, affixes ...types.Affix) *ecs.Entity {
	itemEntity := em.CreateEntity()
	ic := components.NewItemComponent(uuid.New(), itemType, "worn")
	ic.Affixes = affixes
	itemEntity.AddComponent(ic)

	c, _ := e.GetComponent(ecs.ComponentTypeEquipment)
	id := itemEntity.ID
	slot(c.(*components.EquipmentComponent), &id)
	return itemEntity
}

func affix(stat string, value int) types.Affix {
	return types.Affix{Stat: stat, Tier: 1, Value: value}
}

func slashOnce(em *ecs.EntityManager, attacker, target *ecs.Entity) int {
	before := health(target)
	intend(attacker, components.AttackIntent{Kind: components.AttackSlash, TargetX: 200, TargetY: 100})
	NewGearSystem(em, testGearCaps, testUniqueEffects, vitalityAside).Update(tickSeconds, em.GetAllEntities())
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)
	return before - health(target)
}

func TestGearSystem_WornStrength_HitsAsIfStrengthWereHigher(t *testing.T) {
	em := ecs.NewEntityManager()
	geared := delver(em, 100, 100)
	wear(em, geared, chestSlot, types.ItemTypeArmor, affix(types.AffixStrength, 4))
	gearedTarget := dummy(em, 130, 100)
	gearedDamage := slashOnce(em, geared, gearedTarget)

	em2 := ecs.NewEntityManager()
	strong := delver(em2, 100, 100)
	sc, _ := strong.GetComponent(ecs.ComponentTypeStats)
	sc.(*components.StatsComponent).Strength += 4
	strongTarget := dummy(em2, 130, 100)
	strongDamage := slashOnce(em2, strong, strongTarget)

	assert.Equal(t, strongDamage, gearedDamage)
	assert.Greater(t, gearedDamage, 25, "an unequipped warrior slash lands 25")
}

func TestGearSystem_Unequip_RemovedOnTheNextTick(t *testing.T) {
	em := ecs.NewEntityManager()
	attacker := delver(em, 100, 100)
	wear(em, attacker, chestSlot, types.ItemTypeArmor, affix(types.AffixStrength, 4))
	target := dummy(em, 130, 100)
	geared := slashOnce(em, attacker, target)

	ec, _ := attacker.GetComponent(ecs.ComponentTypeEquipment)
	ec.(*components.EquipmentComponent).ChestSlot = nil
	cd, _ := attacker.GetComponent(ecs.ComponentTypeCooldown)
	cd.(*components.CooldownComponent).Remaining = map[components.AttackKind]float64{}

	assert.Equal(t, 25, slashOnce(em, attacker, target), "12 × 1.5 × (1 + 8/20) = 25.2")
	assert.Greater(t, geared, 25)
}

func TestGearSystem_SumsWornSlotsOnly_UniqueFixedAffixesCount(t *testing.T) {
	em := ecs.NewEntityManager()
	attacker := delver(em, 100, 100)
	wear(em, attacker, weaponSlot, types.ItemTypeWeapon, affix(types.AffixStrength, 1))
	wear(em, attacker, ring1Slot, types.ItemTypeRing, types.Affix{Stat: types.AffixStrength, Tier: 0, Value: 2})
	wear(em, attacker, ring2Slot, types.ItemTypeRing, affix(types.AffixStrength, 3), affix(types.AffixAgility, 5))
	wear(em, attacker, consumable1Slot, types.ItemTypeConsumable, affix(types.AffixStrength, 100))

	NewGearSystem(em, testGearCaps, testUniqueEffects, testAttributes).Update(tickSeconds, em.GetAllEntities())

	bonus := gearOf(attacker)
	assert.Equal(t, 6, bonus.Strength, "weapon 1 + unique ring 2 (tier 0) + ring 3; consumables never count")
	assert.Equal(t, 5, bonus.Agility)
	sc, _ := attacker.GetComponent(ecs.ComponentTypeStats)
	assert.Equal(t, 8, sc.(*components.StatsComponent).Strength, "the character's own stats are never rewritten")
}

func ring1Slot(eq *components.EquipmentComponent, id *uuid.UUID)       { eq.Ring1Slot = id }
func ring2Slot(eq *components.EquipmentComponent, id *uuid.UUID)       { eq.Ring2Slot = id }
func glovesSlot(eq *components.EquipmentComponent, id *uuid.UUID)      { eq.GlovesSlot = id }
func legsSlot(eq *components.EquipmentComponent, id *uuid.UUID)        { eq.LegsSlot = id }
func consumable1Slot(eq *components.EquipmentComponent, id *uuid.UUID) { eq.Consumable1 = id }

func gearOf(e *ecs.Entity) *components.GearBonusComponent {
	c, _ := e.GetComponent(ecs.ComponentTypeGearBonus)
	return c.(*components.GearBonusComponent)
}

// R40: flat damage, crit, defense and magic resistance worn enter the formula
// beside the weapon and armor base stats.
func TestGearSystem_CombatAffixes_ChangeDamageDealtAndTaken(t *testing.T) {
	magicBolt := components.AttackSnapshot{DamageType: components.DamageMagic, Power: 12, Coefficient: 1, CritChance: 0}

	tests := []struct {
		name   string
		roll   float64
		wear   func(em *ecs.EntityManager, attacker, target *ecs.Entity)
		impact bool // a magic bolt lands instead of the attacker's targeted strike
		want   int
	}{
		{"unequipped", 0.14, func(*ecs.EntityManager, *ecs.Entity, *ecs.Entity) {}, false, 8},
		{
			"flat damage adds to power like attack_power", neverCrit(),
			func(em *ecs.EntityManager, attacker, _ *ecs.Entity) {
				wear(em, attacker, glovesSlot, types.ItemTypeArmor, affix(types.AffixFlatDamage, 8))
			},
			false, 14, // (12+8) × 0.5 × 1.4
		},
		{
			"crit points add to the crit chance", 0.14,
			func(em *ecs.EntityManager, attacker, _ *ecs.Entity) {
				wear(em, attacker, ring1Slot, types.ItemTypeRing, affix(types.AffixCritChance, 10))
			},
			false, 13, // 5% + 10% > 14%: 8.4 × 1.5 = 12.6
		},
		{
			"crit stays capped at 50%", 0.55,
			func(em *ecs.EntityManager, attacker, _ *ecs.Entity) {
				wear(em, attacker, ring1Slot, types.ItemTypeRing, affix(types.AffixCritChance, 90))
			},
			false, 8,
		},
		{
			"defense adds to mitigation", neverCrit(),
			func(em *ecs.EntityManager, _, target *ecs.Entity) {
				wear(em, target, chestSlot, types.ItemTypeArmor, affix(types.AffixDefense, 10))
			},
			false, 7, // 8.4 × 100/120
		},
		{
			"magic resistance mitigates a magic hit", neverCrit(),
			func(em *ecs.EntityManager, _, target *ecs.Entity) {
				wear(em, target, ring2Slot, types.ItemTypeRing, affix(types.AffixMagicResistance, 10))
			},
			true, 10, // 12 × 100/120
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			attacker := delver(em, 100, 100)
			target := delver(em, 140, 100)
			hc, _ := target.GetComponent(ecs.ComponentTypeHealth)
			hc.(*components.HealthComponent).CurrentHealth = 1000
			hc.(*components.HealthComponent).MaxHealth = 1000
			cc, _ := target.GetComponent(ecs.ComponentTypeCombat)
			cc.(*components.CombatComponent).Defense = 0
			tt.wear(em, attacker, target)
			NewGearSystem(em, testGearCaps, testUniqueEffects, vitalityAside).Update(tickSeconds, em.GetAllEntities())
			roll := tt.roll

			var impacts []Impact
			if tt.impact {
				impacts = []Impact{{Attack: magicBolt, TargetEntityID: target.ID}}
			} else {
				intend(attacker, components.AttackIntent{Kind: components.AttackTargeted, TargetEntityID: target.ID})
			}
			NewCombatSystem(em, func() float64 { return roll }, PlayerDamageOn, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), impacts)

			assert.Equal(t, 1000-tt.want, health(target))
		})
	}
}

func TestGearSystem_AttackSpeed_ShortensCooldownsCapped(t *testing.T) {
	tests := []struct {
		name    string
		percent int
		want    float64
	}{
		{"none", 0, 0.25},
		{"+25%", 25, 0.25 / 1.25},
		{"capped at +50%", 80, 0.25 / 1.5},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			attacker := delver(em, 100, 100)
			wear(em, attacker, glovesSlot, types.ItemTypeArmor, affix(types.AffixAttackSpeed, tt.percent))

			slashOnce(em, attacker, dummy(em, 130, 100))

			cd, _ := attacker.GetComponent(ecs.ComponentTypeCooldown)
			assert.InDelta(t, tt.want, cd.(*components.CooldownComponent).Remaining[components.AttackSlash], 1e-9)
		})
	}
}

func TestGearSystem_MoveSpeed_RaisesSpeedCapped(t *testing.T) {
	tests := []struct {
		name    string
		percent int
		want    float64
	}{
		{"none", 0, 200},
		{"+10%", 10, 220},
		{"capped at +30%", 50, 260},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			walker := delver(em, 100, 100)
			walker.AddComponent(components.NewVelocityComponent(0, 0, 200))
			wear(em, walker, legsSlot, types.ItemTypeArmor, affix(types.AffixMoveSpeed, tt.percent))

			gear := NewGearSystem(em, testGearCaps, testUniqueEffects, vitalityAside)
			gear.Update(tickSeconds, em.GetAllEntities())
			gear.Update(tickSeconds, em.GetAllEntities())

			vc, _ := walker.GetComponent(ecs.ComponentTypeVelocity)
			assert.InDelta(t, tt.want, vc.(*components.VelocityComponent).Speed, 1e-9, "set from the default, never compounded")
		})
	}
}

func healthOf(e *ecs.Entity) *components.HealthComponent {
	c, _ := e.GetComponent(ecs.ComponentTypeHealth)
	return c.(*components.HealthComponent)
}

func manaOf(e *ecs.Entity) *components.ManaComponent {
	c, _ := e.GetComponent(ecs.ComponentTypeMana)
	return c.(*components.ManaComponent)
}

func TestGearSystem_SeatedDelver_StartsFullIncludingGear(t *testing.T) {
	em := ecs.NewEntityManager()
	d := delver(em, 100, 100)
	wear(em, d, chestSlot, types.ItemTypeArmor, affix(types.AffixMaxHealth, 12), affix(types.AffixMaxMana, 8))

	NewGearSystem(em, testGearCaps, testUniqueEffects, testAttributes).Update(tickSeconds, em.GetAllEntities())

	assert.Equal(t, 150+45+12, healthOf(d).MaxHealth, "own, Vitality 9 and gear")
	assert.Equal(t, 150+45+12, healthOf(d).CurrentHealth)
	assert.Equal(t, 108, manaOf(d).MaxMana)
	assert.Equal(t, 108, manaOf(d).CurrentMana)
}

func TestGearSystem_MaxHealthGear_NeverHealsAndUnequipClamps(t *testing.T) {
	em := ecs.NewEntityManager()
	d := delver(em, 100, 100)
	gear := NewGearSystem(em, testGearCaps, testUniqueEffects, testAttributes)
	gear.Update(tickSeconds, em.GetAllEntities()) // seated with nothing worn
	healthOf(d).CurrentHealth = 100

	// putting it on raises the maximum, not the current
	wear(em, d, chestSlot, types.ItemTypeArmor, affix(types.AffixMaxHealth, 12))
	gear.Update(tickSeconds, em.GetAllEntities())
	gear.Update(tickSeconds, em.GetAllEntities())
	assert.Equal(t, 195+12, healthOf(d).MaxHealth, "applied once, not every tick")
	assert.Equal(t, 100, healthOf(d).CurrentHealth)

	// healed to the top, then taking it off clamps current to the new maximum
	healthOf(d).CurrentHealth = 195 + 12
	ec, _ := d.GetComponent(ecs.ComponentTypeEquipment)
	ec.(*components.EquipmentComponent).ChestSlot = nil
	gear.Update(tickSeconds, em.GetAllEntities())
	assert.Equal(t, 195, healthOf(d).MaxHealth)
	assert.Equal(t, 195, healthOf(d).CurrentHealth)
}

// Level-up growth lands on the same maximum the gear bonus does; neither loses
// the other. FS-4R9M9 §Edge States "Level-up while wearing gear".
func TestGearSystem_LevelUpWhileWearing_KeepsGrowthAndBonus(t *testing.T) {
	em := ecs.NewEntityManager()
	d := delver(em, 100, 100)
	wear(em, d, chestSlot, types.ItemTypeArmor, affix(types.AffixMaxHealth, 12), affix(types.AffixStrength, 2))
	gear := NewGearSystem(em, testGearCaps, testUniqueEffects, testAttributes)
	gear.Update(tickSeconds, em.GetAllEntities())

	// a level-up grows the character underneath the gear
	healthOf(d).MaxHealth += 10
	sc, _ := d.GetComponent(ecs.ComponentTypeStats)
	sc.(*components.StatsComponent).Strength += 1
	gear.Update(tickSeconds, em.GetAllEntities())

	assert.Equal(t, 217, healthOf(d).MaxHealth, "150 own + 45 Vitality + 10 growth + 12 gear")
	assert.Equal(t, 2, gearOf(d).Strength, "the bonus is unaffected")
	assert.Equal(t, 9, sc.(*components.StatsComponent).Strength)
}

// The first gear pass never raises a delver already at 0.
func TestGearSystem_FirstPass_NeverRaisesTheDead(t *testing.T) {
	em := ecs.NewEntityManager()
	d := delver(em, 100, 100)
	healthOf(d).CurrentHealth = 0
	wear(em, d, chestSlot, types.ItemTypeArmor, affix(types.AffixMaxHealth, 12))

	NewGearSystem(em, testGearCaps, testUniqueEffects, testAttributes).Update(tickSeconds, em.GetAllEntities())

	assert.Equal(t, 150+45+12, healthOf(d).MaxHealth)
	assert.Equal(t, 0, healthOf(d).CurrentHealth)
}

// testAttributes is the decided +5 max HP per point of Vitality.
var testAttributes = AttributeTuning{HealthPerVitality: 5}

func statsOf(e *ecs.Entity) *components.StatsComponent {
	c, _ := e.GetComponent(ecs.ComponentTypeStats)
	return c.(*components.StatsComponent)
}

// Each point of Vitality, the character's own, is +HealthPerVitality max HP; a
// seated delver starts full including it. (user decision 2026-10-09)
func TestGearSystem_Vitality_RaisesMaxHealth_SeatedFull(t *testing.T) {
	em := ecs.NewEntityManager()
	d := delver(em, 100, 100) // 150 HP, Vitality 9

	NewGearSystem(em, testGearCaps, testUniqueEffects, testAttributes).Update(tickSeconds, em.GetAllEntities())

	assert.Equal(t, 150+9*5, healthOf(d).MaxHealth)
	assert.Equal(t, 150+9*5, healthOf(d).CurrentHealth)
}

// Vitality gained, from level growth or from gear, raises max HP by N × the
// constant without healing; Vitality lost lowers it and clamps current.
func TestGearSystem_VitalityChange_NeverHealsAndLossClamps(t *testing.T) {
	sources := map[string]func(em *ecs.EntityManager, d *ecs.Entity, n int){
		"level growth": func(_ *ecs.EntityManager, d *ecs.Entity, n int) { statsOf(d).Vitality += n },
		"floor_attributes on floor n+1": func(em *ecs.EntityManager, d *ecs.Entity, n int) {
			floor := em.CreateEntity()
			floor.AddComponent(components.NewFloorComponent(1+n, 10))
			ring := wear(em, d, ring1Slot, types.ItemTypeRing)
			ic, _ := ring.GetComponent(ecs.ComponentTypeItem)
			ic.(*components.ItemComponent).UniqueEffectCode = types.UniqueEffectFloorAttributes
		},
	}
	for name, gain := range sources {
		t.Run(name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			d := delver(em, 100, 100)
			gear := NewGearSystem(em, testGearCaps, testUniqueEffects, testAttributes)
			gear.Update(tickSeconds, em.GetAllEntities())
			seatedMax := healthOf(d).MaxHealth
			healthOf(d).CurrentHealth = 100

			gain(em, d, 3)
			gear.Update(tickSeconds, em.GetAllEntities())
			gear.Update(tickSeconds, em.GetAllEntities())

			assert.Equal(t, seatedMax+3*5, healthOf(d).MaxHealth, "applied once, not every tick")
			assert.Equal(t, 100, healthOf(d).CurrentHealth, "gaining Vitality never heals")
		})
	}

	t.Run("loss clamps", func(t *testing.T) {
		em := ecs.NewEntityManager()
		d := delver(em, 100, 100)
		gear := NewGearSystem(em, testGearCaps, testUniqueEffects, testAttributes)
		gear.Update(tickSeconds, em.GetAllEntities())
		seatedMax := healthOf(d).MaxHealth

		statsOf(d).Vitality -= 2
		gear.Update(tickSeconds, em.GetAllEntities())

		assert.Equal(t, seatedMax-2*5, healthOf(d).MaxHealth)
		assert.Equal(t, seatedMax-2*5, healthOf(d).CurrentHealth)
	})
}
