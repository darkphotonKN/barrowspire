package systems

import (
	"maps"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
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

// bodyStats is every stat a node can change, as the systems read it.
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

// Acceptance "Holding t3, t6a or t6b changes no stat in this FS" (R30, R31).
// The Berserker's blood price is FS-E1ZDG §D's stat, not this FS's
// (berserker_test.go).
func TestPassiveBonus_AbilityAndSpecializationNodes_ChangeNoStat(t *testing.T) {
	for class := range classPools {
		bare := statsOfClass(class, nil)
		for _, slot := range []string{"t3", "t6a", "t6b"} {
			if class+"."+slot == "warrior.t6b" {
				continue
			}
			assert.Equal(t, bare, statsOfClass(class, passivetree.Ranks{class + "." + slot: 1}), "%s.%s", class, slot)
		}
	}
}

// A rank of another class's node adds nothing to this body.
func TestPassiveBonus_AnotherClasssNode_AddsNothing(t *testing.T) {
	assert.Equal(t, statsOfClass("warrior", nil), statsOfClass("warrior", passivetree.Ranks{"mage.r1": 1, "mage.t2a": 3, "mage.ua4": 1}))
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
		wantSpeed            float64 // at full pace
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
			assert.InDelta(t, tt.wantSpeed*constants.PaceScale, vc.(*components.VelocityComponent).Speed, 1e-9)
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
// raised. Thick Skin's +4% max HP is 8 of 200 a rank, Deep Well's +15 max mana.
func TestApplyPassiveBonus_ARecomputeRaisesMaxAndCurrentAlike(t *testing.T) {
	t.Run("max HP, full", func(t *testing.T) {
		em := ecs.NewEntityManager()
		e := rankedBody(em, "warrior", passivetree.Ranks{"warrior.t2b": 1})
		require.Equal(t, 208, healthOf(e).MaxHealth)

		raiseRanks(e, passivetree.Ranks{"warrior.t2b": 2})

		assert.Equal(t, 216, healthOf(e).MaxHealth)
		assert.Equal(t, 216, healthOf(e).CurrentHealth)
	})

	t.Run("max HP, hurt", func(t *testing.T) {
		em := ecs.NewEntityManager()
		e := rankedBody(em, "warrior", nil)
		healthOf(e).CurrentHealth = 100

		raiseRanks(e, passivetree.Ranks{"warrior.t2b": 1})

		assert.Equal(t, 208, healthOf(e).MaxHealth)
		assert.Equal(t, 108, healthOf(e).CurrentHealth)
	})

	t.Run("max mana", func(t *testing.T) {
		em := ecs.NewEntityManager()
		e := rankedBody(em, "mage", nil)
		resourceOf(e).Current = 40

		raiseRanks(e, passivetree.Ranks{"mage.t2b": 1})

		assert.Equal(t, 165, resourceOf(e).Max)
		assert.Equal(t, 55, resourceOf(e).Current)
	})

	t.Run("a body at 0 stays at 0", func(t *testing.T) {
		em := ecs.NewEntityManager()
		e := rankedBody(em, "warrior", nil)
		healthOf(e).CurrentHealth = 0

		raiseRanks(e, passivetree.Ranks{"warrior.t2b": 1})

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

		raiseRanks(e, passivetree.Ranks{"warrior.t2b": 1})
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

	raiseRanks(e, passivetree.Ranks{"warrior.t2b": 1})

	assert.Equal(t, 250+8, healthOf(e).MaxHealth, "4% of the 200 seated, not of 250")
}

// Acceptance (FS-8RZ51 §Change: Tree v2, V14, V16) "A body holding r1, m1 and
// m3 has +15 max HP flat, current raised with it. With Thick Skin at 2 as
// well, it also has 8% of own max HP, both summed."
func TestPassiveBonus_Vitality_AddsFlatMaxHPSummedWithThickSkinsPercent(t *testing.T) {
	vitality := passivetree.Ranks{"warrior.r1": 1, "warrior.m1": 1, "warrior.m3": 1}
	tests := []struct {
		name  string
		ranks passivetree.Ranks
		want  int
	}{
		{"Vitality alone", vitality, ownMaxHealth + 15},
		{"Vitality and Thick Skin", merged(vitality, passivetree.Ranks{"warrior.t2b": 2}), ownMaxHealth + 15 + 16},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			stats := statsOfClass("warrior", tt.ranks)

			assert.Equal(t, tt.want, stats.MaxHealth)
			assert.Equal(t, tt.want, stats.CurrentHealth, "seated full")
		})
	}
}

// merged is a and b in one set of ranks.
func merged(a, b passivetree.Ranks) passivetree.Ranks {
	out := maps.Clone(a)
	maps.Copy(out, b)
	return out
}

// Acceptance (V14, V16) "Might adds +2 Strength (warrior), +2 Intelligence
// (mage), +2 Agility (archer), and +2 Strength and +2 Agility (mercenary)":
// each class's primary attributes, every one named at the full amount.
func TestPassiveBonus_Might_RaisesTheClasssPrimaryAttributes(t *testing.T) {
	tests := []struct {
		class                           string
		strength, agility, intelligence int
	}{
		{"warrior", 2, 0, 0},
		{"mage", 0, 0, 2},
		{"archer", 0, 2, 0},
		{"mercenary", 2, 2, 0},
	}

	for _, tt := range tests {
		t.Run(tt.class, func(t *testing.T) {
			bare := statsOfClass(tt.class, nil)

			might := statsOfClass(tt.class, passivetree.Ranks{tt.class + ".r2": 1})

			assert.Equal(t, bare.Strength+tt.strength, might.Strength, "strength")
			assert.Equal(t, bare.Agility+tt.agility, might.Agility, "agility")
			assert.Equal(t, bare.Intelligence+tt.intelligence, might.Intelligence, "intelligence")
		})
	}
}

// Acceptance (V14) "Haste and Fleetness add 2% each inside gear's caps. The
// tree plus gear never exceeds the cap": a warrior on upper side a and lower
// side b holds two of each.
func TestPassiveBonus_HasteAndFleetness_SumWithGearInsideTheCaps(t *testing.T) {
	traversal := passivetree.Ranks{"warrior.ua1": 1, "warrior.ua4": 1, "warrior.lb1": 1, "warrior.lb4": 1}
	tests := []struct {
		name                 string
		wornAttack, wornMove int
		wantAttack, wantMove int
		wantSpeed            float64 // at full pace
	}{
		{"tree alone", 0, 0, 4, 4, 208},
		{"tree and gear sum", 10, 10, 14, 14, 228},
		{"the total is capped", 48, 28, 50, 30, 260},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			warrior := rankedBody(em, "warrior", traversal)
			wear(em, warrior, glovesSlot, types.ItemTypeArmor, affix(types.AffixAttackSpeed, tt.wornAttack), affix(types.AffixMoveSpeed, tt.wornMove))

			NewGearSystem(em, testGearCaps, testUniqueEffects, vitalityAside).Update(worldTick, em.GetAllEntities())

			assert.Equal(t, tt.wantAttack, gearOf(warrior).AttackSpeedPercent)
			assert.Equal(t, tt.wantMove, gearOf(warrior).MoveSpeedPercent)
			vc, _ := warrior.GetComponent(ecs.ComponentTypeVelocity)
			assert.InDelta(t, tt.wantSpeed*constants.PaceScale, vc.(*components.VelocityComponent).Speed, 1e-9)
		})
	}
}

// Acceptance (V21) "A body holding a retired id seats with nothing from it".
func TestPassiveBonus_ARetiredID_AddsNothing(t *testing.T) {
	for class := range classPools {
		retired := passivetree.Ranks{}
		for _, slot := range []string{"t1a", "t1b", "t4a", "t4b"} {
			retired[class+"."+slot] = 3
		}
		assert.Equal(t, statsOfClass(class, nil), statsOfClass(class, retired), class)
	}
}

// The Berserker's price (FS-E1ZDG §D R14) is two-thirds of the class body,
// taken after the tree's raise: Vitality's points stay whole on top.
func TestPassiveBonus_ABerserkerKeepsVitalitysPointsOnTopOfThePrice(t *testing.T) {
	stats := statsOfClass("warrior", merged(berserkerRanks, passivetree.Ranks{"warrior.r1": 1, "warrior.m1": 1, "warrior.m3": 1}))

	assert.Equal(t, BloodPricedMaxHealth(ownMaxHealth)+15, stats.MaxHealth, "round(0.67 × 200) + 15")
	assert.Equal(t, stats.MaxHealth, stats.CurrentHealth, "seated full")
}

// Acceptance (V17) "No sumPassives row or stat constant names a stat no node
// uses", the other way round: every per-rank value a class's node carries
// changes that class's bonus, its kicker rule aside.
func TestSumPassives_EveryNodesPerRankValue_HasARow(t *testing.T) {
	for class, pool := range classPools {
		for _, node := range passivetree.Nodes(class) {
			if node.PerRank == nil {
				continue
			}
			bonus := sumPassives(class, passivetree.Ranks{node.ID: node.MaxRank}, ownMaxHealth, pool.kind)
			bonus.Kickers = nil

			assert.NotEqual(t, components.PassiveBonusComponent{}, bonus, "%s (%s) adds nothing", node.ID, node.PerRank.Stat)
		}
	}
}
