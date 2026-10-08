package systems

import (
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
// Int 9) at (x, y) with 100 MP.
func delver(em *ecs.EntityManager, x, y float64) *ecs.Entity {
	e := em.CreateEntity()
	e.AddComponent(components.NewPlayerComponent(uuid.New(), "warrior", "Wren", false))
	e.AddComponent(components.NewTransformComponent(x, y))
	e.AddComponent(components.NewHealthComponent(150, 150))
	e.AddComponent(components.NewManaComponent(100, 100))
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

func mana(e *ecs.Entity) int {
	c, _ := e.GetComponent(ecs.ComponentTypeMana)
	return c.(*components.ManaComponent).CurrentMana
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

func TestCombatSystem_CooldownIgnoresRequestsAndSpendsNoMana(t *testing.T) {
	tests := []struct {
		name     string
		intent   components.AttackIntent
		cooldown float64
		manaCost int
	}{
		{"targeted attack", components.AttackIntent{Kind: components.AttackTargeted}, 0.5, 0},
		{"slash", components.AttackIntent{Kind: components.AttackSlash, TargetX: 200, TargetY: 100}, 0.25, 0},
		{"triple arrow", components.AttackIntent{Kind: components.AttackTripleArrow, TargetX: 200, TargetY: 100}, 0.4, 10},
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
			hpAfterFirst, mpAfterFirst, shotsAfterFirst := health(target), mana(attacker), len(projectiles(em))
			assert.Equal(t, 100-tt.manaCost, mpAfterFirst)

			// inside the cooldown: nothing at all happens
			intend(attacker, intent)
			combat.Update(tickSeconds, em.GetAllEntities(), nil)
			assert.Equal(t, hpAfterFirst, health(target))
			assert.Equal(t, mpAfterFirst, mana(attacker), "a refused request spends no MP")
			assert.Equal(t, shotsAfterFirst, len(projectiles(em)))

			// once the cooldown has run out the request goes through again
			for elapsed := 0.0; elapsed < tt.cooldown; elapsed += tickSeconds {
				combat.Update(tickSeconds, em.GetAllEntities(), nil)
			}
			intend(attacker, intent)
			combat.Update(tickSeconds, em.GetAllEntities(), nil)
			assert.Equal(t, 100-2*tt.manaCost, mana(attacker))
			if tt.manaCost == 0 {
				assert.Less(t, health(target), hpAfterFirst)
			} else {
				assert.Greater(t, len(projectiles(em)), shotsAfterFirst)
			}
		})
	}
}

func TestCombatSystem_NotEnoughManaDoesNothing(t *testing.T) {
	em := ecs.NewEntityManager()
	attacker := delver(em, 100, 100)
	mc, _ := attacker.GetComponent(ecs.ComponentTypeMana)
	mc.(*components.ManaComponent).CurrentMana = 9

	intend(attacker, components.AttackIntent{Kind: components.AttackTripleArrow, TargetX: 200, TargetY: 100})
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	assert.Equal(t, 9, mana(attacker))
	assert.Empty(t, projectiles(em))
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
		{"triple arrow", components.AttackTripleArrow, 3, components.DamagePhysical, 8, "arrow"},
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
					ScalingStat:      tt.stat,
					CritChance:       CritChance(0.1),
				}, p.Attack)
			}
		})
	}
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

func TestCombatSystem_DashMovesAndCostsMana(t *testing.T) {
	em := ecs.NewEntityManager()
	attacker := delver(em, 100, 100)

	intend(attacker, components.AttackIntent{Kind: components.AttackDash, TargetX: 400, TargetY: 100})
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	tc, _ := attacker.GetComponent(ecs.ComponentTypeTransform)
	assert.InDelta(t, 280, tc.(*components.TransformComponent).X, 1e-9)
	assert.Equal(t, 90, mana(attacker))
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
		{"arrow", components.AttackArrow, true},
		{"power_shot", components.AttackArrow, true},
		{"shoot", components.AttackArrow, true},
		{"fireball", components.AttackFireball, true},
		{"triple_arrow", components.AttackTripleArrow, true},
		{"multishot_arrow", components.AttackTripleArrow, true},
		{"triple_fireball", components.AttackTripleFireball, true},
		{"multishot_fireball", components.AttackTripleFireball, true},
		{"dash", components.AttackDash, true},
		{"sprint", components.AttackDash, true},
		{"attack", "", false}, // the targeted attack is its own action, not a skill
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
