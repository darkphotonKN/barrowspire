package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-8RZ51 §F R24–R28: what the held ranks add to the body.

// ownMaxHealth is every test body's own max HP: 4% of it is 8 points.
const ownMaxHealth = 200

// classPools is each class's resource as seated: kind, max and base regen.
var classPools = map[string]struct {
	kind  components.ResourceKind
	max   int
	regen int
}{
	"warrior":   {components.ResourceStamina, 100, 20},
	"mage":      {components.ResourceMana, 150, 4},
	"archer":    {components.ResourceStamina, 100, 20},
	"mercenary": {components.ResourceParryCharges, 3, 0},
}

// rankedBody seats a body of class holding ranks, its passive bonus applied as
// a seating applies it, before its first gear pass.
func rankedBody(em *ecs.EntityManager, class string, ranks passivetree.Ranks) *ecs.Entity {
	pool := classPools[class]
	e := em.CreateEntity()
	e.AddComponent(components.NewPlayerComponent(uuid.New(), class, "Wren", false))
	e.AddComponent(components.NewTransformComponent(100, 100))
	e.AddComponent(components.NewVelocityComponent(0, 0, 200))
	e.AddComponent(components.NewHealthComponent(ownMaxHealth, ownMaxHealth))
	e.AddComponent(components.NewResourceComponent(pool.kind, pool.max, pool.max, pool.regen))
	e.AddComponent(components.NewCombatComponent(12, 10, 1, 1.0))
	e.AddComponent(components.NewStatsComponent(8, 8, 9, 9))
	e.AddComponent(components.NewEquipmentComponent(nil))
	e.AddComponent(components.NewAttackIntentComponent())
	e.AddComponent(components.NewCooldownComponent())
	e.AddComponent(components.NewPassiveRanksComponent(ranks))
	ApplyPassiveBonus(e)
	return e
}

// regenTicksRead is how long a reading of regen runs: whole points for every
// class's base and bonus, 2.5 s of 30 Hz ticks.
const regenTicksRead = 75

// bodyStats is every stat a filler can change, as the systems read it.
type bodyStats struct {
	MaxHealth, CurrentHealth        int
	MaxResource                     int
	Strength, Agility, Intelligence int
	AttackSpeed, MoveSpeed          int
	// Regen is the points the pool gains from empty over 2.5 s.
	Regen int
}

// readStats runs a gear pass and reads e, then empties its pool and reads
// what it regains in 2.5 s.
func readStats(em *ecs.EntityManager, e *ecs.Entity) bodyStats {
	NewGearSystem(em, testGearCaps, testUniqueEffects, vitalityAside).Update(worldTick, em.GetAllEntities())
	gear := gearOf(e)
	pool := resourceOf(e)
	stats := bodyStats{
		MaxHealth: healthOf(e).MaxHealth, CurrentHealth: healthOf(e).CurrentHealth,
		MaxResource: pool.Max,
		Strength:    gear.Strength, Agility: gear.Agility, Intelligence: gear.Intelligence,
		AttackSpeed: gear.AttackSpeedPercent, MoveSpeed: gear.MoveSpeedPercent,
	}
	pool.Current = 0
	regenTicks(em, regenTicksRead, worldTick)
	stats.Regen = pool.Current
	return stats
}

func statsOfClass(class string, ranks passivetree.Ranks) bodyStats {
	em := ecs.NewEntityManager()
	return readStats(em, rankedBody(em, class, ranks))
}

// Acceptance "Each filler in R28 changes exactly its stat for each class, per
// rank": every cell of R28 at rank 1 and rank 2, against the same body holding
// nothing.
func TestPassiveBonus_EveryFiller_ChangesExactlyItsStat(t *testing.T) {
	maxHP := func(n int) func(*bodyStats) {
		return func(s *bodyStats) { s.MaxHealth += n; s.CurrentHealth += n }
	}
	maxResource := func(n int) func(*bodyStats) { return func(s *bodyStats) { s.MaxResource += n } }
	strength := func(n int) func(*bodyStats) { return func(s *bodyStats) { s.Strength += n } }
	agility := func(n int) func(*bodyStats) { return func(s *bodyStats) { s.Agility += n } }
	intelligence := func(n int) func(*bodyStats) { return func(s *bodyStats) { s.Intelligence += n } }
	regen := func(n int) func(*bodyStats) { return func(s *bodyStats) { s.Regen += n } }

	tests := []struct {
		node         string
		rank1, rank2 func(*bodyStats)
	}{
		// +4% max HP: 8 of 200 a rank
		{"warrior.t1a", maxHP(8), maxHP(16)},
		{"mage.t1a", maxHP(8), maxHP(16)},
		{"archer.t1a", maxHP(8), maxHP(16)},
		{"mercenary.t1a", maxHP(8), maxHP(16)},

		{"warrior.t1b", maxResource(10), maxResource(20)},
		{"mage.t1b", maxResource(15), maxResource(30)},
		{"archer.t1b", maxResource(10), maxResource(20)},
		{"mercenary.t1b", strength(2), strength(4)},

		{"warrior.t4a", strength(2), strength(4)},
		{"mage.t4a", intelligence(2), intelligence(4)},
		{"archer.t4a", agility(2), agility(4)},
		{"mercenary.t4a", agility(2), agility(4)},

		// +10% regen over 2.5 s: stamina 20/s gains 5 more a rank, mana 4/s 1
		{"warrior.t4b", regen(5), regen(10)},
		{"mage.t4b", regen(1), regen(2)},
		{"archer.t4b", regen(5), regen(10)},
		{"mercenary.t4b", maxHP(8), maxHP(16)},
	}

	for _, tt := range tests {
		node, ok := passivetree.Lookup(tt.node)
		require.True(t, ok, tt.node)
		bare := statsOfClass(node.Class, nil)

		for rank, change := range map[int]func(*bodyStats){1: tt.rank1, 2: tt.rank2} {
			want := bare
			change(&want)
			assert.Equal(t, want, statsOfClass(node.Class, passivetree.Ranks{tt.node: rank}), "%s at rank %d", tt.node, rank)
		}
	}
}

// Acceptance "Holding t3, t6a or t6b changes no stat in this FS" (R30, R31).
func TestPassiveBonus_AbilityAndSpecializationNodes_ChangeNoStat(t *testing.T) {
	for class := range classPools {
		bare := statsOfClass(class, nil)
		for _, slot := range []string{"t3", "t6a", "t6b"} {
			assert.Equal(t, bare, statsOfClass(class, passivetree.Ranks{class + "." + slot: 1}), "%s.%s", class, slot)
		}
	}
}

// A rank of another class's node adds nothing to this body.
func TestPassiveBonus_AnotherClasssNode_AddsNothing(t *testing.T) {
	assert.Equal(t, statsOfClass("warrior", nil), statsOfClass("warrior", passivetree.Ranks{"mage.t1a": 2, "mage.t4a": 2}))
}

// R26: a regen bonus below a whole point accrues like regen does, never
// rounded away: a mage's 4 mana a second +10% is 4.4, 22 over 5 s.
func TestPassiveBonus_RegenBelowAWholePoint_Accrues(t *testing.T) {
	em := ecs.NewEntityManager()
	mage := rankedBody(em, "mage", passivetree.Ranks{"mage.t4b": 1})
	resourceOf(mage).Current = 0

	regenTicks(em, 30, worldTick)
	assert.Equal(t, 4, resourceOf(mage).Current, "4.4 after 1 s reads 4")

	regenTicks(em, 120, worldTick)
	assert.Equal(t, 22, resourceOf(mage).Current, "the 0.4 a second is kept")
}

// Acceptance "Attack speed and move speed from the tree plus gear never exceed
// the gear caps" (R25): an archer's Quick Draw (+4% a rank) and Fleet Foot
// (+3% a rank) sum with worn attack and move speed under one ceiling each.
func TestPassiveBonus_TreeSpeeds_SumWithGearInsideTheCaps(t *testing.T) {
	tests := []struct {
		name                 string
		quickDraw, fleetFoot int
		wornAttack, wornMove int
		wantAttack, wantMove int
		wantSpeed            float64
	}{
		{"tree alone", 2, 2, 0, 0, 8, 6, 212},
		{"tree and gear sum", 2, 3, 10, 10, 18, 19, 238},
		{"the total is capped", 3, 3, 45, 25, 50, 30, 260},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			archer := rankedBody(em, "archer", passivetree.Ranks{"archer.t2a": tt.quickDraw, "archer.t2b": tt.fleetFoot})
			wear(em, archer, glovesSlot, types.ItemTypeArmor, affix(types.AffixAttackSpeed, tt.wornAttack), affix(types.AffixMoveSpeed, tt.wornMove))

			NewGearSystem(em, testGearCaps, testUniqueEffects, vitalityAside).Update(worldTick, em.GetAllEntities())

			assert.Equal(t, tt.wantAttack, gearOf(archer).AttackSpeedPercent)
			assert.Equal(t, tt.wantMove, gearOf(archer).MoveSpeedPercent)
			vc, _ := archer.GetComponent(ecs.ComponentTypeVelocity)
			assert.InDelta(t, tt.wantSpeed, vc.(*components.VelocityComponent).Speed, 1e-9)
		})
	}
}

// raiseRanks gives e ranks, as a spend in town does, and re-applies its bonus.
func raiseRanks(e *ecs.Entity, ranks passivetree.Ranks) {
	e.AddComponent(components.NewPassiveRanksComponent(ranks))
	ApplyPassiveBonus(e)
}

// R27: a recompute moves a max that rose and its current by the same amount,
// a full bar staying full and a hurt one keeping its gap; a body at 0 is never
// raised.
func TestApplyPassiveBonus_ARecomputeRaisesMaxAndCurrentAlike(t *testing.T) {
	t.Run("max HP, full", func(t *testing.T) {
		em := ecs.NewEntityManager()
		e := rankedBody(em, "warrior", passivetree.Ranks{"warrior.t1a": 1})
		require.Equal(t, 208, healthOf(e).MaxHealth)

		raiseRanks(e, passivetree.Ranks{"warrior.t1a": 2})

		assert.Equal(t, 216, healthOf(e).MaxHealth)
		assert.Equal(t, 216, healthOf(e).CurrentHealth)
	})

	t.Run("max HP, hurt", func(t *testing.T) {
		em := ecs.NewEntityManager()
		e := rankedBody(em, "warrior", nil)
		healthOf(e).CurrentHealth = 100

		raiseRanks(e, passivetree.Ranks{"warrior.t1a": 1})

		assert.Equal(t, 208, healthOf(e).MaxHealth)
		assert.Equal(t, 108, healthOf(e).CurrentHealth)
	})

	t.Run("max mana", func(t *testing.T) {
		em := ecs.NewEntityManager()
		e := rankedBody(em, "mage", nil)
		resourceOf(e).Current = 40

		raiseRanks(e, passivetree.Ranks{"mage.t1b": 1})

		assert.Equal(t, 165, resourceOf(e).Max)
		assert.Equal(t, 55, resourceOf(e).Current)
	})

	t.Run("a body at 0 stays at 0", func(t *testing.T) {
		em := ecs.NewEntityManager()
		e := rankedBody(em, "warrior", nil)
		healthOf(e).CurrentHealth = 0

		raiseRanks(e, passivetree.Ranks{"warrior.t1a": 1})

		assert.Equal(t, 208, healthOf(e).MaxHealth)
		assert.Zero(t, healthOf(e).CurrentHealth)
	})

	t.Run("worn gear's maxima are kept", func(t *testing.T) {
		em := ecs.NewEntityManager()
		e := rankedBody(em, "warrior", nil)
		wear(em, e, chestSlot, types.ItemTypeArmor, affix(types.AffixMaxHealth, 12))
		gear := NewGearSystem(em, testGearCaps, testUniqueEffects, vitalityAside)
		gear.Update(worldTick, em.GetAllEntities())
		require.Equal(t, 212, healthOf(e).MaxHealth)

		raiseRanks(e, passivetree.Ranks{"warrior.t1a": 1})
		gear.Update(worldTick, em.GetAllEntities())

		assert.Equal(t, 220, healthOf(e).MaxHealth, "own 200, gear 12, tree 8 of own")
		assert.Equal(t, 220, healthOf(e).CurrentHealth)
	})
}

// R26, §Edge States "A level-up mid-run": a percent of max HP stays of own max
// HP at seating; a level-up since does not move its basis.
func TestApplyPassiveBonus_PercentMaxHPKeepsItsSeatingBasis(t *testing.T) {
	em := ecs.NewEntityManager()
	e := rankedBody(em, "warrior", nil)
	healthOf(e).MaxHealth += 50 // a level-up's growth, after seating

	raiseRanks(e, passivetree.Ranks{"warrior.t1a": 1})

	assert.Equal(t, 250+8, healthOf(e).MaxHealth, "4% of the 200 seated, not of 250")
}
