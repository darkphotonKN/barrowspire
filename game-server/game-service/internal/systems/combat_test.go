package systems

import (
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
		{"shadow shot", components.AttackIntent{Kind: components.AttackShadowShot, TargetX: 200, TargetY: 100}, 1.2, 90},
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
			// refilled so only the cooldown can refuse what follows; one Shadow
			// Shot alone nearly drains the pool
			resourceOf(attacker).Current = 100

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
	resourceOf(attacker).Current = 89 // one short of Shadow Shot's 90
	cooldowns, _ := attacker.GetComponent(ecs.ComponentTypeCooldown)

	intend(attacker, components.AttackIntent{Kind: components.AttackShadowShot, TargetX: 200, TargetY: 100})
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	assert.Equal(t, 89, pool(attacker))
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
	for elapsed := 0.0; elapsed <= attackTable[components.AttackTargeted].cooldown; elapsed += tickSeconds {
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
	assert.Equal(t, 75, pool(attacker))
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
		{"parry", components.AttackParry, true}, // the merc's stance, no table row
		{"riposte", "", false},                  // armed on the server only
		{"attack", "", false},                   // the targeted attack is its own action, not a skill
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
		{components.AttackDash, 25},
		{components.AttackTripleFireball, 15},
		{components.AttackShadowShot, 90},
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
		{"one short", 24, false, 24},
		{"exactly enough", 25, true, 0},
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

// A full stamina pool holds four dashes back to back; the fifth is refused
// until regen covers its cost. FS-8AY7S §Requirements 3, 5, 9–10.
func TestCombatSystem_FullStaminaHoldsFourDashes(t *testing.T) {
	em := ecs.NewEntityManager()
	warrior := delver(em, 100, 100)
	combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)
	regen := NewResourceSystem()
	dashCooldown := attackTable[components.AttackDash].cooldown

	// waitOut runs the world's ticks with no cast until the dash is off cooldown
	waitOut := func() {
		for cooldownOf(warrior, components.AttackDash) > 0 {
			combat.Update(worldTick, em.GetAllEntities(), nil)
		}
	}

	// pinned between casts so the four come out of the full pool alone
	for i := range 4 {
		before := pool(warrior)
		dashToward(warrior, 400, 100)
		combat.Update(worldTick, em.GetAllEntities(), nil)
		require.Equal(t, before-25, pool(warrior), "dash %d paid", i+1)
		waitOut()
	}
	require.Equal(t, 0, pool(warrior))

	dashToward(warrior, 400, 100)
	combat.Update(worldTick, em.GetAllEntities(), nil)
	assert.Equal(t, 0, pool(warrior), "the fifth is refused")
	assert.Zero(t, cooldownOf(warrior, components.AttackDash))

	// 38 ticks, just over 1.25 s of regen at 20/s, covers it
	for range 38 {
		regen.Update(worldTick, em.GetAllEntities())
	}
	require.Equal(t, 25, pool(warrior))
	dashToward(warrior, 400, 100)
	combat.Update(worldTick, em.GetAllEntities(), nil)
	assert.Equal(t, 0, pool(warrior), "regen covered the fifth")
	assert.InDelta(t, dashCooldown, cooldownOf(warrior, components.AttackDash), 1e-9)
}

// One Shadow Shot nearly empties a full pool, and the next waits on regen
// (about 4 s at 20/s), not on the 1.2 s cooldown. FS-JTNPR §Requirements 1,
// 5 (amended 2026-10-30).
func TestCombatSystem_ShadowShotNearlyEmptiesTheStaminaPool(t *testing.T) {
	em := ecs.NewEntityManager()
	archer := delver(em, 100, 100)
	combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)
	regen := NewResourceSystem()
	shoot := func() {
		intend(archer, components.AttackIntent{Kind: components.AttackShadowShot, TargetX: 400, TargetY: 100})
		combat.Update(worldTick, em.GetAllEntities(), nil)
	}

	shoot()
	require.Len(t, projectiles(em), 1)
	require.Equal(t, 10, pool(archer), "one shot leaves 10 of 100")

	// the archer asks for a shot every tick while the pool refills
	elapsed := 0.0
	for len(projectiles(em)) == 1 && elapsed < 10 {
		regen.Update(worldTick, em.GetAllEntities())
		elapsed += worldTick
		shoot()
	}

	assert.Len(t, projectiles(em), 2)
	assert.InDelta(t, 4.0, elapsed, 0.1, "the second shot waits for the pool to be almost full")
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
