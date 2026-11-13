package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// pounceAbility and deathBurst are R11's Ravener and Blightborn abilities.
var (
	pounceAbility = components.MonsterAbility{
		Kind: components.MonsterAbilityPounce, Shape: components.AbilityLeap,
		MinRange: 120, MaxRange: 300, WindUp: 0.5, Cooldown: 6, Multiplier: 1.5, Radius: 60, LeapTime: 0.3,
	}
	deathBurst = components.MonsterAbility{
		Kind: components.MonsterAbilityBurst, Shape: components.AbilityDeathBurst,
		WindUp: 0.8, Multiplier: 2.0, Radius: 110,
	}
)

// ravener stands a ghoul-timed monster with the pounce at (x, y), its level
// damage 10.
func ravener(em *ecs.EntityManager, x, y float64) *ecs.Entity {
	e := hunter(em, x, y)
	m := monster(e)
	m.Archetype, m.Name = components.MonsterArchetypeRavener, "Ravener"
	m.Ability = pounceAbility
	cc, _ := e.GetComponent(ecs.ComponentTypeCombat)
	cc.(*components.CombatComponent).Attack = 10
	return e
}

// A Ravener with its pounce ready and a target 200 px off winds up 0.5 s on
// the point where the target stood, leaps there over 0.3 s and lands its
// 60 px area at 1.5 × its level damage; the target who moved off the point is
// missed, the one standing on it is hit. FS-C8VM7 §B R15, §Edge States.
func TestPounce_ClearLine_LeapsToTheAimedPointAndHitsThere(t *testing.T) {
	em := ecs.NewEntityManager()
	r := ravener(em, 500, 500)
	target := sturdy(delver(em, 700, 500))

	brawl(em, 1)
	m := monster(r)
	require.Equal(t, components.MonsterActionAbility, m.Action)
	assert.Equal(t, 700.0, m.AbilityPending.X, "aimed where its target stood")
	assert.InDelta(t, 0.8, m.AbilityPending.Remaining, 1e-9, "the wind-up and the leap until it lands")
	assert.Equal(t, 6.0, m.AbilityCooldown)

	moveTo(t, target, 700, 640) // the target steps off the point
	there := sturdy(delver(em, 700, 540))

	brawl(em, ticks(0.5)-1)
	assert.Equal(t, components.MonsterActionAbility, m.Action, "the action stays `ability` through the leap")
	assert.Greater(t, transformOf(t, r).X, 500.0, "it is in the air")
	assert.Less(t, transformOf(t, r).X, 700.0)

	brawl(em, ticks(0.3))

	assert.Equal(t, 700.0, transformOf(t, r).X, "it ends at the aimed point")
	assert.Equal(t, 500.0, transformOf(t, r).Y)
	assert.Equal(t, 100000, health(target), "the target who moved is missed")
	assert.Equal(t, 100000-mitigated(10, 1.5), health(there))
	assert.Zero(t, m.AbilityPending.Remaining)
}

// A pounce whose line is not clear for its body as the wind-up ends is called
// off with its cooldown spent: no leap, no hit, never off the walkable cells.
// Here the thin flight through the gap is in sight, but a body's width clips
// the rock. FS-C8VM7 §B R15.
func TestPounce_BlockedLine_IsCalledOffWithTheCooldownSpent(t *testing.T) {
	em := ecs.NewEntityManager()
	grid, _ := floorOf(t, em, behindAWall)
	r := ravener(em, 575, 150)
	d := sturdy(delver(em, 575, 400))
	ai := NewMonsterAISystem(firstRoll, grid)
	combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)
	run := func(n int) {
		for range n {
			entities := em.GetAllEntities()
			ai.Update(tickSeconds, entities)
			combat.Update(tickSeconds, entities, nil)
		}
	}

	run(1)
	require.Equal(t, components.MonsterActionAbility, monster(r).Action, "the pounce is in sight")
	run(ticks(0.8))

	assert.Equal(t, 575.0, transformOf(t, r).X, "no leap")
	assert.Equal(t, 150.0, transformOf(t, r).Y)
	assert.Equal(t, 100000, health(d))
	assert.Positive(t, monster(r).AbilityCooldown, "the cooldown is spent")
	assert.Zero(t, monster(r).AbilityPending.Remaining)
}

// blightborn stands a ghoul-timed monster with the death burst at (x, y), its
// level damage 9.
func blightborn(em *ecs.EntityManager, x, y float64) *ecs.Entity {
	e := hunter(em, x, y)
	m := monster(e)
	m.Archetype, m.Name = components.MonsterArchetypeBlightborn, "Blightborn"
	m.Ability = deathBurst
	cc, _ := e.GetComponent(ecs.ComponentTypeCombat)
	cc.(*components.CombatComponent).Attack = 9
	return e
}

// burstOut ticks a run's combat steps, the CombatSystem then the monster death
// step, for n ticks, gathering the kill records.
func burstOut(em *ecs.EntityManager, n int) []KillRecord {
	combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)
	deaths := NewMonsterDeathSystem(em, corpseLifetime)
	var kills []KillRecord
	for range n {
		entities := em.GetAllEntities()
		kills = append(kills, combat.Update(tickSeconds, entities, nil)...)
		deaths.Update(tickSeconds, entities)
	}
	return kills
}

// A Blightborn dies as every monster does, one kill record, then 0.8 s later
// its burst lands once on its corpse at 2 × the damage it had at its death,
// on whoever is inside, whatever stood there before. FS-C8VM7 §B R16.
func TestDeathBurst_LandsOnceOnTheCorpseAfterItsFuse(t *testing.T) {
	em := ecs.NewEntityManager()
	b := blightborn(em, 500, 500)
	near := sturdy(delver(em, 600, 500)) // inside the 110 px
	far := sturdy(delver(em, 650, 500))  // its body clear of it
	killer := uuid.New()

	kills := slay(em, killer, b)
	require.Len(t, kills, 1, "one kill record")
	assert.Equal(t, killer, kills[0].KillerMemberID)
	m := monster(b)
	assert.Equal(t, components.MonsterActionDead, m.Action)
	assert.InDelta(t, 0.8, m.AbilityPending.Remaining, 1e-9, "the fuse is lit")
	assert.Equal(t, b.ID, m.AbilityPending.Attack.AttackerEntityID, "the burst is the Blightborn's")

	cc, _ := b.GetComponent(ecs.ComponentTypeCombat)
	cc.(*components.CombatComponent).Attack = 999 // snapshotted at death

	kills = burstOut(em, ticks(0.8)-2)
	assert.Equal(t, 100000, health(near), "not before the fuse ends")
	kills = append(kills, burstOut(em, 2)...)
	assert.Equal(t, 100000-mitigated(9, 2), health(near))
	assert.Equal(t, 100000, health(far))
	assert.Empty(t, kills, "the burst kills no monster")

	burstOut(em, ticks(1))
	assert.Equal(t, 100000-mitigated(9, 2), health(near), "it lands once")
}

// Two bursts overlapping each land: a delver inside both takes both.
// FS-C8VM7 §Edge States.
func TestDeathBurst_TwoOverlapping_EachLands(t *testing.T) {
	em := ecs.NewEntityManager()
	a := blightborn(em, 500, 500)
	b := blightborn(em, 600, 500)
	between := sturdy(delver(em, 550, 500))
	slay(em, uuid.New(), a, b)

	burstOut(em, ticks(0.8))

	assert.Equal(t, 100000-2*mitigated(9, 2), health(between))
}

// A delver the burst kills is killed by the Blightborn: the hit is its, not a
// delver's. FS-C8VM7 §B R16.
func TestDeathBurst_KillsADelver_CreditedToTheBlightborn(t *testing.T) {
	em := ecs.NewEntityManager()
	b := blightborn(em, 500, 500)
	d := delver(em, 560, 500)
	hc, _ := d.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 1
	slay(em, uuid.New(), b)
	burst := monster(b).AbilityPending.Attack
	burstOut(em, ticks(0.8))

	assert.Equal(t, 0, health(d))
	assert.Equal(t, b.ID, burst.AttackerEntityID)
	assert.Equal(t, uuid.Nil, burst.AttackerMemberID, "no delver is credited")
	assert.True(t, burst.FromMonster)
}

// slay is one tick of a run's combat steps in which a delver's lethal hits,
// handed in as projectile impacts, kill the monsters given.
func slay(em *ecs.EntityManager, killer uuid.UUID, monsters ...*ecs.Entity) []KillRecord {
	var impacts []Impact
	for _, m := range monsters {
		impacts = append(impacts, Impact{Attack: lethal(killer), TargetEntityID: m.ID})
	}
	entities := em.GetAllEntities()
	kills := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, entities, impacts)
	NewMonsterDeathSystem(em, corpseLifetime).Update(tickSeconds, entities)
	return kills
}

// A living Blightborn fights as any monster: its burst is never chosen in
// place of a swing. FS-C8VM7 §B R11, R16.
func TestDeathBurst_NeverUsedInAFight(t *testing.T) {
	em := ecs.NewEntityManager()
	b := blightborn(em, 500, 500)
	delver(em, 500, 500) // standing on it, inside every distance

	brawl(em, 1)

	assert.Equal(t, components.MonsterActionAttack, monster(b).Action)
	assert.Zero(t, monster(b).AbilityPending.Remaining)
}
