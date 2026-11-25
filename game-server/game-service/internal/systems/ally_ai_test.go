package systems

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
)

// allyCell is the cell side the ally tests measure by: follow within 2-4
// cells, engage within 6 (FS-4EC7Z §C R9).
const allyCell = 80.0

var testAllyReach = AllyReach{Near: 2 * allyCell, Far: 4 * allyCell, Engage: 6 * allyCell}

// hirerAt is a delver in play at (x, y) and their member id.
func hirerAt(em *ecs.EntityManager, x, y float64) (*ecs.Entity, uuid.UUID) {
	e := delver(em, x, y)
	e.AddComponent(components.NewVelocityComponent(0, 0, 200))
	pc, _ := e.GetComponent(ecs.ComponentTypePlayer)
	return e, pc.(*components.PlayerComponent).MemberID
}

// march ticks the ally AI, then movement, then the combat, as a run's tick
// does, for seconds.
func march(em *ecs.EntityManager, ai *AllyAISystem, move *MovementSystem, seconds float64) {
	combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)
	for range ticks(seconds) {
		entities := em.GetAllEntities()
		ai.Update(tickSeconds, entities)
		move.Update(tickSeconds, entities)
		combat.Update(tickSeconds, entities, nil)
	}
}

func openField() *MovementSystem { return &MovementSystem{MapWidth: 4000, MapHeight: 4000} }

func distanceBetween(t *testing.T, a, b *ecs.Entity) float64 {
	t.Helper()
	ac, _ := a.GetComponent(ecs.ComponentTypeTransform)
	bc, _ := b.GetComponent(ecs.ComponentTypeTransform)
	at, bt := ac.(*components.TransformComponent), bc.(*components.TransformComponent)
	return math.Hypot(at.X-bt.X, at.Y-bt.Y)
}

func npcAction(e *ecs.Entity) components.EncounterAction {
	nc, _ := e.GetComponent(ecs.ComponentTypeEncounterNPC)
	return nc.(*components.EncounterNPCComponent).Action
}

// FS-4EC7Z §C R9: an ally far from its hirer walks to them and stops within
// 2-4 cells; one already within 4 cells stands where it is.
func TestAllyAISystem_FollowsTheHirerWithinTwoToFourCells(t *testing.T) {
	em := ecs.NewEntityManager()
	h, hirer := hirerAt(em, 1000, 1000)
	a := fightingAlly(em, 1000+8*allyCell, 1000, hirer, 10)
	ai := NewAllyAISystem(nil, testAllyReach)

	march(em, ai, openField(), 0.2)
	assert.Equal(t, components.EncounterActionMove, npcAction(a), "far off, it walks")
	march(em, ai, openField(), 4)
	d := distanceBetween(t, a, h)
	assert.LessOrEqual(t, d, 4*allyCell)
	assert.GreaterOrEqual(t, d, 2*allyCell-10, "it stops at the near edge, not on top of them")
	assert.Equal(t, components.EncounterActionIdle, npcAction(a))

	// the hirer steps 1 cell away: still inside 4 cells, the ally stands
	ht, _ := h.GetComponent(ecs.ComponentTypeTransform)
	ht.(*components.TransformComponent).X -= allyCell
	at, _ := a.GetComponent(ecs.ComponentTypeTransform)
	before := *at.(*components.TransformComponent)
	march(em, ai, openField(), 1)
	assert.Equal(t, before.X, at.(*components.TransformComponent).X, "within 4 cells it keeps its place")
}

// FS-4EC7Z §C R9: an ally engages the nearest monster within 6 cells of it,
// walks into reach and strikes it on its cadence through the hit path; one
// farther off and not after its hirer is left alone.
func TestAllyAISystem_EngagesTheNearestMonsterWithinSixCells(t *testing.T) {
	t.Run("within 6 cells", func(t *testing.T) {
		em := ecs.NewEntityManager()
		_, hirer := hirerAt(em, 1000, 1000)
		a := fightingAlly(em, 1100, 1000, hirer, 10)
		near := hunter(em, 1100+5*allyCell, 1000)
		far := hunter(em, 1100-5.5*allyCell, 1000)
		healthOf(near).CurrentHealth, healthOf(near).MaxHealth = 1000, 1000
		healthOf(far).CurrentHealth, healthOf(far).MaxHealth = 1000, 1000
		// the monsters stand still: only the ally acts here
		ai := NewAllyAISystem(nil, testAllyReach)
		march(em, ai, openField(), 0.1)
		assert.Equal(t, near.ID, allyOf(a).Target, "the nearer of two")
		march(em, ai, openField(), 3)
		assert.Less(t, health(near), 1000, "struck through the hit path")
		assert.Equal(t, 1000, health(far))
		assert.LessOrEqual(t, distanceBetween(t, a, near), allyOf(a).AttackRange+1)
	})
	t.Run("on its cadence", func(t *testing.T) {
		em := ecs.NewEntityManager()
		_, hirer := hirerAt(em, 1000, 1000)
		fightingAlly(em, 1100, 1000, hirer, 10)
		m := hunter(em, 1140, 1000)
		healthOf(m).CurrentHealth, healthOf(m).MaxHealth = 1000, 1000
		ai := NewAllyAISystem(nil, testAllyReach)
		march(em, ai, openField(), 2.05)
		hit, _ := ResolveDamage(components.AttackSnapshot{Power: 10, Coefficient: 1, DamageType: components.DamagePhysical}, Mitigation{Defense: 2}, neverCrit())
		assert.Equal(t, 1000-3*hit, health(m), "at 0, 1 and 2 s: once a second")
	})
	t.Run("past 6 cells", func(t *testing.T) {
		em := ecs.NewEntityManager()
		_, hirer := hirerAt(em, 1000, 1000)
		a := fightingAlly(em, 1100, 1000, hirer, 10)
		m := hunter(em, 1100+7*allyCell, 1000)
		ai := NewAllyAISystem(nil, testAllyReach)
		march(em, ai, openField(), 1)
		assert.Equal(t, uuid.Nil, allyOf(a).Target)
		assert.Equal(t, 40, health(m))
	})
}

// FS-4EC7Z §C R9: a monster after the hirer is engaged at any distance.
func TestAllyAISystem_EngagesAMonsterAttackingItsHirer(t *testing.T) {
	em := ecs.NewEntityManager()
	h, hirer := hirerAt(em, 1000, 1000)
	a := fightingAlly(em, 1000+3*allyCell, 1000, hirer, 10)
	m := hunter(em, 1000-8*allyCell, 1000)
	monster(m).Target = h.ID
	ai := NewAllyAISystem(nil, testAllyReach)
	march(em, ai, openField(), 0.1)
	assert.Equal(t, m.ID, allyOf(a).Target)
}

// FS-4EC7Z §C R9, R12, Edge States: an ally whose hirer is out of play
// follows the nearest delver in play; with none, it stands where it is.
func TestAllyAISystem_HirerOutOfPlay_FollowsTheNearestDelverElseStands(t *testing.T) {
	em := ecs.NewEntityManager()
	h, hirer := hirerAt(em, 1000, 1000)
	other, _ := hirerAt(em, 3000, 1000)
	a := fightingAlly(em, 1000, 1000+allyCell, hirer, 10)
	pc, _ := h.GetComponent(ecs.ComponentTypePlayer)
	pc.(*components.PlayerComponent).Escape = true

	ai := NewAllyAISystem(nil, testAllyReach)
	march(em, ai, openField(), 12)
	assert.LessOrEqual(t, distanceBetween(t, a, other), 4*allyCell, "it follows the delver still in play")

	healthOf(other).CurrentHealth = 0
	at, _ := a.GetComponent(ecs.ComponentTypeTransform)
	before := *at.(*components.TransformComponent)
	march(em, ai, openField(), 1)
	assert.Equal(t, before, *at.(*components.TransformComponent), "none in play: it stands")
	assert.Equal(t, components.EncounterActionIdle, npcAction(a))
}

// FS-4EC7Z §C R9, Edge States: an ally paths to its hirer on the floor's
// grid, round the rock between them, as a monster does.
func TestAllyAISystem_PathsRoundTheRock(t *testing.T) {
	em := ecs.NewEntityManager()
	grid, move := floorOf(t, em, behindAWall)
	move.Grid = grid
	// the hirer in the lower hall's west end, the ally above them in the
	// upper hall: the gap is at the east end
	h, hirer := hirerAt(em, 1.5*navCell, 4.5*navCell)
	a := fightingAlly(em, 1.5*navCell, 1.5*navCell, hirer, 10)
	ai := NewAllyAISystem(grid, AllyReach{Near: 1 * navCell, Far: 2 * navCell, Engage: 6 * navCell})
	march(em, ai, move, 10)
	at, _ := a.GetComponent(ecs.ComponentTypeTransform)
	assert.Greater(t, at.(*components.TransformComponent).Y, 3*navCell, "it came round into the lower hall")
	assert.LessOrEqual(t, distanceBetween(t, a, h), 2*navCell)
}

func allyOf(e *ecs.Entity) *components.AllyComponent {
	ac, _ := e.GetComponent(ecs.ComponentTypeAlly)
	return ac.(*components.AllyComponent)
}
