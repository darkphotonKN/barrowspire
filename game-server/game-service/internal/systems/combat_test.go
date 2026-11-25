package systems

import (
	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const tickSeconds = 1.0 / 60

// neverCrit and alwaysCrit pin the crit roll so damage is exact.
func neverCrit() float64  { return 0.999 }
func alwaysCrit() float64 { return 0 }

// delver stands a warrior-shaped attacker (Attack 12, Defense 10, Str 8, Agi 8,
// Int 9) at (x, y) with a full 100-point stamina pool.
func delver(em *ecs.EntityManager, x, y float64) *ecs.Entity {
	e := em.CreateEntity()
	e.AddComponent(components.NewPlayerComponent(uuid.New(), "warrior", "Wren", false))
	e.AddComponent(components.NewTransformComponent(x, y))
	e.AddComponent(components.NewHealthComponent(150, 150))
	e.AddComponent(components.NewResourceComponent(components.ResourceStamina, 100, 100, 20))
	e.AddComponent(components.NewCombatComponent(12, 10, 1, 1.0))
	e.AddComponent(components.NewStatsComponent(8, 8, 9, 9))
	e.AddComponent(components.NewEquipmentComponent(nil))
	e.AddComponent(components.NewAttackIntentComponent())
	e.AddComponent(components.NewCooldownComponent())
	return e
}

// dummy is an unarmored damageable thing: health and a place, nothing else.
func dummy(em *ecs.EntityManager, x, y float64) *ecs.Entity {
	e := em.CreateEntity()
	e.AddComponent(components.NewTransformComponent(x, y))
	e.AddComponent(components.NewHealthComponent(1000, 1000))
	return e
}

func health(e *ecs.Entity) int {
	c, _ := e.GetComponent(ecs.ComponentTypeHealth)
	return c.(*components.HealthComponent).CurrentHealth
}

// pool is the delver's class resource, as the wire reads it.
func pool(e *ecs.Entity) int {
	return resourceOf(e).Current
}

func intend(e *ecs.Entity, intent components.AttackIntent) {
	c, _ := e.GetComponent(ecs.ComponentTypeAttackIntent)
	ic := c.(*components.AttackIntentComponent)
	ic.Pending = append(ic.Pending, intent)
}

func equip(em *ecs.EntityManager, e *ecs.Entity, item types.ItemConfig, slot func(*components.EquipmentComponent, *uuid.UUID)) {
	itemEntity := em.CreateEntity()
	ic := components.NewItemComponent(uuid.New(), item.ItemType, item.Name)
	ic.AttackPower = item.AttackPower
	ic.CriticalRate = item.CriticalRate
	ic.DefenseRating = item.DefenseRating
	ic.MagicResistance = item.MagicResistance
	itemEntity.AddComponent(ic)

	c, _ := e.GetComponent(ecs.ComponentTypeEquipment)
	id := itemEntity.ID
	slot(c.(*components.EquipmentComponent), &id)
}

func weaponSlot(eq *components.EquipmentComponent, id *uuid.UUID) { eq.WeaponSlot = id }
func chestSlot(eq *components.EquipmentComponent, id *uuid.UUID)  { eq.ChestSlot = id }
func headSlot(eq *components.EquipmentComponent, id *uuid.UUID)   { eq.HeadSlot = id }

func projectiles(em *ecs.EntityManager) []*components.ProjectileComponent {
	var out []*components.ProjectileComponent
	for _, e := range em.GetAllEntities() {
		if c, ok := e.GetComponent(ecs.ComponentTypeProjectile); ok {
			out = append(out, c.(*components.ProjectileComponent))
		}
	}
	return out
}

func TestCombatSystem_TargetedAttack_FormulaDamageInRange(t *testing.T) {
	em := ecs.NewEntityManager()
	attacker := delver(em, 100, 100)
	target := dummy(em, 150, 100)

	intend(attacker, components.AttackIntent{Kind: components.AttackTargeted, TargetEntityID: target.ID})
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	// 12 × 0.5 × (1 + 8/20) = 8.4 → 8
	assert.Equal(t, 1000-8, health(target))
}

func TestCombatSystem_TargetedAttack_OutOfRangeStartsNoCooldown(t *testing.T) {
	em := ecs.NewEntityManager()
	attacker := delver(em, 100, 100)
	target := dummy(em, 300, 100)
	combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)

	intend(attacker, components.AttackIntent{Kind: components.AttackTargeted, TargetEntityID: target.ID})
	combat.Update(tickSeconds, em.GetAllEntities(), nil)
	assert.Equal(t, 1000, health(target), "out of range is not a swing")

	// step into range the very next tick: no cooldown is holding the swing back
	tc, _ := attacker.GetComponent(ecs.ComponentTypeTransform)
	tc.(*components.TransformComponent).X = 250
	intend(attacker, components.AttackIntent{Kind: components.AttackTargeted, TargetEntityID: target.ID})
	combat.Update(tickSeconds, em.GetAllEntities(), nil)
	assert.Equal(t, 1000-8, health(target))
}

func TestCombatSystem_CooldownIgnoresRequestsAndSpendsNothing(t *testing.T) {
	tests := []struct {
		name     string
		intent   components.AttackIntent
		cooldown float64
		cost     int
	}{
		{"targeted attack", components.AttackIntent{Kind: components.AttackTargeted}, 0.5, 0},
		{"slash", components.AttackIntent{Kind: components.AttackSlash, TargetX: 200, TargetY: 100}, 0.25, 0},
		{"cut", components.AttackIntent{Kind: components.AttackCut, TargetX: 200, TargetY: 100}, 0.25, 0},
		{"shadow shot", components.AttackIntent{Kind: components.AttackShadowShot, TargetX: 200, TargetY: 100}, 1.2, 100},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			attacker := delver(em, 100, 100)
			target := dummy(em, 140, 100)
			intent := tt.intent
			if intent.Kind == components.AttackTargeted {
				intent.TargetEntityID = target.ID
			}
			combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)

			intend(attacker, intent)
			combat.Update(tickSeconds, em.GetAllEntities(), nil)
			hpAfterFirst, shotsAfterFirst := health(target), len(projectiles(em))
			assert.Equal(t, 100-tt.cost, pool(attacker))
			// refilled and unpinned so only the cooldown can refuse what
			// follows; one Shadow Shot alone drains the pool
			resourceOf(attacker).Current = 100
			attacker.RemoveComponent(ecs.ComponentTypeAttackPin)

			// inside the cooldown: nothing at all happens
			intend(attacker, intent)
			combat.Update(tickSeconds, em.GetAllEntities(), nil)
			assert.Equal(t, hpAfterFirst, health(target))
			assert.Equal(t, 100, pool(attacker), "a refused request spends nothing")
			assert.Equal(t, shotsAfterFirst, len(projectiles(em)))

			// once the cooldown has run out the request goes through again
			for elapsed := 0.0; elapsed < tt.cooldown; elapsed += tickSeconds {
				combat.Update(tickSeconds, em.GetAllEntities(), nil)
			}
			intend(attacker, intent)
			combat.Update(tickSeconds, em.GetAllEntities(), nil)
			assert.Equal(t, 100-tt.cost, pool(attacker))
			if tt.cost == 0 {
				assert.Less(t, health(target), hpAfterFirst)
			} else {
				assert.Greater(t, len(projectiles(em)), shotsAfterFirst)
			}
		})
	}
}

func TestCombatSystem_NotEnoughResourceDoesNothing(t *testing.T) {
	em := ecs.NewEntityManager()
	attacker := delver(em, 100, 100)
	resourceOf(attacker).Current = 99 // one short of Shadow Shot's 100
	cooldowns, _ := attacker.GetComponent(ecs.ComponentTypeCooldown)

	intend(attacker, components.AttackIntent{Kind: components.AttackShadowShot, TargetX: 200, TargetY: 100})
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	assert.Equal(t, 99, pool(attacker))
	assert.Empty(t, projectiles(em))
	assert.Zero(t, cooldowns.(*components.CooldownComponent).Remaining[components.AttackShadowShot], "a refused cast starts no cooldown")
}

func TestCombatSystem_EquipmentChangesTheNextHit(t *testing.T) {
	tests := []struct {
		name          string
		targetDefense int // the target delver's class defense
		equip         func(em *ecs.EntityManager, attacker, target *ecs.Entity)
		want          int
	}{
		{"unequipped", 0, func(*ecs.EntityManager, *ecs.Entity, *ecs.Entity) {}, 8},
		{
			"attacker's weapon attack_power adds to power", 0,
			func(em *ecs.EntityManager, attacker, _ *ecs.Entity) {
				equip(em, attacker, types.ItemConfig{ItemType: types.ItemTypeWeapon, AttackPower: 8}, weaponSlot)
			},
			14, // (12+8) × 0.5 × 1.4
		},
		{"class defense mitigates", 10, func(*ecs.EntityManager, *ecs.Entity, *ecs.Entity) {}, 7}, // 8.4 × 100/120
		{
			"target's armor defense_rating adds to class defense", 10,
			func(em *ecs.EntityManager, _, target *ecs.Entity) {
				equip(em, target, types.ItemConfig{ItemType: types.ItemTypeArmor, DefenseRating: 30}, chestSlot)
				equip(em, target, types.ItemConfig{ItemType: types.ItemTypeArmor, DefenseRating: 20}, headSlot)
			},
			4, // 8.4 × 100/(100 + 2×(10 class + 50 armor)) = 3.82
		},
		{
			"target's magic_resistance does not touch a physical hit", 10,
			func(em *ecs.EntityManager, _, target *ecs.Entity) {
				equip(em, target, types.ItemConfig{ItemType: types.ItemTypeArmor, MagicResistance: 100}, chestSlot)
			},
			7, // 8.4 × 100/120 (class defense only)
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			attacker := delver(em, 100, 100)
			target := delver(em, 140, 100)
			hc, _ := target.GetComponent(ecs.ComponentTypeHealth)
			hc.(*components.HealthComponent).CurrentHealth = 1000
			cc, _ := target.GetComponent(ecs.ComponentTypeCombat)
			cc.(*components.CombatComponent).Defense = tt.targetDefense
			tt.equip(em, attacker, target)

			intend(attacker, components.AttackIntent{Kind: components.AttackTargeted, TargetEntityID: target.ID})
			// the target is a delver, so the formula is exercised with player damage on
			NewCombatSystem(em, neverCrit, PlayerDamageOn, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

			assert.Equal(t, 1000-tt.want, health(target))
		})
	}
}

// The same delver, the same swing: taking the weapon off changes the very next hit.
func TestCombatSystem_UnequippingChangesTheNextHit(t *testing.T) {
	em := ecs.NewEntityManager()
	attacker := delver(em, 100, 100)
	target := dummy(em, 140, 100)
	combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)
	equip(em, attacker, types.ItemConfig{ItemType: types.ItemTypeWeapon, AttackPower: 8}, weaponSlot)

	intend(attacker, components.AttackIntent{Kind: components.AttackTargeted, TargetEntityID: target.ID})
	combat.Update(tickSeconds, em.GetAllEntities(), nil)
	assert.Equal(t, 1000-14, health(target))

	ec, _ := attacker.GetComponent(ecs.ComponentTypeEquipment)
	ec.(*components.EquipmentComponent).WeaponSlot = nil
	// past the swing's cooldown and the pin it started
	for elapsed := 0.0; elapsed <= max(attackTable[components.AttackTargeted].cooldown, AttackPinDuration); elapsed += tickSeconds {
		combat.Update(tickSeconds, em.GetAllEntities(), nil)
	}

	intend(attacker, components.AttackIntent{Kind: components.AttackTargeted, TargetEntityID: target.ID})
	combat.Update(tickSeconds, em.GetAllEntities(), nil)
	assert.Equal(t, 1000-14-8, health(target))
}

func TestCombatSystem_WeaponCriticalRateRaisesCritChance(t *testing.T) {
	em := ecs.NewEntityManager()
	attacker := delver(em, 100, 100)
	target := dummy(em, 140, 100)
	equip(em, attacker, types.ItemConfig{ItemType: types.ItemTypeWeapon, CriticalRate: 0.30}, weaponSlot)

	// 0.30 sits above the base 5% and below 5% + 30%: only the weapon makes it a crit
	intend(attacker, components.AttackIntent{Kind: components.AttackTargeted, TargetEntityID: target.ID})
	NewCombatSystem(em, func() float64 { return 0.30 }, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	assert.Equal(t, 1000-13, health(target)) // 8.4 × 1.5 = 12.6
}

func TestCombatSystem_SlashHitsEveryValidTargetInTheCone(t *testing.T) {
	em := ecs.NewEntityManager()
	attacker := delver(em, 100, 100)
	inFront := dummy(em, 140, 100)
	inFrontToo := dummy(em, 130, 125)
	behind := dummy(em, 60, 100)
	tooFar := dummy(em, 200, 100)
	alreadyDead := dummy(em, 140, 90)
	hc, _ := alreadyDead.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 0

	intend(attacker, components.AttackIntent{Kind: components.AttackSlash, TargetX: 200, TargetY: 100})
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	slash := int(RawDamage(12, attackTable[components.AttackSlash].coefficient, 8) + 0.5)
	assert.Equal(t, 1000-slash, health(inFront))
	assert.Equal(t, 1000-slash, health(inFrontToo))
	assert.Equal(t, 1000, health(behind))
	assert.Equal(t, 1000, health(tooFar))
	assert.Equal(t, 0, health(alreadyDead), "damage to a dead target is discarded")
	assert.Equal(t, 150, health(attacker), "a slash never hits its own swinger")
}

// mercenary re-stats a delver to the merc's level-1 attributes: STR 7, AGI 7.
func mercenary(em *ecs.EntityManager, x, y float64) *ecs.Entity {
	e := delver(em, x, y)
	e.AddComponent(components.NewStatsComponent(7, 7, 9, 9))
	return e
}

// offAim is the point dist px from (x, y), deg degrees off a +x aim.
func offAim(x, y, dist, deg float64) (float64, float64) {
	rad := deg * math.Pi / 180
	return x + dist*math.Cos(rad), y + dist*math.Sin(rad)
}

// A level-1 cut, unequipped, no crit, no mitigation: 12 × 1.8 × (1 + 7/20) =
// 29.16 → 29. FS-MAMHR §Requirements 8.
func TestCombatSystem_Cut_LevelOneUnequippedDeals29(t *testing.T) {
	em := ecs.NewEntityManager()
	merc := mercenary(em, 100, 100)
	x, y := offAim(100, 100, 40, 20)
	target := dummy(em, x, y)

	intend(merc, components.AttackIntent{Kind: components.AttackCut, TargetX: 200, TargetY: 100})
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	assert.Equal(t, 1000-29, health(target))
}

// The cut hits every valid target within 55 px inside 70° of the aim, none
// outside; the slash keeps its own 120° and 50 px. FS-MAMHR §Requirements 6.
func TestCombatSystem_ConeTakesItsArcAndReachFromTheRow(t *testing.T) {
	tests := []struct {
		name  string
		kind  components.AttackKind
		dist  float64 // px from the swinger
		deg   float64 // degrees off the aim
		inCut bool
	}{
		{"cut: dead ahead", components.AttackCut, 40, 0, true},
		{"cut: 20° off", components.AttackCut, 40, 20, true},
		{"cut: just inside the arc", components.AttackCut, 40, -34, true},
		{"cut: just outside the arc", components.AttackCut, 40, 36, false},
		{"cut: just inside reach", components.AttackCut, 54, 0, true},
		{"cut: just past reach", components.AttackCut, 56, 0, false},
		{"cut: behind", components.AttackCut, 40, 180, false},
		{"slash: past its 50 px, inside the cut's 55", components.AttackSlash, 52, 0, false},
		{"slash: just inside reach", components.AttackSlash, 49, 0, true},
		{"slash: 55° off, outside the cut's arc", components.AttackSlash, 40, 55, true},
		{"slash: just outside its 120°", components.AttackSlash, 40, 62, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			swinger := mercenary(em, 100, 100)
			x, y := offAim(100, 100, tt.dist, tt.deg)
			target := dummy(em, x, y)

			intend(swinger, components.AttackIntent{Kind: tt.kind, TargetX: 200, TargetY: 100})
			NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

			if tt.inCut {
				assert.Less(t, health(target), 1000)
			} else {
				assert.Equal(t, 1000, health(target))
			}
		})
	}
}

// Hybrid scaling: the cut scales on ((STR + worn STR) + (AGI + worn AGI)) / 2,
// its half kept. FS-MAMHR §Requirements 7.
func TestCombatSystem_Cut_ScalesOnTheMeanOfStrengthAndAgility(t *testing.T) {
	tests := []struct {
		name      string
		strength  int
		agility   int
		worn      components.GearBonusComponent
		wantScale float64
		want      int
	}{
		{"STR 7 / AGI 7, unequipped", 7, 7, components.GearBonusComponent{}, 7, 29},                // 29.16
		{"worn Strength alone raises it", 7, 7, components.GearBonusComponent{Strength: 2}, 8, 30}, // 30.24
		{"worn Agility alone raises it", 7, 7, components.GearBonusComponent{Agility: 2}, 8, 30},   // 30.24
		{"STR 7 / AGI 8 keeps the half", 7, 8, components.GearBonusComponent{}, 7.5, 30},           // 29.7
		{"an odd worn sum keeps the half", 7, 7, components.GearBonusComponent{Strength: 1}, 7.5, 30},
		{"Intelligence does nothing", 7, 7, components.GearBonusComponent{Intelligence: 9}, 7, 29},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			merc := delver(em, 100, 100)
			merc.AddComponent(components.NewStatsComponent(tt.strength, tt.agility, 9, 9))
			worn := tt.worn
			merc.AddComponent(&worn)
			target := dummy(em, 140, 100)

			intend(merc, components.AttackIntent{Kind: components.AttackCut, TargetX: 200, TargetY: 100})
			combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)
			combat.Update(tickSeconds, em.GetAllEntities(), nil)

			assert.Equal(t, tt.wantScale, combat.snapshot(merc, attackTable[components.AttackCut]).ScalingStat)
			assert.Equal(t, 1000-tt.want, health(target))
		})
	}
}

// Worn attack speed shortens the cut's 0.25 s like every cooldown.
func TestCombatSystem_Cut_WornAttackSpeedShortensItsCooldown(t *testing.T) {
	em := ecs.NewEntityManager()
	merc := mercenary(em, 100, 100)
	merc.AddComponent(&components.GearBonusComponent{AttackSpeedPercent: 25})

	intend(merc, components.AttackIntent{Kind: components.AttackCut, TargetX: 200, TargetY: 100})
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	cc, _ := merc.GetComponent(ecs.ComponentTypeCooldown)
	assert.InDelta(t, 0.2, cc.(*components.CooldownComponent).Remaining[components.AttackCut], 1e-9) // 0.25 / 1.25
}

func TestCombatSystem_ProjectileSkillsFireSnapshots(t *testing.T) {
	tests := []struct {
		name     string
		kind     components.AttackKind
		count    int
		dmgType  components.DamageType
		stat     int
		projType string
	}{
		{"arrow", components.AttackArrow, 1, components.DamagePhysical, 8, "arrow"},
		{"fireball", components.AttackFireball, 1, components.DamageMagic, 9, "fireball"},
		{"shadow shot", components.AttackShadowShot, 1, components.DamagePhysical, 8, "shadow_shot"},
		{"triple fireball", components.AttackTripleFireball, 3, components.DamageMagic, 9, "fireball"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			attacker := delver(em, 100, 100)
			equip(em, attacker, types.ItemConfig{ItemType: types.ItemTypeWeapon, AttackPower: 5, CriticalRate: 0.1}, weaponSlot)
			pc, _ := attacker.GetComponent(ecs.ComponentTypePlayer)
			memberID := pc.(*components.PlayerComponent).MemberID

			intend(attacker, components.AttackIntent{Kind: tt.kind, TargetX: 300, TargetY: 100})
			NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

			shots := projectiles(em)
			require.Len(t, shots, tt.count)
			for _, p := range shots {
				assert.Equal(t, tt.projType, p.ProjectileType)
				assert.Equal(t, attacker.ID, p.OwnerEntityID)
				assert.Equal(t, components.AttackSnapshot{
					AttackerEntityID: attacker.ID,
					AttackerMemberID: memberID,
					Kind:             tt.kind,
					DamageType:       tt.dmgType,
					Power:            17,
					Coefficient:      attackTable[tt.kind].coefficient,
					ScalingStat:      float64(tt.stat),
					CritChance:       CritChance(0.1),
				}, p.Attack)
			}
		})
	}
}

// Shadow Shot looses one slow, heavy bolt toward the aim: physical, Agility at
// 3.2, 260 px/s over 650 px with a 10 px radius. FS-JTNPR §Requirements 1.
func TestCombatSystem_ShadowShot_LoosesOneSlowHeavyBolt(t *testing.T) {
	em := ecs.NewEntityManager()
	archer := delver(em, 100, 100)

	intend(archer, components.AttackIntent{Kind: components.AttackShadowShot, TargetX: 100, TargetY: 400})
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	var bolts []*ecs.Entity
	for _, e := range em.GetAllEntities() {
		if _, ok := e.GetComponent(ecs.ComponentTypeProjectile); ok {
			bolts = append(bolts, e)
		}
	}
	require.Len(t, bolts, 1)
	pc, _ := bolts[0].GetComponent(ecs.ComponentTypeProjectile)
	bolt := pc.(*components.ProjectileComponent)
	assert.Equal(t, "shadow_shot", bolt.ProjectileType)
	assert.Equal(t, 260.0, bolt.Speed)
	assert.Equal(t, 650.0, bolt.MaxDistance)
	assert.Equal(t, 10.0, bolt.Radius)
	assert.Equal(t, components.DamagePhysical, bolt.Attack.DamageType)
	assert.Equal(t, 3.2, bolt.Attack.Coefficient)
	assert.Equal(t, scaleAgility, attackTable[components.AttackShadowShot].scaling)

	vc, _ := bolts[0].GetComponent(ecs.ComponentTypeVelocity)
	v := vc.(*components.VelocityComponent)
	assert.InDelta(t, 0, v.VX, 1e-9, "flies straight at the aim")
	assert.InDelta(t, 260, v.VY, 1e-9)
}

func TestCombatSystem_ImpactsResolveEvenAfterTheOwnerIsGone(t *testing.T) {
	em := ecs.NewEntityManager()
	target := dummy(em, 140, 100)
	gone := uuid.New() // the owner entity no longer exists in the world

	impact := Impact{
		TargetEntityID: target.ID,
		Attack: components.AttackSnapshot{
			AttackerEntityID: gone, AttackerMemberID: uuid.New(),
			DamageType: components.DamageMagic, Power: 15, Coefficient: 1.1, ScalingStat: 9, CritChance: 0.05,
		},
	}
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), []Impact{impact})

	assert.Equal(t, 1000-24, health(target)) // 15 × 1.1 × 1.45 = 23.9
}

func TestCombatSystem_ImpactOnDeadTargetIsDiscarded(t *testing.T) {
	em := ecs.NewEntityManager()
	target := dummy(em, 140, 100)
	hc, _ := target.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 0

	impact := Impact{TargetEntityID: target.ID, Attack: components.AttackSnapshot{Power: 50, Coefficient: 1}}
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), []Impact{impact})

	assert.Equal(t, 0, health(target))
}

func TestCombatSystem_HealthNeverGoesBelowZero(t *testing.T) {
	em := ecs.NewEntityManager()
	target := dummy(em, 140, 100)
	hc, _ := target.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 3

	impact := Impact{TargetEntityID: target.ID, Attack: components.AttackSnapshot{Power: 50, Coefficient: 1}}
	NewCombatSystem(em, alwaysCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), []Impact{impact})

	assert.Equal(t, 0, health(target))
}

// The dash costs stamina on its cast and sets a charge going; the MovementSystem
// carries it over the ticks after (dash_test.go), so the cast itself moves nothing.
func TestCombatSystem_DashSetsAChargeGoingAndCostsStamina(t *testing.T) {
	em := ecs.NewEntityManager()
	attacker := delver(em, 100, 100)

	intend(attacker, components.AttackIntent{Kind: components.AttackDash, TargetX: 400, TargetY: 100})
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	tc, _ := attacker.GetComponent(ecs.ComponentTypeTransform)
	assert.Equal(t, 100.0, tc.(*components.TransformComponent).X)
	assert.True(t, attacker.HasComponent(ecs.ComponentTypeDash))
	assert.Equal(t, 60, pool(attacker))
}

func TestCombatSystem_IntentsAreConsumed(t *testing.T) {
	em := ecs.NewEntityManager()
	attacker := delver(em, 100, 100)
	_ = dummy(em, 140, 100)

	intend(attacker, components.AttackIntent{Kind: components.AttackSlash, TargetX: 200, TargetY: 100})
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	c, _ := attacker.GetComponent(ecs.ComponentTypeAttackIntent)
	assert.Empty(t, c.(*components.AttackIntentComponent).Pending)
}

func TestSkillAttackKind_FoldsAliases(t *testing.T) {
	tests := []struct {
		skillID string
		want    components.AttackKind
		ok      bool
	}{
		{"slash", components.AttackSlash, true},
		{"melee_slash", components.AttackSlash, true},
		{"strike", components.AttackSlash, true},
		{"cut", components.AttackCut, true}, // its own row, not a slash
		{"arrow", components.AttackArrow, true},
		{"power_shot", components.AttackArrow, true},
		{"shoot", components.AttackArrow, true},
		{"fireball", components.AttackFireball, true},
		{"shadow_shot", components.AttackShadowShot, true},
		{"triple_arrow", "", false}, // the volley is gone, not remapped
		{"multishot_arrow", "", false},
		{"triple_fireball", components.AttackTripleFireball, true},
		{"multishot_fireball", components.AttackTripleFireball, true},
		{"dash", components.AttackDash, true},
		{"sprint", components.AttackDash, true},
		{"parry", components.AttackParry, true},               // the merc's stance, no table row
		{"earthbreaker", components.AttackEarthbreaker, true}, // the tree abilities, one kind each
		{"blink", components.AttackBlink, true},
		{"arrow_rain", components.AttackArrowRain, true},
		{"settle_the_debt", components.AttackSettleTheDebt, true},
		{"riposte", "", false}, // armed on the server only
		{"attack", "", false},  // the targeted attack is its own action, not a skill
		{"meteor", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.skillID, func(t *testing.T) {
			got, ok := SkillAttackKind(tt.skillID)
			assert.Equal(t, tt.ok, ok)
			assert.Equal(t, tt.want, got)
		})
	}
}

// A target's own magic resistance, which a monster brings from its stat sheet,
// mitigates a magic hit as its defense does a physical one. FS-77AB6 §19.
func TestCombatSystem_TargetsOwnMagicResistanceMitigatesMagic(t *testing.T) {
	tests := []struct {
		name       string
		damageType components.DamageType
		want       int
	}{
		{"magic is mitigated by magic resistance", components.DamageMagic, 20},    // 24 × 100/120
		{"physical is mitigated by defense alone", components.DamagePhysical, 24}, // defense 0
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			target := dummy(em, 140, 100)
			target.AddComponent(&components.CombatComponent{MagicResistance: 10})

			impact := Impact{TargetEntityID: target.ID, Attack: components.AttackSnapshot{DamageType: tt.damageType, Power: 24, Coefficient: 1}}
			NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), []Impact{impact})

			assert.Equal(t, 1000-tt.want, health(target))
		})
	}
}

// ghoul stands a level-3 elite ghoul at (x, y) with the health given and nothing
// to mitigate with.
func ghoul(em *ecs.EntityManager, x, y float64, hp int) *ecs.Entity {
	e := em.CreateEntity()
	e.AddComponent(&components.MonsterComponent{
		Archetype: components.MonsterArchetypeGhoul, Level: 3, Elite: true,
		Name: "Dread Ghoul", Action: components.MonsterActionIdle, FacingY: 1,
	})
	e.AddComponent(components.NewTransformComponent(x, y))
	e.AddComponent(components.NewVelocityComponent(0, 0, 90))
	e.AddComponent(components.NewHealthComponent(hp, hp))
	e.AddComponent(&components.CombatComponent{Attack: 8})
	return e
}

func monster(e *ecs.Entity) *components.MonsterComponent {
	c, _ := e.GetComponent(ecs.ComponentTypeEnemy)
	return c.(*components.MonsterComponent)
}

// lethal is a delver's hit big enough to kill anything in these tests.
func lethal(memberID uuid.UUID) components.AttackSnapshot {
	return components.AttackSnapshot{
		AttackerEntityID: uuid.New(), AttackerMemberID: memberID,
		DamageType: components.DamagePhysical, Power: 500, Coefficient: 1,
	}
}

// Two lethal hits in one tick: the first resolved takes it to 0 and is the
// killing blow; the second is discarded against a dead target. FS-77AB6 §Edge
// States "Concurrent kills".
func TestCombatSystem_TwoLethalHitsInOneTick_OneKillRecordForTheFirst(t *testing.T) {
	em := ecs.NewEntityManager()
	g := ghoul(em, 140, 100, 30)
	first, second := uuid.New(), uuid.New()

	kills := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), []Impact{
		{Attack: lethal(first), TargetEntityID: g.ID},
		{Attack: lethal(second), TargetEntityID: g.ID},
	})

	require.Len(t, kills, 1)
	assert.Equal(t, first, kills[0].KillerMemberID)
	assert.Equal(t, 0, health(g))
}

func TestCombatSystem_KillRecordCarriesTheMonsterKillerPlaceAndFloor(t *testing.T) {
	em := ecs.NewEntityManager()
	em.CreateEntity().AddComponent(components.NewFloorComponent(2, 3))
	g := ghoul(em, 140, 100, 30)
	killer := uuid.New()

	kills := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), []Impact{
		{Attack: lethal(killer), TargetEntityID: g.ID},
	})

	require.Len(t, kills, 1)
	assert.Equal(t, KillRecord{
		MonsterEntityID: g.ID,
		Archetype:       components.MonsterArchetypeGhoul,
		Level:           3,
		Elite:           true,
		Boss:            false,
		KillerMemberID:  killer,
		X:               140,
		Y:               100,
		Floor:           2,
	}, kills[0])
}

func TestCombatSystem_WorldWithoutFloorsRecordsFloorOne(t *testing.T) {
	em := ecs.NewEntityManager()
	g := ghoul(em, 140, 100, 30)

	kills := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), []Impact{
		{Attack: lethal(uuid.New()), TargetEntityID: g.ID},
	})

	require.Len(t, kills, 1)
	assert.Equal(t, 1, kills[0].Floor)
}

func TestCombatSystem_NonLethalHitRecordsTheLastAttackerButNoKill(t *testing.T) {
	em := ecs.NewEntityManager()
	g := ghoul(em, 140, 100, 1000)
	hit := lethal(uuid.New())

	kills := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), []Impact{
		{Attack: hit, TargetEntityID: g.ID},
	})

	assert.Empty(t, kills)
	assert.Equal(t, hit.AttackerEntityID, monster(g).LastAttacker)
}

// A dead monster takes no more hits, so it is never recorded twice, however long
// it lies there.
func TestCombatSystem_DeadMonsterIsNeverRecordedAgain(t *testing.T) {
	em := ecs.NewEntityManager()
	g := ghoul(em, 140, 100, 30)
	combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)

	first := combat.Update(tickSeconds, em.GetAllEntities(), []Impact{{Attack: lethal(uuid.New()), TargetEntityID: g.ID}})
	later := combat.Update(tickSeconds, em.GetAllEntities(), []Impact{{Attack: lethal(uuid.New()), TargetEntityID: g.ID}})

	assert.Len(t, first, 1)
	assert.Empty(t, later)
}

func TestCombatSystem_MonstersNeverDamageMonsters(t *testing.T) {
	em := ecs.NewEntityManager()
	striker := ghoul(em, 100, 100, 100)
	victim := ghoul(em, 140, 100, 100)

	// a monster's strike, however it is delivered, carries what the monster brought
	strike := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).snapshot(striker, attackTable[components.AttackTargeted])
	require.True(t, strike.FromMonster)

	kills := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), []Impact{
		{Attack: strike, TargetEntityID: victim.ID},
	})

	assert.Empty(t, kills)
	assert.Equal(t, 100, health(victim))
	assert.Equal(t, uuid.Nil, monster(victim).LastAttacker)
}

func TestCombatSystem_MonsterStillDamagesDelvers(t *testing.T) {
	em := ecs.NewEntityManager()
	striker := ghoul(em, 100, 100, 100)
	target := delver(em, 140, 100)

	strike := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).snapshot(striker, attackTable[components.AttackTargeted])
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), []Impact{
		{Attack: strike, TargetEntityID: target.ID},
	})

	assert.Less(t, health(target), 150)
}

// An intent's Coefficient bends only a monster strike (a demon's slam). On any
// other kind it is ignored: a delver's attack resolves at its row's coefficient
// whatever the intent carries. FS-VHGE7 §B R16.
func TestCombatSystem_IntentCoefficient_IsIgnoredButOnAMonsterStrike(t *testing.T) {
	tests := []struct {
		name   string
		intent components.AttackIntent
	}{
		{"targeted attack", components.AttackIntent{Kind: components.AttackTargeted}},
		{"slash", components.AttackIntent{Kind: components.AttackSlash, TargetX: 200, TargetY: 100}},
		{"cut", components.AttackIntent{Kind: components.AttackCut, TargetX: 200, TargetY: 100}},
		{"fireball", components.AttackIntent{Kind: components.AttackFireball, TargetX: 300, TargetY: 100}},
	}

	// outcome resolves the intent with the coefficient given: the target's
	// health and the coefficients of any shots fired
	outcome := func(intent components.AttackIntent, coefficient float64) (int, []float64) {
		em := ecs.NewEntityManager()
		attacker := delver(em, 100, 100)
		target := dummy(em, 150, 100)
		intent.TargetEntityID = target.ID
		intent.Coefficient = coefficient
		intend(attacker, intent)
		NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

		var shots []float64
		for _, p := range projectiles(em) {
			shots = append(shots, p.Attack.Coefficient)
		}
		return health(target), shots
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			wantHealth, wantShots := outcome(tt.intent, 0)
			require.True(t, wantHealth < 1000 || len(wantShots) > 0, "the attack resolved")
			gotHealth, gotShots := outcome(tt.intent, 50)

			assert.Equal(t, wantHealth, gotHealth)
			assert.Equal(t, wantShots, gotShots)
		})
	}

	t.Run("monster strike", func(t *testing.T) {
		strike := func(coefficient float64) int {
			em := ecs.NewEntityManager()
			striker := ghoul(em, 100, 100, 100)
			striker.AddComponent(components.NewAttackIntentComponent())
			target := delver(em, 140, 100)
			intend(striker, components.AttackIntent{Kind: components.AttackMonsterStrike, TargetEntityID: target.ID, Coefficient: coefficient})
			NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)
			return 150 - health(target)
		}

		assert.Greater(t, strike(2), strike(0), "a slam lands at its multiple")
	})
}

// The projectile's owner may be long gone; the snapshot still names them.
func TestCombatSystem_KillCreditGoesToAGoneProjectileOwner(t *testing.T) {
	em := ecs.NewEntityManager()
	g := ghoul(em, 140, 100, 30)
	owner := uuid.New()
	shot := lethal(owner) // its AttackerEntityID exists nowhere in the world

	kills := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), []Impact{
		{Attack: shot, TargetEntityID: g.ID},
	})

	require.Len(t, kills, 1)
	assert.Equal(t, owner, kills[0].KillerMemberID)
}

// Only abilities cost; left-click attacks and monster strikes are free.
// FS-8AY7S §Requirements 8–9.
func TestAttackCost_OnlyAbilitiesCost(t *testing.T) {
	tests := []struct {
		kind components.AttackKind
		want int
	}{
		{components.AttackDash, 40},
		{components.AttackTripleFireball, 25},
		{components.AttackShadowShot, 100},
		{components.AttackSlash, 0},
		{components.AttackArrow, 0},
		{components.AttackFireball, 0},
		{components.AttackTargeted, 0},
		{components.AttackMonsterStrike, 0},
		{components.AttackParry, 0}, // free: the whiff lockout limits it
		{components.AttackCut, 0},
		{components.AttackRiposte, 3}, // every parry charge; armed only, never cast
	}

	for _, tt := range tests {
		t.Run(string(tt.kind), func(t *testing.T) {
			assert.Equal(t, tt.want, AttackCost(tt.kind))
		})
	}
}

// A cast is affordable when current ≥ cost: one short does nothing at all, and
// exactly enough pays exactly the cost and leaves 0 over it. FS-8AY7S
// §Requirements 10; §Edge States "Unaffordable press", "Exactly enough".
func TestCombatSystem_DashIsAffordableFromItsExactCost(t *testing.T) {
	tests := []struct {
		name        string
		stamina     int
		wantDash    bool
		wantStamina int
	}{
		{"one short", 39, false, 39},
		{"exactly enough", 40, true, 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			warrior := delver(em, 100, 100)
			resourceOf(warrior).Current = tt.stamina

			intend(warrior, components.AttackIntent{Kind: components.AttackDash, TargetX: 400, TargetY: 100})
			NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

			assert.Equal(t, tt.wantDash, dashing(warrior), "charge started")
			assert.Equal(t, tt.wantStamina, pool(warrior))
			assert.Equal(t, tt.wantDash, cooldownOf(warrior, components.AttackDash) > 0, "cooldown set")
		})
	}
}

// A full stamina pool holds two dashes back to back; the third is refused
// until regen covers its cost. FS-8AY7S §Requirements 3, 5, 9–10.
func TestCombatSystem_FullStaminaHoldsTwoDashes(t *testing.T) {
	em := ecs.NewEntityManager()
	warrior := delver(em, 100, 100)
	combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)
	regen := NewResourceSystem(0)
	dashCooldown := attackTable[components.AttackDash].cooldown

	// waitOut runs the world's ticks with no cast until the dash is off cooldown
	waitOut := func() {
		for cooldownOf(warrior, components.AttackDash) > 0 {
			combat.Update(worldTick, em.GetAllEntities(), nil)
		}
	}

	// pinned between casts so the two come out of the full pool alone
	for i := range 2 {
		before := pool(warrior)
		dashToward(warrior, 400, 100)
		combat.Update(worldTick, em.GetAllEntities(), nil)
		require.Equal(t, before-40, pool(warrior), "dash %d paid", i+1)
		waitOut()
	}
	require.Equal(t, 20, pool(warrior))

	dashToward(warrior, 400, 100)
	combat.Update(worldTick, em.GetAllEntities(), nil)
	assert.Equal(t, 20, pool(warrior), "the third is refused")
	assert.Zero(t, cooldownOf(warrior, components.AttackDash))

	// 30 ticks, 1 s of regen at the delver's 20/s, covers it
	for range 30 {
		regen.Update(worldTick, em.GetAllEntities())
	}
	require.Equal(t, 40, pool(warrior))
	dashToward(warrior, 400, 100)
	combat.Update(worldTick, em.GetAllEntities(), nil)
	assert.Equal(t, 0, pool(warrior), "regen covered the third")
	assert.InDelta(t, dashCooldown, cooldownOf(warrior, components.AttackDash), 1e-9)
}

// One Shadow Shot empties a full pool, and the next waits on regen (5 s at
// the delver's 20/s), not on the 1.2 s cooldown. FS-JTNPR §Requirements 1, 5
// (amended 2026-10-30); FS-8AY7S §Change: A cost never exceeds the class's
// base pool P2.
func TestCombatSystem_ShadowShotEmptiesTheStaminaPool(t *testing.T) {
	em := ecs.NewEntityManager()
	archer := delver(em, 100, 100)
	combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)
	regen := NewResourceSystem(0)
	shoot := func() {
		intend(archer, components.AttackIntent{Kind: components.AttackShadowShot, TargetX: 400, TargetY: 100})
		combat.Update(worldTick, em.GetAllEntities(), nil)
	}

	shoot()
	require.Len(t, projectiles(em), 1)
	require.Equal(t, 0, pool(archer), "one shot takes all 100")

	// the archer asks for a shot every tick while the pool refills
	elapsed := 0.0
	for len(projectiles(em)) == 1 && elapsed < 10 {
		regen.Update(worldTick, em.GetAllEntities())
		elapsed += worldTick
		shoot()
	}

	assert.Len(t, projectiles(em), 2)
	assert.InDelta(t, 5.0, elapsed, 0.1, "the second shot waits for the pool to be full")
}

// A targeted cast that resolves to nothing costs nothing, whatever its row's
// cost. No targeted row costs today, so one is stood in for the test.
// FS-8AY7S §Requirements 10.
func TestCombatSystem_TargetedCastAtNothingCostsNothing(t *testing.T) {
	const costed components.AttackKind = "test_costed_strike"
	attackTable[costed] = attackSpec{
		delivery: deliverTargeted, damageType: components.DamagePhysical, scaling: scaleStrength,
		coefficient: 1, cost: 30, cooldown: 0.5, reach: targetedAttackRange,
	}
	t.Cleanup(func() { delete(attackTable, costed) })

	em := ecs.NewEntityManager()
	attacker := delver(em, 100, 100)
	farTarget := dummy(em, 900, 100)

	intend(attacker, components.AttackIntent{Kind: costed, TargetEntityID: farTarget.ID})
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	assert.Equal(t, 100, pool(attacker))
	assert.Zero(t, cooldownOf(attacker, costed))
}

// flight is a projectile in the world with where it is and how it moves.
type flight struct {
	shot     *components.ProjectileComponent
	at       *components.TransformComponent
	velocity *components.VelocityComponent
}

// flights is every projectile in the world.
func flights(em *ecs.EntityManager) []flight {
	var out []flight
	for _, e := range em.GetAllEntities() {
		c, ok := e.GetComponent(ecs.ComponentTypeProjectile)
		if !ok {
			continue
		}
		tc, _ := e.GetComponent(ecs.ComponentTypeTransform)
		vc, _ := e.GetComponent(ecs.ComponentTypeVelocity)
		out = append(out, flight{c.(*components.ProjectileComponent), tc.(*components.TransformComponent), vc.(*components.VelocityComponent)})
	}
	return out
}

// A monster's shot is fired as one projectile from where the monster stands at
// the aim, carrying the monster as it is then: its damage at level, physical,
// the base crit chance, from a monster. FS-B4SG9 §A R9.
func TestCombatSystem_MonsterShot_FiresOneProjectileWithTheMonstersSnapshot(t *testing.T) {
	em := ecs.NewEntityManager()
	a := archer(em, 100, 100)
	intend(a, components.AttackIntent{Kind: components.AttackMonsterShot, TargetX: 400, TargetY: 500})

	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	shots := flights(em)
	require.Len(t, shots, 1)
	arrow := shots[0]
	assert.Equal(t, components.AttackSnapshot{
		AttackerEntityID: a.ID,
		Kind:             components.AttackMonsterShot,
		DamageType:       components.DamagePhysical,
		Power:            7,
		Coefficient:      1,
		CritChance:       BaseCritChance,
		FromMonster:      true,
	}, arrow.shot.Attack)
	assert.Equal(t, a.ID, arrow.shot.OwnerEntityID)
	assert.Equal(t, "bone_arrow", arrow.shot.ProjectileType)
	assert.Equal(t, 420.0, arrow.shot.Speed)
	assert.Equal(t, 8.0, arrow.shot.Radius)
	assert.Equal(t, 850.0, arrow.shot.MaxDistance)
	assert.Zero(t, arrow.shot.PierceLeft)

	assert.Equal(t, 100.0, arrow.at.X)
	assert.Equal(t, 100.0, arrow.at.Y)
	// the aim is (300, 400) away: 420 px/s along (0.6, 0.8)
	assert.InDelta(t, 252.0, arrow.velocity.VX, 1e-9)
	assert.InDelta(t, 336.0, arrow.velocity.VY, 1e-9)
}

// The projectile is the monster's own shot, whatever its archetype: the type,
// speed, radius and max flight come from its component. FS-B4SG9 §A R1, R9.
func TestCombatSystem_MonsterShot_TakesItsProjectileFromTheMonster(t *testing.T) {
	em := ecs.NewEntityManager()
	spitter := ghoul(em, 100, 100, 100)
	spitter.AddComponent(components.NewAttackIntentComponent())
	m := monster(spitter)
	m.ShotProjectileType, m.ShotSpeed, m.ShotRadius, m.ShotMaxFlight = "spit", 200, 5, 300
	intend(spitter, components.AttackIntent{Kind: components.AttackMonsterShot, TargetX: 100, TargetY: 0})

	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	shots := flights(em)
	require.Len(t, shots, 1)
	assert.Equal(t, "spit", shots[0].shot.ProjectileType)
	assert.Equal(t, 200.0, shots[0].shot.Speed)
	assert.Equal(t, 5.0, shots[0].shot.Radius)
	assert.Equal(t, 300.0, shots[0].shot.MaxDistance)
	assert.InDelta(t, 0.0, shots[0].velocity.VX, 1e-9)
	assert.InDelta(t, -200.0, shots[0].velocity.VY, 1e-9)
}

// Only a monster with a shot fires one: the intent from a melee monster, or
// from a delver, does nothing.
func TestCombatSystem_MonsterShot_FromAnythingWithoutAShotFiresNothing(t *testing.T) {
	em := ecs.NewEntityManager()
	melee := ghoul(em, 100, 100, 100)
	melee.AddComponent(components.NewAttackIntentComponent())
	d := delver(em, 300, 100)
	for _, e := range []*ecs.Entity{melee, d} {
		intend(e, components.AttackIntent{Kind: components.AttackMonsterShot, TargetX: 200, TargetY: 100})
	}

	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	assert.Empty(t, projectiles(em))
}

// A dead monster's queued shot is dropped: killed as its wind-up ends, it
// looses nothing. FS-B4SG9 §A R12.
func TestCombatSystem_MonsterShot_FromADeadMonsterIsDropped(t *testing.T) {
	em := ecs.NewEntityManager()
	a := archer(em, 100, 100)
	intend(a, components.AttackIntent{Kind: components.AttackMonsterShot, TargetX: 400, TargetY: 100})
	hc, _ := a.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 0

	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	assert.Empty(t, projectiles(em))
}

func cooldownState(e *ecs.Entity, kind components.AttackKind) (remaining, total float64) {
	c, _ := e.GetComponent(ecs.ComponentTypeCooldown)
	cooldowns := c.(*components.CooldownComponent)
	return cooldowns.Remaining[kind], cooldowns.Total[kind]
}

// A resolved right-click keeps the length its cooldown started at, worn attack
// speed applied, beside the seconds left; both clear when it runs out.
// FS-Q18Q3 §A R1, R3.
func TestCombatSystem_Cooldown_KeepsTheLengthItStartedAt(t *testing.T) {
	tests := []struct {
		name        string
		kind        components.AttackKind
		attackSpeed int
		want        float64
	}{
		{"dash", components.AttackDash, 0, 0.4},
		{"triple fireball", components.AttackTripleFireball, 0, 0.4},
		{"shadow shot", components.AttackShadowShot, 0, 1.2},
		{"dash at +50% attack speed", components.AttackDash, 50, 0.4 / 1.5},
		{"shadow shot at +50% attack speed", components.AttackShadowShot, 50, 1.2 / 1.5},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			attacker := delver(em, 100, 100)
			attacker.AddComponent(&components.GearBonusComponent{AttackSpeedPercent: tt.attackSpeed})
			combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)

			intend(attacker, components.AttackIntent{Kind: tt.kind, TargetX: 200, TargetY: 100})
			combat.Update(tickSeconds, em.GetAllEntities(), nil)

			remaining, total := cooldownState(attacker, tt.kind)
			assert.InDelta(t, tt.want, remaining, 1e-9, "the tick it resolves")
			assert.InDelta(t, tt.want, total, 1e-9)

			combat.Update(tickSeconds, em.GetAllEntities(), nil)
			remaining, total = cooldownState(attacker, tt.kind)
			assert.InDelta(t, tt.want-tickSeconds, remaining, 1e-9, "falls tick by tick")
			assert.InDelta(t, tt.want, total, 1e-9, "the length it started at stays put")

			// one tick past its length, so float drift in the count cannot leave a sliver
			for range int(math.Ceil(tt.want / tickSeconds)) {
				combat.Update(tickSeconds, em.GetAllEntities(), nil)
			}
			remaining, total = cooldownState(attacker, tt.kind)
			assert.Zero(t, remaining, "run out")
			assert.Zero(t, total, "nothing runs")
		})
	}
}

// Taking the attack-speed gear off mid-cooldown leaves the running cooldown's
// starting length alone; the next cast takes the new length. FS-Q18Q3 §A R3.
func TestCombatSystem_Cooldown_GearSwapMidCooldownLeavesItsTotal(t *testing.T) {
	em := ecs.NewEntityManager()
	attacker := delver(em, 100, 100)
	gear := &components.GearBonusComponent{AttackSpeedPercent: 50}
	attacker.AddComponent(gear)
	combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)

	intend(attacker, components.AttackIntent{Kind: components.AttackDash, TargetX: 200, TargetY: 100})
	combat.Update(tickSeconds, em.GetAllEntities(), nil)

	gear.AttackSpeedPercent = 0
	combat.Update(tickSeconds, em.GetAllEntities(), nil)

	_, total := cooldownState(attacker, components.AttackDash)
	assert.InDelta(t, 0.4/1.5, total, 1e-9)
}

// A cast refused for its cost starts no cooldown, so nothing reaches the wire.
// FS-8AY7S §Requirements 10, FS-Q18Q3 §Acceptance Criteria.
func TestCombatSystem_Cooldown_RefusedCastStartsNone(t *testing.T) {
	em := ecs.NewEntityManager()
	attacker := delver(em, 100, 100)
	resourceOf(attacker).Current = 99 // one short of Shadow Shot's 100

	intend(attacker, components.AttackIntent{Kind: components.AttackShadowShot, TargetX: 200, TargetY: 100})
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	remaining, total := cooldownState(attacker, components.AttackShadowShot)
	assert.Zero(t, remaining)
	assert.Zero(t, total)
}

// earthbreakerWarrior is a delver seated as a warrior naming Earthbreaker,
// holding the warrior tree's tier-3 node when held is true.
func earthbreakerWarrior(em *ecs.EntityManager, x, y float64, held bool) *ecs.Entity {
	e := delver(em, x, y)
	e.AddComponent(components.NewTreeAbilityComponent(components.AttackEarthbreaker, "warrior.t3"))
	ranks := passivetree.Ranks{"warrior.r1": 1}
	if held {
		ranks["warrior.t3"] = 1
	}
	e.AddComponent(components.NewPassiveRanksComponent(ranks))
	return e
}

func slam(e *ecs.Entity) {
	intend(e, components.AttackIntent{Kind: components.AttackEarthbreaker, TargetX: 400, TargetY: 100})
}

// A warrior with the node, 100 stamina and off cooldown slams everything within
// 90 px all round: physical, 1.5 on Strength. 40 is spent and 10 s starts.
// FS-04EEA §B R8–R9, §A R4–R5.
func TestCombatSystem_Earthbreaker_HitsEveryValidTargetWithin90AllRound(t *testing.T) {
	em := ecs.NewEntityManager()
	warrior := earthbreakerWarrior(em, 100, 100, true)
	east := dummy(em, 160, 100)
	west := dummy(em, 15, 100) // 85 px behind the aim
	x, y := offAim(100, 100, 89, 100)
	south := dummy(em, x, y)
	tooFar := dummy(em, 195, 100)

	slam(warrior)
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	hit := int(RawDamage(12, 1.5, 8) + 0.5)
	assert.Equal(t, 1000-hit, health(east))
	assert.Equal(t, 1000-hit, health(west))
	assert.Equal(t, 1000-hit, health(south))
	assert.Equal(t, 1000, health(tooFar), "95 px is beyond the slam")
	assert.Equal(t, 150, health(warrior), "never its own caster")
	assert.Equal(t, 40, pool(warrior))
	remaining, total := cooldownState(warrior, components.AttackEarthbreaker)
	assert.InDelta(t, 10, remaining, 1e-9)
	assert.InDelta(t, 10, total, 1e-9)
}

// The slam scales on Strength alone, worn Strength added, as the slash does.
// FS-04EEA §B R9 (integrator correction 2026-11-21).
func TestCombatSystem_Earthbreaker_ScalesOnStrengthWithWornStrength(t *testing.T) {
	em := ecs.NewEntityManager()
	warrior := earthbreakerWarrior(em, 100, 100, true)
	warrior.AddComponent(&components.GearBonusComponent{Strength: 4, Agility: 30})
	combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)

	attack := combat.snapshot(warrior, attackTable[components.AttackEarthbreaker])
	assert.Equal(t, components.DamagePhysical, attack.DamageType)
	assert.Equal(t, 1.5, attack.Coefficient)
	assert.Equal(t, 12.0, attack.ScalingStat, "Strength 8 + worn 4; Agility counts for nothing")
}

// A tree-ability cast is refused outright unless the caster's class names it
// and they hold the tier-3 node: no effect, no cost, no cooldown.
// FS-04EEA §A R3; §Edge States "Tier-3 node not held", "Wrong class's id".
func TestCombatSystem_TreeAbility_RefusedWithoutTheClassOrTheNode(t *testing.T) {
	tests := []struct {
		name   string
		caster func(em *ecs.EntityManager) *ecs.Entity
	}{
		{"a warrior without the node", func(em *ecs.EntityManager) *ecs.Entity {
			return earthbreakerWarrior(em, 100, 100, false)
		}},
		{"another class holding its own node", func(em *ecs.EntityManager) *ecs.Entity {
			e := delver(em, 100, 100)
			e.AddComponent(components.NewTreeAbilityComponent(components.AttackBlink, "mage.t3"))
			e.AddComponent(components.NewPassiveRanksComponent(passivetree.Ranks{"mage.t3": 1}))
			return e
		}},
		{"a class naming none", func(em *ecs.EntityManager) *ecs.Entity {
			e := delver(em, 100, 100)
			e.AddComponent(components.NewPassiveRanksComponent(passivetree.Ranks{"warrior.t3": 1}))
			return e
		}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			caster := tt.caster(em)
			target := dummy(em, 150, 100)

			slam(caster)
			NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

			assert.Equal(t, 1000, health(target))
			assert.Equal(t, 100, pool(caster))
			remaining, total := cooldownState(caster, components.AttackEarthbreaker)
			assert.Zero(t, remaining)
			assert.Zero(t, total)
			assert.False(t, caster.HasComponent(ecs.ComponentTypeAttackPin))
		})
	}
}

// Inside its cooldown or short of its 60 stamina the slam does nothing and
// spends nothing. FS-04EEA §A R4.
func TestCombatSystem_Earthbreaker_RefusedInsideItsCooldownOrUnder60(t *testing.T) {
	t.Run("inside its cooldown", func(t *testing.T) {
		em := ecs.NewEntityManager()
		warrior := earthbreakerWarrior(em, 100, 100, true)
		combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)
		slam(warrior)
		combat.Update(tickSeconds, em.GetAllEntities(), nil)
		target := dummy(em, 150, 100)
		// refilled so only the cooldown can refuse the second: one slam
		// leaves too little for another
		resourceOf(warrior).Current = 100

		slam(warrior)
		combat.Update(tickSeconds, em.GetAllEntities(), nil)

		assert.Equal(t, 1000, health(target))
		assert.Equal(t, 100, pool(warrior))
	})
	t.Run("under 60 stamina", func(t *testing.T) {
		em := ecs.NewEntityManager()
		warrior := earthbreakerWarrior(em, 100, 100, true)
		resourceOf(warrior).Current = 59
		target := dummy(em, 150, 100)

		slam(warrior)
		NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

		assert.Equal(t, 1000, health(target))
		assert.Equal(t, 59, pool(warrior))
		remaining, _ := cooldownState(warrior, components.AttackEarthbreaker)
		assert.Zero(t, remaining)
	})
}

// A slam that hits nothing still pays and cools down. FS-04EEA §B R11.
func TestCombatSystem_Earthbreaker_HittingNothingStillSpendsAndCools(t *testing.T) {
	em := ecs.NewEntityManager()
	warrior := earthbreakerWarrior(em, 100, 100, true)

	slam(warrior)
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	assert.Equal(t, 40, pool(warrior))
	remaining, _ := cooldownState(warrior, components.AttackEarthbreaker)
	assert.InDelta(t, 10, remaining, 1e-9)
}

// Worn attack speed shortens the slam's cooldown as every cooldown's.
// FS-04EEA §A R6.
func TestCombatSystem_Earthbreaker_WornAttackSpeedShortensItsCooldown(t *testing.T) {
	em := ecs.NewEntityManager()
	warrior := earthbreakerWarrior(em, 100, 100, true)
	warrior.AddComponent(&components.GearBonusComponent{AttackSpeedPercent: 50})

	slam(warrior)
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	remaining, total := cooldownState(warrior, components.AttackEarthbreaker)
	assert.InDelta(t, 10/1.5, remaining, 1e-9)
	assert.InDelta(t, 10/1.5, total, 1e-9)
}

// A resolving slam starts the attack pin and stops a charge in flight.
// FS-04EEA §A R4.
func TestCombatSystem_Earthbreaker_StartsTheAttackPinAndEndsACharge(t *testing.T) {
	em := ecs.NewEntityManager()
	warrior := earthbreakerWarrior(em, 100, 100, true)
	combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)
	intend(warrior, components.AttackIntent{Kind: components.AttackDash, TargetX: 400, TargetY: 100})
	combat.Update(tickSeconds, em.GetAllEntities(), nil)
	require.True(t, warrior.HasComponent(ecs.ComponentTypeDash))
	warrior.RemoveComponent(ecs.ComponentTypeAttackPin)

	slam(warrior)
	combat.Update(tickSeconds, em.GetAllEntities(), nil)

	assert.False(t, warrior.HasComponent(ecs.ComponentTypeDash), "the charge ends where the body stands")
	assert.True(t, warrior.HasComponent(ecs.ComponentTypeAttackPin))
}

// With player damage off the slam passes over other delvers; on, it hits them.
// FS-04EEA §B R8.
func TestCombatSystem_Earthbreaker_DelversOnlyWithPlayerDamageOn(t *testing.T) {
	for _, tt := range []struct {
		damage PlayerDamage
		hit    bool
	}{{PlayerDamageOff, false}, {PlayerDamageOn, true}} {
		em := ecs.NewEntityManager()
		warrior := earthbreakerWarrior(em, 100, 100, true)
		other := delver(em, 150, 100)

		slam(warrior)
		NewCombatSystem(em, neverCrit, tt.damage, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

		assert.Equal(t, tt.hit, health(other) < 150, "player damage %v", tt.damage)
	}
}

// The held read answers only with the class naming it and the node held.
// FS-04EEA §A R3; FS-Q18Q3 §A R4.
func TestHeldTreeAbility(t *testing.T) {
	em := ecs.NewEntityManager()

	kind, held := HeldTreeAbility(earthbreakerWarrior(em, 0, 0, true))
	assert.True(t, held)
	assert.Equal(t, components.AttackEarthbreaker, kind)

	_, held = HeldTreeAbility(earthbreakerWarrior(em, 0, 0, false))
	assert.False(t, held, "no tier-3 node")

	nameless := delver(em, 0, 0)
	nameless.AddComponent(components.NewPassiveRanksComponent(passivetree.Ranks{"warrior.t3": 1}))
	_, held = HeldTreeAbility(nameless)
	assert.False(t, held, "a class naming none")
}

// A tree ability's cost, as the wire shows it: Earthbreaker's 60, and Settle
// the Debt's least, 1. FS-04EEA §A R5; FS-Q18Q3 §A R5.
func TestTreeAbilityCost(t *testing.T) {
	assert.Equal(t, 60, TreeAbilityCost(components.AttackEarthbreaker))
	assert.Equal(t, 1, TreeAbilityCost(components.AttackSettleTheDebt))
}

// The held tree ability's cooldown is its own, the mercenary's the cut's slot;
// none while it is not held. FS-04EEA §F R33; FS-Q18Q3 §A R4.
func TestTreeAbilityCooldown(t *testing.T) {
	em := ecs.NewEntityManager()
	combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)

	warrior := earthbreakerWarrior(em, 100, 100, true)
	remaining, total, ok := TreeAbilityCooldown(warrior)
	assert.True(t, ok)
	assert.Zero(t, remaining)
	assert.Zero(t, total)
	slam(warrior)
	combat.Update(tickSeconds, em.GetAllEntities(), nil)
	remaining, total, ok = TreeAbilityCooldown(warrior)
	assert.True(t, ok)
	assert.InDelta(t, 10, remaining, 1e-9)
	assert.InDelta(t, 10, total, 1e-9)

	_, _, ok = TreeAbilityCooldown(earthbreakerWarrior(em, 0, 0, false))
	assert.False(t, ok, "not held")

	merc := mercenary(em, 300, 300)
	merc.AddComponent(components.NewTreeAbilityComponent(components.AttackSettleTheDebt, "mercenary.t3"))
	merc.AddComponent(components.NewPassiveRanksComponent(passivetree.Ranks{"mercenary.t3": 1}))
	intend(merc, components.AttackIntent{Kind: components.AttackCut, TargetX: 400, TargetY: 300})
	combat.Update(tickSeconds, em.GetAllEntities(), nil)
	remaining, total, ok = TreeAbilityCooldown(merc)
	assert.True(t, ok)
	assert.InDelta(t, 0.25, remaining, 1e-9, "the cut's slot")
	assert.InDelta(t, 0.25, total, 1e-9)
}

// Every monster the slam hits and leaves alive is stunned: 1.0 s, or 0.5 s on
// a boss, a champion included, and reads `stunned` from the tick it lands.
// FS-04EEA §B R10, §C R17.
func TestCombatSystem_Earthbreaker_StunsWhatItLeavesAlive(t *testing.T) {
	tests := []struct {
		name string
		mark func(m *components.MonsterComponent)
		want float64
	}{
		{"a monster", func(*components.MonsterComponent) {}, 1.0},
		{"a boss", func(m *components.MonsterComponent) { m.Boss = true }, 0.5},
		{"a champion", func(m *components.MonsterComponent) { m.Boss, m.Champion = true, true }, 0.5},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			warrior := earthbreakerWarrior(em, 100, 100, true)
			g := ghoul(em, 160, 100, 1000)
			tt.mark(monster(g))

			slam(warrior)
			NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

			require.Less(t, health(g), 1000)
			assert.Equal(t, tt.want, monster(g).StunRemaining)
			assert.Equal(t, components.MonsterActionStunned, monster(g).Action)
		})
	}
}

// A monster the slam kills is not stunned, and one already dead is refused
// before the roll and stunned by nothing; nor does any other hit stun.
// FS-04EEA §B R10, §C R12.
func TestCombatSystem_Earthbreaker_StunsNothingItKillsOrIsRefused(t *testing.T) {
	em := ecs.NewEntityManager()
	warrior := earthbreakerWarrior(em, 100, 100, true)
	killed := ghoul(em, 160, 100, 20)
	dead := ghoul(em, 40, 100, 1000)
	hc, _ := dead.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 0
	slashed := ghoul(em, 400, 100, 1000)
	slasher := delver(em, 360, 100)

	slam(warrior)
	intend(slasher, components.AttackIntent{Kind: components.AttackSlash, TargetX: 400, TargetY: 100})
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	assert.Zero(t, health(killed))
	assert.Zero(t, monster(killed).StunRemaining, "the hit that kills does not stun")
	assert.Zero(t, monster(dead).StunRemaining)
	require.Less(t, health(slashed), 1000)
	assert.Zero(t, monster(slashed).StunRemaining, "only Earthbreaker stuns")
	assert.Equal(t, components.MonsterActionIdle, monster(slashed).Action)
}

// A Blightborn the slam kills lies dead, unstunned, and its death burst's fuse
// burns on to land. FS-04EEA §C R14; §Edge States "Stun on a death burst".
func TestCombatSystem_Earthbreaker_KilledBlightbornStillBursts(t *testing.T) {
	em := ecs.NewEntityManager()
	warrior := sturdy(earthbreakerWarrior(em, 100, 100, true))
	b := blightborn(em, 160, 100)
	hc, _ := b.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 20

	slam(warrior)
	burstOut(em, ticks(0.8)+1)

	assert.Equal(t, components.MonsterActionDead, monster(b).Action)
	assert.Zero(t, monster(b).StunRemaining)
	assert.Less(t, health(warrior), 100000, "the burst lands on the warrior")
}

// A slam's stun reads `stunned` on every tick of its 1.0 s, the landing tick
// first, then the monster goes back to what it does. FS-04EEA §C R17.
func TestCombatSystem_Earthbreaker_StunnedForTheStunsLength(t *testing.T) {
	em := ecs.NewEntityManager()
	warrior := earthbreakerWarrior(em, 100, 100, true)
	g := hunter(em, 140, 100)
	monster(g).AttackCooldown = 5 // so it stands idle at the end, in reach
	hc, _ := g.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 1000
	ai := NewMonsterAISystem(firstRoll, nil)
	combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)

	slam(warrior)
	stunnedTicks := 0
	for range ticks(1.5) {
		entities := em.GetAllEntities()
		ai.Update(tickSeconds, entities)
		combat.Update(tickSeconds, entities, nil)
		if monster(g).Action == components.MonsterActionStunned {
			stunnedTicks++
		}
	}

	assert.Equal(t, 60, stunnedTicks, "1.0 s at 60 ticks a second")
	assert.Equal(t, components.MonsterActionIdle, monster(g).Action)
}
