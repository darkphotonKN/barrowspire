package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/common/passivetree"
	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/navigation"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// blinkMage is a delver seated as a mage naming Blink, holding the mage
// tree's tier-3 node, with a full 100-point mana pool.
func blinkMage(em *ecs.EntityManager, x, y float64) *ecs.Entity {
	e := delver(em, x, y)
	e.AddComponent(components.NewResourceComponent(components.ResourceMana, 100, 100, 0))
	e.AddComponent(components.NewTreeAbilityComponent(components.AttackBlink, "mage.t3"))
	e.AddComponent(components.NewPassiveRanksComponent(passivetree.Ranks{"mage.r1": 1, "mage.t3": 1}))
	return e
}

// blinkAt casts the mage's Blink at (x, y) and runs the tick it resolves on.
func blinkAt(em *ecs.EntityManager, combat *CombatSystem, mage *ecs.Entity, x, y float64) {
	intend(mage, components.AttackIntent{Kind: components.AttackBlink, TargetX: x, TargetY: y})
	combat.Update(tickSeconds, em.GetAllEntities(), nil)
}

func standsAt(e *ecs.Entity) (float64, float64) {
	c, _ := e.GetComponent(ecs.ComponentTypeTransform)
	at := c.(*components.TransformComponent)
	return at.X, at.Y
}

// A wall 4 px thick at x = 220, thinner than any tick's step: the mage lands
// with their body against its near side and never beyond it.
// FS-04EEA §D R19; §Acceptance Criteria "a wall thinner than a tick's step".
func TestCombatSystem_Blink_StopsAgainstAThinWall(t *testing.T) {
	em := ecs.NewEntityManager()
	mage := blinkMage(em, 100, 100)
	addWall(em, 220, 0, 4, 400)
	combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)

	blinkAt(em, combat, mage, 400, 100)

	x, y := standsAt(mage)
	assert.InDelta(t, 220-constants.PlayerRadius, x, 1e-9)
	assert.Equal(t, 100.0, y)
}

// In open ground the mage moves min(180, distance to the target) px along the
// line on the resolving tick, spends 45 mana and starts an 8 s cooldown.
// FS-04EEA §D R18, §A R4–R5.
func TestCombatSystem_Blink_OpenGround_MovesUpTo180TowardTheTarget(t *testing.T) {
	tests := []struct {
		name         string
		toX, toY     float64
		wantX, wantY float64
	}{
		{"300 px away: 180 along the line", 400, 100, 280, 100},
		{"100 px away: onto the target", 200, 100, 200, 100},
		{"on a diagonal: 180 along it", 100 + 300*0.6, 100 + 300*0.8, 100 + 180*0.6, 100 + 180*0.8},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			mage := blinkMage(em, 100, 100)
			combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)

			blinkAt(em, combat, mage, tt.toX, tt.toY)

			x, y := standsAt(mage)
			assert.InDelta(t, tt.wantX, x, 1e-9)
			assert.InDelta(t, tt.wantY, y, 1e-9)
			assert.Equal(t, 55, pool(mage))
			remaining, total := cooldownState(mage, components.AttackBlink)
			assert.InDelta(t, 8, remaining, 1e-9)
			assert.InDelta(t, 8, total, 1e-9)
			assert.True(t, mage.HasComponent(ecs.ComponentTypeAttackPin))
		})
	}
}

// Worn attack speed shortens Blink's cooldown as every cooldown's.
// FS-04EEA §A R6.
func TestCombatSystem_Blink_WornAttackSpeedShortensItsCooldown(t *testing.T) {
	em := ecs.NewEntityManager()
	mage := blinkMage(em, 100, 100)
	mage.AddComponent(&components.GearBonusComponent{AttackSpeedPercent: 50})

	blinkAt(em, NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects), mage, 400, 100)

	remaining, total := cooldownState(mage, components.AttackBlink)
	assert.InDelta(t, 8/1.5, remaining, 1e-9)
	assert.InDelta(t, 8/1.5, total, 1e-9)
}

// The wire's tree-ability cost reads Blink's 45. FS-04EEA §A R5; FS-Q18Q3 §A R5.
func TestTreeAbilityCost_Blink(t *testing.T) {
	assert.Equal(t, 45, TreeAbilityCost(components.AttackBlink))
}

// overlapsRect reports whether a body at (x, y) overlaps the rect, touching
// excluded.
func overlapsRect(x, y, rx, ry, rw, rh float64) bool {
	r := constants.PlayerRadius
	return x+r > rx && x-r < rx+rw && y+r > ry && y-r < ry+rh
}

// A closed door 120 px along the line stops the mage at its near side; an open
// one does not block. FS-04EEA §D R19; §Edge States "Blink through an open door".
func TestCombatSystem_Blink_ClosedDoorBlocks_OpenDoorDoesNot(t *testing.T) {
	for _, tt := range []struct {
		open  bool
		wantX float64
	}{{false, 220 - constants.PlayerRadius}, {true, 280}} {
		em := ecs.NewEntityManager()
		mage := blinkMage(em, 100, 100)
		addDoor(em, 220, 0, 8, 400, tt.open)

		blinkAt(em, NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects), mage, 400, 100)

		x, _ := standsAt(mage)
		assert.InDelta(t, tt.wantX, x, 1e-9, "open %v", tt.open)
	}
}

// The world's edge stops the mage with their body inside it. FS-04EEA §D R19.
func TestCombatSystem_Blink_StopsAtTheWorldsEdge(t *testing.T) {
	em := ecs.NewEntityManager()
	mage := blinkMage(em, 400, 400)
	combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)
	combat.Ground = &MovementSystem{MapWidth: 500, MapHeight: 1000}

	blinkAt(em, combat, mage, 400+300*0.6, 400-300*0.8)

	x, y := standsAt(mage)
	assert.InDelta(t, 500-constants.PlayerRadius, x, 1e-9)
	assert.InDelta(t, 400-(100-constants.PlayerRadius)/0.6*0.8, y, 1e-9, "still on the line")
}

// A small block on a diagonal line is met where the body first touches it,
// never passed: the line is swept, not split into one X and one Y move.
// FS-04EEA §D R19.
func TestCombatSystem_Blink_DiagonalNeverCutsACorner(t *testing.T) {
	em := ecs.NewEntityManager()
	mage := blinkMage(em, 100, 100)
	addWall(em, 180, 180, 10, 10)

	blinkAt(em, NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects), mage, 300, 300)

	x, y := standsAt(mage)
	assert.False(t, overlapsRect(x, y, 180, 180, 10, 10))
	assert.InDelta(t, 160, x, 1e-9, "on the line, where the body's corner meets the block's")
	assert.InDelta(t, 160, y, 1e-9)
}

// A Blink into a wall at a slant stops where the body meets it, on the line:
// it never slides along the wall. FS-04EEA §D R19; §Edge States "Blink pressed
// into a corner".
func TestCombatSystem_Blink_AtASlant_StopsOnTheLineWithoutSliding(t *testing.T) {
	em := ecs.NewEntityManager()
	mage := blinkMage(em, 100, 100)
	addWall(em, 180, 0, 10, 1000)

	blinkAt(em, NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects), mage, 100+300*0.6, 100+300*0.8)

	x, y := standsAt(mage)
	assert.InDelta(t, 160, x, 1e-9)
	assert.InDelta(t, 100+60/0.6*0.8, y, 1e-9, "where the line meets the wall, not further down it")
}

// rockColumnFloor is a dungeon floor's grid of 40 px cells, 20 × 10, every
// cell walkable but column 6 (px 240–280), which is rock. No wall entity
// stands on it.
func rockColumnFloor() *navigation.Grid {
	const cols, rows = 20, 10
	walkable := make([]bool, cols*rows)
	for c := range walkable {
		walkable[c] = c%cols != 6
	}
	return navigation.NewGrid(cols, rows, 40, walkable)
}

// On a dungeon floor, rock 120 px along the line stops the mage before it, on
// the grid alone. FS-04EEA §D R19.
func TestCombatSystem_Blink_DungeonFloor_RockStopsIt(t *testing.T) {
	em := ecs.NewEntityManager()
	mage := blinkMage(em, 100, 100)
	combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)
	grid := rockColumnFloor()
	combat.Ground = &MovementSystem{MapWidth: 800, MapHeight: 400, Grid: grid}

	blinkAt(em, combat, mage, 400, 100)

	x, y := standsAt(mage)
	assert.InDelta(t, 240-constants.PlayerRadius, x, 1e-3)
	assert.Equal(t, 100.0, y)
	assert.True(t, grid.Clear(x, y, x, y, constants.PlayerRadius), "never on rock")
}

// Monsters and other delvers on the line do not block a Blink; the body
// collision separates any overlap on the ticks after. FS-04EEA §D R20.
func TestCombatSystem_Blink_PassesThroughBodies(t *testing.T) {
	em := ecs.NewEntityManager()
	mage := blinkMage(em, 100, 100)
	beast := dummy(em, 180, 100)
	beast.AddComponent(components.NewVelocityComponent(0, 0, 100))
	delver(em, 240, 100).AddComponent(components.NewVelocityComponent(0, 0, 200))
	delver(em, 280, 100).AddComponent(components.NewVelocityComponent(0, 0, 200))

	blinkAt(em, NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects), mage, 400, 100)

	x, _ := standsAt(mage)
	assert.InDelta(t, 280, x, 1e-9, "lands on the last delver, overlapping")
}

// A Blink that cannot move the mage at all does nothing: no move, no mana, no
// cooldown, no attack pin. FS-04EEA §D R21; §Edge States "Blink at the target
// under the mage".
func TestCombatSystem_Blink_GoingNowhere_ResolvesToNothing(t *testing.T) {
	tests := []struct {
		name     string
		at       float64
		toX, toY float64
		lay      func(em *ecs.EntityManager)
	}{
		{"target under the mage", 100, 100, 100, func(*ecs.EntityManager) {}},
		{"a wall at the mage's edge", 100, 400, 100, func(em *ecs.EntityManager) { addWall(em, 120, 0, 10, 400) }},
		{"a closed door at the mage's edge", 100, 400, 100, func(em *ecs.EntityManager) { addDoor(em, 120, 0, 10, 400, false) }},
		{"the world's edge at the mage's edge", constants.PlayerRadius, 0, 100, func(*ecs.EntityManager) {}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			mage := blinkMage(em, tt.at, 100)
			tt.lay(em)

			blinkAt(em, NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects), mage, tt.toX, tt.toY)

			x, y := standsAt(mage)
			assert.Equal(t, tt.at, x)
			assert.Equal(t, 100.0, y)
			assert.Equal(t, 100, pool(mage))
			remaining, total := cooldownState(mage, components.AttackBlink)
			assert.Zero(t, remaining)
			assert.Zero(t, total)
			assert.False(t, mage.HasComponent(ecs.ComponentTypeAttackPin))
		})
	}
}

// A Blink is not a dash: no charge is set going, and an Ashwalk wearer lays no
// trail along it. A charge in flight ends where the body stood before the
// Blink, so its trail runs along the dash alone. FS-04EEA §D R22, §A R4.
func TestCombatSystem_Blink_IsNotADash(t *testing.T) {
	t.Run("no charge, no trail", func(t *testing.T) {
		em := ecs.NewEntityManager()
		mage := blinkMage(em, 100, 100)
		wearUnique(em, mage, legsSlot, types.ItemTypeArmor, types.UniqueEffectBurningDash)

		blinkAt(em, NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects), mage, 400, 100)

		assert.False(t, mage.HasComponent(ecs.ComponentTypeDash))
		assert.Empty(t, trails(em))
	})
	t.Run("a charge in flight ends before the move", func(t *testing.T) {
		em := ecs.NewEntityManager()
		mage := blinkMage(em, 100, 100)
		wearUnique(em, mage, legsSlot, types.ItemTypeArmor, types.UniqueEffectBurningDash)
		combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)
		intend(mage, components.AttackIntent{Kind: components.AttackDash, TargetX: 400, TargetY: 100})
		combat.Update(tickSeconds, em.GetAllEntities(), nil)
		NewMovementSystem().Update(tickSeconds, em.GetAllEntities())
		require.True(t, mage.HasComponent(ecs.ComponentTypeDash))
		dashedTo, _ := standsAt(mage)

		blinkAt(em, combat, mage, 100, 400)

		assert.False(t, mage.HasComponent(ecs.ComponentTypeDash))
		laid := trails(em)
		require.Len(t, laid, 1)
		tc, _ := laid[0].GetComponent(ecs.ComponentTypeBurningTrail)
		trail := tc.(*components.BurningTrailComponent)
		assert.InDelta(t, dashedTo, trail.ToX, 1e-9, "the trail ends where the dash did")
		assert.InDelta(t, 100, trail.ToY, 1e-9)
	})
}

// A Blink from anyone but a mage holding the mage tree's tier-3 node does
// nothing at all. FS-04EEA §A R3; §Edge States "Wrong class's id".
func TestCombatSystem_Blink_RefusedWithoutTheClassOrTheNode(t *testing.T) {
	tests := []struct {
		name   string
		caster func(em *ecs.EntityManager) *ecs.Entity
	}{
		{"a mage without the node", func(em *ecs.EntityManager) *ecs.Entity {
			e := blinkMage(em, 100, 100)
			e.AddComponent(components.NewPassiveRanksComponent(passivetree.Ranks{"mage.r1": 1}))
			return e
		}},
		{"a warrior holding their own node", func(em *ecs.EntityManager) *ecs.Entity {
			return earthbreakerWarrior(em, 100, 100, true)
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			caster := tt.caster(em)

			blinkAt(em, NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects), caster, 400, 100)

			x, _ := standsAt(caster)
			assert.Equal(t, 100.0, x)
			assert.Equal(t, 100, pool(caster))
			remaining, _ := cooldownState(caster, components.AttackBlink)
			assert.Zero(t, remaining)
		})
	}
}
