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

/*
	The worn uniques whose effects ride on combat: Gravewarden's Oath
	(melee_reflect), Lantern of the Drowned (pierce) and Ashwalk Greaves
	(burning_dash). FS-4R9M9 §Requirements 29, 34–36, 38.
*/

// piercingArrow is a delver's arrow fired at +x from (0, 0), able to hit one
// more distinct target after its first.
func piercingArrow(em *ecs.EntityManager) *ecs.Entity {
	attack := components.AttackSnapshot{
		AttackerEntityID: uuid.New(), AttackerMemberID: uuid.New(),
		DamageType: components.DamagePhysical, Power: 10, Coefficient: 1,
		Pierce: 1,
	}
	shot := em.CreateEntity()
	shot.AddComponent(components.NewTransformComponent(0, 0))
	shot.AddComponent(components.NewVelocityComponent(100, 0, 100))
	shot.AddComponent(components.NewProjectileComponent(attack, 100, 500, 8, "arrow"))
	return shot
}

// flyFor ticks only the ProjectileSystem for the seconds given, gathering every
// impact it reports.
func flyFor(em *ecs.EntityManager, seconds float64) []uuid.UUID {
	sys := NewProjectileSystem(em, PlayerDamageOff)
	var hit []uuid.UUID
	for i := 0; i < int(seconds/0.05); i++ {
		for _, impact := range sys.Update(0.05, em.GetAllEntities()) {
			hit = append(hit, impact.TargetEntityID)
		}
	}
	return hit
}

// A pierce-1 arrow hits two monsters in a line, never the same one twice, and
// is spent by the second. FS-4R9M9 §Requirements 35.
func TestProjectileSystem_Pierce_HitsTwoDistinctMonstersInALine(t *testing.T) {
	em := ecs.NewEntityManager()
	first := ghoul(em, 50, 0, 100)
	second := ghoul(em, 120, 0, 100)
	ghoul(em, 200, 0, 100)
	shot := piercingArrow(em)

	hit := flyFor(em, 3)

	assert.Equal(t, []uuid.UUID{first.ID, second.ID}, hit)
	_, flying := em.GetEntity(shot.ID)
	assert.False(t, flying, "the second hit spends the pierce and stops it")
}

// Pierce never carries a projectile through a wall. §Edge States "Pierce at a wall".
func TestProjectileSystem_Pierce_StopsAtAWall(t *testing.T) {
	em := ecs.NewEntityManager()
	first := ghoul(em, 50, 0, 100)
	wall := em.CreateEntity()
	wall.AddComponent(components.NewTransformComponent(100, -50))
	wall.AddComponent(&components.WallComponent{Width: 20, Height: 100})
	ghoul(em, 160, 0, 100)
	shot := piercingArrow(em)

	hit := flyFor(em, 3)

	assert.Equal(t, []uuid.UUID{first.ID}, hit)
	_, flying := em.GetEntity(shot.ID)
	assert.False(t, flying)
}

// What a projectile cannot hit it passes through without spending its pierce.
// §Edge States "Pierce through an invalid target".
func TestProjectileSystem_Pierce_InvalidTargetDoesNotSpendIt(t *testing.T) {
	em := ecs.NewEntityManager()
	corpse := ghoul(em, 50, 0, 100)
	hc, _ := corpse.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 0
	first := ghoul(em, 120, 0, 100)
	second := ghoul(em, 190, 0, 100)
	piercingArrow(em)

	hit := flyFor(em, 3)

	assert.Equal(t, []uuid.UUID{first.ID, second.ID}, hit)
}

// Without pierce a projectile still stops at its first hit.
func TestProjectileSystem_NoPierce_StopsAtTheFirstHit(t *testing.T) {
	em := ecs.NewEntityManager()
	first := ghoul(em, 50, 0, 100)
	ghoul(em, 120, 0, 100)
	shot := piercingArrow(em)
	pc, _ := shot.GetComponent(ecs.ComponentTypeProjectile)
	pc.(*components.ProjectileComponent).PierceLeft = 0

	hit := flyFor(em, 3)

	require.Equal(t, []uuid.UUID{first.ID}, hit)
}

// wearUnique puts a unique carrying the effect code into one of e's slots.
func wearUnique(em *ecs.EntityManager, e *ecs.Entity, slot func(*components.EquipmentComponent, *uuid.UUID), itemType types.ItemType, effectCode string) *ecs.Entity {
	item := wear(em, e, slot, itemType)
	ic, _ := item.GetComponent(ecs.ComponentTypeItem)
	ic.(*components.ItemComponent).UniqueEffectCode = effectCode
	return item
}

// A Lantern wearer's projectiles leave with one pierce; two Lanterns still give
// one. FS-4R9M9 §Requirements 29, 35.
func TestCombatSystem_PierceWorn_ProjectilesPierceOnceHoweverManyCopies(t *testing.T) {
	tests := []struct {
		name    string
		lantern int
		want    int
	}{
		{"none worn", 0, 0},
		{"one lantern", 1, 1},
		{"two lanterns", 2, 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			archer := delver(em, 100, 100)
			for _, slot := range []func(*components.EquipmentComponent, *uuid.UUID){ring1Slot, ring2Slot}[:tt.lantern] {
				wearUnique(em, archer, slot, types.ItemTypeRing, types.UniqueEffectPierce)
			}

			intend(archer, components.AttackIntent{Kind: components.AttackTripleArrow, TargetX: 300, TargetY: 100})
			NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

			shots := projectiles(em)
			require.Len(t, shots, 3)
			for _, shot := range shots {
				assert.Equal(t, tt.want, shot.PierceLeft)
			}
		})
	}
}

// striker stands a monster at (x, y) whose strike on an unequipped delver
// (defense 10) lands for 30: 36 × 100 / (100 + 2 × 10).
func striker(em *ecs.EntityManager, x, y float64, hp int) *ecs.Entity {
	e := ghoul(em, x, y, hp)
	e.AddComponent(&components.CombatComponent{Attack: 36})
	e.AddComponent(components.NewAttackIntentComponent())
	return e
}

func memberOf(e *ecs.Entity) uuid.UUID {
	pc, _ := e.GetComponent(ecs.ComponentTypePlayer)
	return pc.(*components.PlayerComponent).MemberID
}

// strikeOnce has the monster strike the delver and resolves one combat tick.
func strikeOnce(em *ecs.EntityManager, monster, target *ecs.Entity) []KillRecord {
	intend(monster, components.AttackIntent{Kind: components.AttackMonsterStrike, TargetEntityID: target.ID})
	return NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)
}

// A strike of 30 on a Gravewarden wearer sends 6 back at the striker,
// unmitigated. FS-4R9M9 §Requirements 34.
func TestCombatSystem_MeleeReflect_ReturnsAFifthOfTheStrike(t *testing.T) {
	em := ecs.NewEntityManager()
	wearer := delver(em, 100, 100)
	wearUnique(em, wearer, chestSlot, types.ItemTypeArmor, types.UniqueEffectMeleeReflect)
	troll := striker(em, 140, 100, 200)
	troll.AddComponent(&components.CombatComponent{Attack: 36, Defense: 50})

	kills := strikeOnce(em, troll, wearer)

	assert.Equal(t, 150-30, health(wearer))
	assert.Equal(t, 200-6, health(troll), "20% of 30, never mitigated by the striker's defense")
	assert.Empty(t, kills)
	assert.Equal(t, wearer.ID, monster(troll).LastAttacker)
}

// Without the Oath a strike sends nothing back.
func TestCombatSystem_MeleeReflect_NotWornReflectsNothing(t *testing.T) {
	em := ecs.NewEntityManager()
	wearer := delver(em, 100, 100)
	troll := striker(em, 140, 100, 200)

	strikeOnce(em, troll, wearer)

	assert.Equal(t, 200, health(troll))
}

// A reflected killing blow is a kill credited to the wearer. FS-4R9M9
// §Requirements 34; §Acceptance Criteria "Uniques" row 2.
func TestCombatSystem_MeleeReflect_KillIsCreditedToTheWearer(t *testing.T) {
	em := ecs.NewEntityManager()
	wearer := delver(em, 100, 100)
	wearUnique(em, wearer, chestSlot, types.ItemTypeArmor, types.UniqueEffectMeleeReflect)
	troll := striker(em, 140, 100, 5)

	kills := strikeOnce(em, troll, wearer)

	require.Len(t, kills, 1)
	assert.Equal(t, troll.ID, kills[0].MonsterEntityID)
	assert.Equal(t, memberOf(wearer), kills[0].KillerMemberID)
	assert.Equal(t, 0, health(troll))
}

// A small strike still reflects at least 1.
func TestCombatSystem_MeleeReflect_ReflectsAtLeastOne(t *testing.T) {
	em := ecs.NewEntityManager()
	wearer := delver(em, 100, 100)
	wearUnique(em, wearer, chestSlot, types.ItemTypeArmor, types.UniqueEffectMeleeReflect)
	troll := striker(em, 140, 100, 200)
	troll.AddComponent(&components.CombatComponent{Attack: 2})

	strikeOnce(em, troll, wearer)

	assert.Equal(t, 199, health(troll))
}

// A strike that kills the wearer reflects nothing: effects never fire from a
// dead wearer. FS-4R9M9 §Requirements 38.
func TestCombatSystem_MeleeReflect_DeadWearerReflectsNothing(t *testing.T) {
	em := ecs.NewEntityManager()
	wearer := delver(em, 100, 100)
	wearUnique(em, wearer, chestSlot, types.ItemTypeArmor, types.UniqueEffectMeleeReflect)
	hc, _ := wearer.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 10
	troll := striker(em, 140, 100, 200)

	strikeOnce(em, troll, wearer)

	assert.Equal(t, 0, health(wearer))
	assert.Equal(t, 200, health(troll))
}

// A delver's hit on a wearer (player damage on) is not a monster's strike and
// reflects nothing.
func TestCombatSystem_MeleeReflect_OnlyMonsterStrikesReflect(t *testing.T) {
	em := ecs.NewEntityManager()
	wearer := delver(em, 100, 100)
	wearUnique(em, wearer, chestSlot, types.ItemTypeArmor, types.UniqueEffectMeleeReflect)
	attacker := delver(em, 140, 100)

	intend(attacker, components.AttackIntent{Kind: components.AttackTargeted, TargetEntityID: wearer.ID})
	NewCombatSystem(em, neverCrit, PlayerDamageOn, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	assert.Less(t, health(wearer), 150)
	assert.Equal(t, 150, health(attacker))
}

// trails is every burning trail in the world.
func trails(em *ecs.EntityManager) []*ecs.Entity {
	var out []*ecs.Entity
	for _, e := range em.GetAllEntities() {
		if e.HasComponent(ecs.ComponentTypeBurningTrail) {
			out = append(out, e)
		}
	}
	return out
}

// dashAndBurn has an Ashwalk wearer at (100, 100) dash +x to (280, 100) on one
// combat tick, then keeps ticking combat for the seconds given, reporting every
// kill.
func dashAndBurn(em *ecs.EntityManager, wearer *ecs.Entity, seconds float64) []KillRecord {
	combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)
	intend(wearer, components.AttackIntent{Kind: components.AttackDash, TargetX: 400, TargetY: 100})
	kills := combat.Update(tickSeconds, em.GetAllEntities(), nil)
	for range int(math.Round(seconds / tickSeconds)) {
		kills = append(kills, combat.Update(tickSeconds, em.GetAllEntities(), nil)...)
	}
	return kills
}

// An Ashwalk wearer's dash leaves a trail along the path dashed.
// FS-4R9M9 §Requirements 36.
func TestCombatSystem_BurningDash_LeavesATrailAlongThePath(t *testing.T) {
	em := ecs.NewEntityManager()
	wearer := delver(em, 100, 100)
	wearUnique(em, wearer, legsSlot, types.ItemTypeArmor, types.UniqueEffectBurningDash)

	intend(wearer, components.AttackIntent{Kind: components.AttackDash, TargetX: 400, TargetY: 100})
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	laid := trails(em)
	require.Len(t, laid, 1)
	tc, _ := laid[0].GetComponent(ecs.ComponentTypeBurningTrail)
	trail := tc.(*components.BurningTrailComponent)
	assert.Equal(t, 100.0, trail.FromX)
	assert.Equal(t, 100.0, trail.FromY)
	assert.InDelta(t, 280.0, trail.ToX, 1e-9)
	assert.InDelta(t, 100.0, trail.ToY, 1e-9)
	assert.Equal(t, 30.0, trail.HalfWidth)
	assert.Equal(t, 3.0, trail.Remaining)
	assert.Equal(t, memberOf(wearer), trail.Attack.AttackerMemberID)
}

// A wearer has one live trail: a new dash replaces the one still burning from
// their last, and leaves another wearer's trail alone. FS-4R9M9 §Requirements 36
// (user decision 2026-10-09).
func TestCombatSystem_BurningDash_NewDashReplacesTheWearersLiveTrail(t *testing.T) {
	em := ecs.NewEntityManager()
	wearer := delver(em, 100, 100)
	wearUnique(em, wearer, legsSlot, types.ItemTypeArmor, types.UniqueEffectBurningDash)
	other := delver(em, 100, 600)
	wearUnique(em, other, legsSlot, types.ItemTypeArmor, types.UniqueEffectBurningDash)
	combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)

	intend(wearer, components.AttackIntent{Kind: components.AttackDash, TargetX: 400, TargetY: 100})
	intend(other, components.AttackIntent{Kind: components.AttackDash, TargetX: 400, TargetY: 600})
	combat.Update(tickSeconds, em.GetAllEntities(), nil)
	for range int(math.Round(0.5 / tickSeconds)) { // past the dash cooldown, both trails still burning
		combat.Update(tickSeconds, em.GetAllEntities(), nil)
	}
	require.Len(t, trails(em), 2)

	intend(wearer, components.AttackIntent{Kind: components.AttackDash, TargetX: 600, TargetY: 100})
	combat.Update(tickSeconds, em.GetAllEntities(), nil)

	byWearer := map[uuid.UUID][]*components.BurningTrailComponent{}
	for _, e := range trails(em) {
		tc, _ := e.GetComponent(ecs.ComponentTypeBurningTrail)
		trail := tc.(*components.BurningTrailComponent)
		byWearer[trail.Attack.AttackerEntityID] = append(byWearer[trail.Attack.AttackerEntityID], trail)
	}
	require.Len(t, byWearer[wearer.ID], 1, "one live trail per wearer")
	latest := byWearer[wearer.ID][0]
	assert.InDelta(t, 280.0, latest.FromX, 1e-9, "the new dash's path")
	assert.InDelta(t, 460.0, latest.ToX, 1e-9)
	assert.Len(t, byWearer[other.ID], 1, "another wearer's trail is untouched")
}

// Without the Greaves a dash leaves nothing.
func TestCombatSystem_BurningDash_NotWornLeavesNoTrail(t *testing.T) {
	em := ecs.NewEntityManager()
	wearer := delver(em, 100, 100)

	intend(wearer, components.AttackIntent{Kind: components.AttackDash, TargetX: 400, TargetY: 100})
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, em.GetAllEntities(), nil)

	assert.Empty(t, trails(em))
}

// The trail hits each monster within 30 px of the path every 0.5 s for 3 s, at
// power 4 + level with nothing scaling it; never a delver, never a monster off
// the path; then it is gone. FS-4R9M9 §Requirements 36.
func TestCombatSystem_BurningDash_BurnsMonstersInThePathEveryHalfSecondForThreeSeconds(t *testing.T) {
	em := ecs.NewEntityManager()
	wearer := delver(em, 100, 100)
	wearUnique(em, wearer, legsSlot, types.ItemTypeArmor, types.UniqueEffectBurningDash)
	inPath := ghoul(em, 200, 125, 1000)
	offPath := ghoul(em, 200, 140, 1000)
	ally := delver(em, 150, 100)

	dashAndBurn(em, wearer, 4)

	// six pulses (0, 0.5 … 2.5 s) of 4 + level 1 = 5, unmitigated by a ghoul's 0 MR
	assert.Equal(t, 1000-6*5, health(inPath))
	assert.Equal(t, 1000, health(offPath))
	assert.Equal(t, 150, health(ally))
	assert.Equal(t, wearer.ID, monster(inPath).LastAttacker)
	assert.Empty(t, trails(em), "the trail is gone after 3 s")
}

// A pulse at a monster is a magic hit, mitigated by magic resistance, at power
// 4 + the wearer's level.
func TestCombatSystem_BurningDash_PulseIsAMagicHitAtFourPlusLevel(t *testing.T) {
	em := ecs.NewEntityManager()
	wearer := delver(em, 100, 100)
	sc, _ := wearer.GetComponent(ecs.ComponentTypeStats)
	sc.(*components.StatsComponent).Level = 16
	wearUnique(em, wearer, legsSlot, types.ItemTypeArmor, types.UniqueEffectBurningDash)
	warded := ghoul(em, 200, 100, 1000)
	warded.AddComponent(&components.CombatComponent{Defense: 500, MagicResistance: 25})

	dashAndBurn(em, wearer, tickSeconds)

	// 20 × 100 / (100 + 2 × 25) = 13.3 → 13
	assert.Equal(t, 1000-13, health(warded))
}

// A trail kill is a kill credited to the wearer. FS-4R9M9 §Acceptance Criteria
// "Uniques" row 2.
func TestCombatSystem_BurningDash_KillIsCreditedToTheWearer(t *testing.T) {
	em := ecs.NewEntityManager()
	wearer := delver(em, 100, 100)
	wearUnique(em, wearer, legsSlot, types.ItemTypeArmor, types.UniqueEffectBurningDash)
	frail := ghoul(em, 200, 100, 5)

	kills := dashAndBurn(em, wearer, 1)

	require.Len(t, kills, 1)
	assert.Equal(t, frail.ID, kills[0].MonsterEntityID)
	assert.Equal(t, memberOf(wearer), kills[0].KillerMemberID)
}

// A trail goes out with its wearer: effects never fire from a dead or
// out-of-play wearer. FS-4R9M9 §Requirements 38.
func TestCombatSystem_BurningDash_WearerOutOfPlayPutsTheTrailOut(t *testing.T) {
	em := ecs.NewEntityManager()
	wearer := delver(em, 100, 100)
	wearUnique(em, wearer, legsSlot, types.ItemTypeArmor, types.UniqueEffectBurningDash)
	inPath := ghoul(em, 200, 100, 1000)
	combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)
	intend(wearer, components.AttackIntent{Kind: components.AttackDash, TargetX: 400, TargetY: 100})
	combat.Update(tickSeconds, em.GetAllEntities(), nil)

	escapeDelver(wearer)
	combat.Update(tickSeconds, em.GetAllEntities(), nil)

	assert.Equal(t, 1000, health(inPath))
	assert.Empty(t, trails(em))
}
