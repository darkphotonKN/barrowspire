package systems

import (
	"fmt"
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// hunter stands a level-1 ghoul (the sheet's timings and radii) at (x, y), home there.
func hunter(em *ecs.EntityManager, x, y float64) *ecs.Entity {
	e := em.CreateEntity()
	e.AddComponent(&components.MonsterComponent{
		Archetype:      components.MonsterArchetypeGhoul,
		Level:          1,
		Name:           "Ghoul",
		HomeX:          x,
		HomeY:          y,
		Action:         components.MonsterActionIdle,
		FacingY:        1,
		AttackInterval: 1.0,
		WindUp:         0.35,
		AttackRange:    45,
		AggroRadius:    260,
		LeashRadius:    520,
	})
	e.AddComponent(components.NewTransformComponent(x, y))
	e.AddComponent(components.NewVelocityComponent(0, 0, 150))
	e.AddComponent(components.NewHealthComponent(40, 40))
	e.AddComponent(&components.CombatComponent{Attack: 6, Defense: 2})
	e.AddComponent(components.NewAttackIntentComponent())
	return e
}

func velocityOf(t *testing.T, e *ecs.Entity) *components.VelocityComponent {
	t.Helper()
	c, ok := e.GetComponent(ecs.ComponentTypeVelocity)
	require.True(t, ok)
	return c.(*components.VelocityComponent)
}

// firstRoll pins the wander roll, so destinations are repeatable.
func firstRoll() float64 { return 0.25 }

func think(em *ecs.EntityManager) {
	NewMonsterAISystem(firstRoll).Update(tickSeconds, em.GetAllEntities())
}

// A delver inside the aggro radius is acquired and chased, straight at them.
// FS-77AB6 §Requirements 26 "Acquire", "Chase".
func TestMonsterAISystem_DelverInsideAggro_IsChased(t *testing.T) {
	em := ecs.NewEntityManager()
	g := hunter(em, 500, 500)
	d := delver(em, 700, 500)

	think(em)

	assert.Equal(t, d.ID, monster(g).Target)
	assert.InDelta(t, 1.0, velocityOf(t, g).VX, 1e-9)
	assert.InDelta(t, 0.0, velocityOf(t, g).VY, 1e-9)
	assert.Equal(t, components.MonsterActionMove, monster(g).Action)
}

// Several delvers in aggro: the nearest is acquired. An out-of-play delver, dead
// or escaped, never is. FS-77AB6 §Requirements 26 "Acquire", 14.
func TestMonsterAISystem_Acquire(t *testing.T) {
	tests := []struct {
		name     string
		outFirst func(*ecs.Entity)
		want     string // "near", "far" or "none"
	}{
		{"the nearest of two", nil, "near"},
		{"not a dead delver", killDelver, "far"},
		{"not an escaped delver", escapeDelver, "far"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			g := hunter(em, 500, 500)
			near := delver(em, 600, 500)
			far := delver(em, 500, 700)
			if tt.outFirst != nil {
				tt.outFirst(near)
			}

			think(em)

			want := map[string]uuid.UUID{"near": near.ID, "far": far.ID}[tt.want]
			assert.Equal(t, want, monster(g).Target)
		})
	}
}

// Outside the aggro radius nobody is acquired.
func TestMonsterAISystem_DelverOutsideAggro_IsNotAcquired(t *testing.T) {
	em := ecs.NewEntityManager()
	g := hunter(em, 500, 500)
	delver(em, 800, 500) // 300 > 260

	think(em)

	assert.Equal(t, uuid.Nil, monster(g).Target)
}

// A monster keeps its target: a closer delver walking up does not pull it off.
// FS-77AB6 §Requirements 26 "Keep the target".
func TestMonsterAISystem_KeepsItsTarget(t *testing.T) {
	em := ecs.NewEntityManager()
	g := hunter(em, 500, 500)
	first := delver(em, 700, 500)
	think(em)

	closer := delver(em, 560, 500)
	think(em)

	require.NotEqual(t, closer.ID, monster(g).Target)
	assert.Equal(t, first.ID, monster(g).Target)
}

// hunt ticks monster AI and movement together, the way a run does, for n ticks.
func hunt(em *ecs.EntityManager, n int) {
	ai := NewMonsterAISystem(firstRoll)
	move := NewMovementSystem()
	for range n {
		entities := em.GetAllEntities()
		ai.Update(tickSeconds, entities)
		move.Update(tickSeconds, entities)
	}
}

// With nobody in aggro a monster wanders, and keeps near home while it does.
// FS-77AB6 §Requirements 26 "Wander".
func TestMonsterAISystem_NobodyInAggro_WandersNearHome(t *testing.T) {
	em := ecs.NewEntityManager()
	g := hunter(em, 500, 500)

	think(em)
	v := velocityOf(t, g)
	assert.False(t, v.VX == 0 && v.VY == 0, "it stood still")
	assert.Equal(t, components.MonsterActionMove, monster(g).Action)

	moved := false
	for range 300 {
		hunt(em, 1)
		at := transformOf(t, g)
		moved = moved || at.X != 500 || at.Y != 500
		assert.LessOrEqual(t, math.Hypot(at.X-500, at.Y-500), constants.MonsterHomeRadius+arrivalRadius)
	}
	assert.True(t, moved)
}

func moveTo(t *testing.T, e *ecs.Entity, x, y float64) {
	t.Helper()
	at := transformOf(t, e)
	at.X, at.Y = x, y
}

// A target farther than the leash radius is dropped, and the monster wanders
// home again. FS-77AB6 §Requirements 26 "Leash".
func TestMonsterAISystem_TargetBeyondLeash_IsDropped(t *testing.T) {
	em := ecs.NewEntityManager()
	g := hunter(em, 500, 500)
	d := delver(em, 700, 500)
	think(em)
	require.Equal(t, d.ID, monster(g).Target)

	moveTo(t, d, 500+530, 500) // 530 > 520
	think(em)

	assert.Equal(t, uuid.Nil, monster(g).Target)
	assert.NotEqual(t, components.MonsterActionAttack, monster(g).Action)
}

// A target who dies or escapes is dropped that tick; another delver in aggro is
// taken up instead. FS-77AB6 §Edge States "Delver dies/escapes mid-chase".
func TestMonsterAISystem_TargetOutOfPlay_IsDropped(t *testing.T) {
	for name, out := range map[string]func(*ecs.Entity){"dies": killDelver, "escapes": escapeDelver} {
		t.Run(name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			g := hunter(em, 500, 500)
			d := delver(em, 600, 500)
			think(em)
			require.Equal(t, d.ID, monster(g).Target)

			out(d)
			think(em)
			assert.Equal(t, uuid.Nil, monster(g).Target, "the dropped target was kept")

			other := delver(em, 500, 700)
			think(em)
			assert.Equal(t, other.ID, monster(g).Target)
		})
	}
}

// A monster hit from beyond its aggro radius goes after whoever hit it, at any
// distance. FS-77AB6 §Requirements 26 "Retaliate".
func TestMonsterAISystem_HitFromOutsideAggro_AcquiresTheAttacker(t *testing.T) {
	em := ecs.NewEntityManager()
	g := hunter(em, 500, 500)
	archer := delver(em, 500+400, 500) // 400 > 260 aggro
	monster(g).LastAttacker = archer.ID

	think(em)

	assert.Equal(t, archer.ID, monster(g).Target)
	assert.Greater(t, velocityOf(t, g).VX, 0.0)
}

// A hit is answered once: once the monster has closed inside its leash radius
// of the attacker, the leash applies again, and after it drops them the old
// hit does not pull the monster back on. FS-77AB6 §Requirements 26 "Leash".
func TestMonsterAISystem_OldHit_IsNotAnsweredTwice(t *testing.T) {
	em := ecs.NewEntityManager()
	g := hunter(em, 500, 500)
	archer := delver(em, 500+600, 500) // beyond the 520 leash
	monster(g).LastAttacker = archer.ID

	think(em)
	require.Equal(t, archer.ID, monster(g).Target)

	moveTo(t, archer, 500+500, 500) // closed inside the leash
	think(em)
	require.Equal(t, archer.ID, monster(g).Target)

	moveTo(t, archer, 500+600, 500) // away again, with no new hit
	think(em)

	assert.Equal(t, uuid.Nil, monster(g).Target)
	think(em)
	assert.Equal(t, uuid.Nil, monster(g).Target)
}

// troll stands a level-1 troll (the sheet's timings and radii) at (x, y), home there.
func troll(t *testing.T, em *ecs.EntityManager, x, y float64) *ecs.Entity {
	t.Helper()
	e := hunter(em, x, y)
	m := monster(e)
	m.Archetype, m.Name = components.MonsterArchetypeTroll, "Troll"
	m.AttackInterval, m.WindUp, m.AttackRange = 2.0, 0.7, 60
	m.AggroRadius, m.LeashRadius = 220, 480
	velocityOf(t, e).Speed = 90
	return e
}

// An archer who shoots from beyond the leash radius gets no free kills: the
// monster keeps after them, leash or not, until it has closed inside its leash
// radius of them once; then the leash applies as normal.
// FS-77AB6 §Requirements 26 "Retaliate", "Leash" (user decision 2026-10-09).
func TestMonsterAISystem_KitingArcherBeyondLeash_IsChasedUntilClosed(t *testing.T) {
	for _, shotFrom := range []float64{500, 550} {
		t.Run(fmt.Sprintf("arrow from %.0f px", shotFrom), func(t *testing.T) {
			em := ecs.NewEntityManager()
			g := troll(t, em, 500, 500)
			archer := delver(em, 500+shotFrom, 500) // beyond the troll's 480 leash
			monster(g).LastAttacker = archer.ID

			closed := false
			for range ticks(3) {
				hunt(em, 1)
				require.Equal(t, archer.ID, monster(g).Target, "the archer was let go before the troll closed")
				if math.Abs(transformOf(t, g).X-transformOf(t, archer).X) <= 480 {
					closed = true
					break
				}
			}
			require.True(t, closed, "the troll never closed inside its leash radius")
			hunt(em, 1) // its next tick sees it has closed
			require.Equal(t, archer.ID, monster(g).Target)

			// the archer kites away again without loosing another arrow
			moveTo(t, archer, transformOf(t, g).X+shotFrom, 500)
			think(em)
			assert.Equal(t, uuid.Nil, monster(g).Target, "the leash applies once it has closed")
		})
	}
}

// brawl ticks monster AI and combat together, the way a run does, for n ticks.
func brawl(em *ecs.EntityManager, n int) {
	ai := NewMonsterAISystem(firstRoll)
	combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)
	for range n {
		entities := em.GetAllEntities()
		ai.Update(tickSeconds, entities)
		combat.Update(tickSeconds, entities, nil)
	}
}

// ticks is how many ticks cover the seconds given.
func ticks(seconds float64) int {
	return int(math.Ceil(seconds/tickSeconds)) + 1
}

// In range, the monster stops, faces its target and winds up; at the end of the
// wind-up the strike lands through the CombatSystem's formula, armor and all.
// FS-77AB6 §Requirements 5, 26 "Attack".
func TestMonsterAISystem_InRange_WindsUpThenStrikes(t *testing.T) {
	em := ecs.NewEntityManager()
	g := hunter(em, 500, 500)
	d := delver(em, 540, 500) // 40 ≤ 45 range

	brawl(em, 1)
	m := monster(g)
	assert.Equal(t, components.MonsterActionAttack, m.Action)
	assert.Zero(t, velocityOf(t, g).VX)
	assert.Zero(t, velocityOf(t, g).VY)
	assert.InDelta(t, 1.0, m.FacingX, 1e-9)
	assert.Equal(t, 150, health(d), "the strike landed before the wind-up ended")

	brawl(em, ticks(0.35))

	// 6 power, coefficient 1, no stat; mitigated by the delver's 10 defense
	want, _ := ResolveDamage(components.AttackSnapshot{DamageType: components.DamagePhysical, Power: 6, Coefficient: 1}, Mitigation{Defense: 10}, neverCrit())
	assert.Equal(t, 150-want, health(d))
}

// The delver steps beyond range × 1.25 during the wind-up: the swing whiffs.
func TestMonsterAISystem_TargetLeavesReachDuringWindUp_Whiffs(t *testing.T) {
	em := ecs.NewEntityManager()
	g := hunter(em, 500, 500)
	d := delver(em, 540, 500)
	brawl(em, 1)
	require.Equal(t, components.MonsterActionAttack, monster(g).Action)

	moveTo(t, d, 500+57, 500) // 57 > 45 × 1.25
	brawl(em, ticks(0.35))

	assert.Equal(t, 150, health(d))
}

// Just inside range × 1.25 at the end of the wind-up still counts.
func TestMonsterAISystem_TargetJustInsideReach_IsStruck(t *testing.T) {
	em := ecs.NewEntityManager()
	hunter(em, 500, 500)
	d := delver(em, 540, 500)
	brawl(em, 1)

	moveTo(t, d, 500+56, 500) // 56 ≤ 56.25
	brawl(em, ticks(0.35))

	assert.Less(t, health(d), 150)
}

// Between strikes it shows another action, so every swing reads as a new one;
// the next swing waits for the attack interval.
func TestMonsterAISystem_StrikesOncePerInterval(t *testing.T) {
	em := ecs.NewEntityManager()
	g := hunter(em, 500, 500)
	d := delver(em, 540, 500)

	for i := 0; health(d) == 150 && i < ticks(1); i++ {
		brawl(em, 1)
	}
	afterOne := health(d)
	require.Less(t, afterOne, 150)
	brawl(em, 1)
	assert.NotEqual(t, components.MonsterActionAttack, monster(g).Action, "no break between swings")

	brawl(em, ticks(0.5))
	assert.Equal(t, afterOne, health(d), "struck again inside the interval")

	brawl(em, ticks(0.6))
	assert.Less(t, health(d), afterOne)
}

// A dead monster does nothing, and one that dies mid-wind-up never lands the
// strike. FS-77AB6 §Requirements 26.
func TestMonsterAISystem_DeadMonster_NeitherMovesNorStrikes(t *testing.T) {
	em := ecs.NewEntityManager()
	g := hunter(em, 500, 500)
	d := delver(em, 540, 500)
	brawl(em, 1)
	require.Equal(t, components.MonsterActionAttack, monster(g).Action)

	hc, _ := g.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 0
	NewMonsterDeathSystem(em, 4).Update(tickSeconds, em.GetAllEntities())
	moveTo(t, d, 600, 500)
	brawl(em, ticks(1))

	assert.Equal(t, 150, health(d))
	assert.Equal(t, components.MonsterActionDead, monster(g).Action)
	assert.Equal(t, uuid.Nil, monster(g).Target)
	assert.False(t, g.HasComponent(ecs.ComponentTypeVelocity))
}

// A monster walking into a wall gives that destination up after the stall time
// and picks another, so it never wedges for good. FS-77AB6 §Edge States
// "Monster wedged on a wall".
func TestMonsterAISystem_WedgedOnAWall_AbandonsTheDestination(t *testing.T) {
	em := ecs.NewEntityManager()
	g := hunter(em, 500, 500)
	wall := em.CreateEntity()
	wall.AddComponent(components.NewTransformComponent(400, 525))
	wall.AddComponent(&components.WallComponent{Width: 200, Height: 20})

	// first destination straight down through the wall, the next straight up
	rolls := []float64{0.25, 0.25, 0.25, 0.75}
	ai := NewMonsterAISystem(func() float64 {
		r := rolls[0]
		if len(rolls) > 1 {
			rolls = rolls[1:]
		}
		return r
	})
	move := NewMovementSystem()
	for range ticks(3) {
		entities := em.GetAllEntities()
		ai.Update(tickSeconds, entities)
		move.Update(tickSeconds, entities)
	}

	assert.Less(t, transformOf(t, g).Y, 500.0, "still leaning on the wall")
}
