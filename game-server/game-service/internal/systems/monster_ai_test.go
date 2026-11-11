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
	NewMonsterAISystem(firstRoll, nil).Update(tickSeconds, em.GetAllEntities())
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
	ai := NewMonsterAISystem(firstRoll, nil)
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
	ai := NewMonsterAISystem(firstRoll, nil)
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
	}, nil)
	move := NewMovementSystem()
	for range ticks(3) {
		entities := em.GetAllEntities()
		ai.Update(tickSeconds, entities)
		move.Update(tickSeconds, entities)
	}

	assert.Less(t, transformOf(t, g).Y, 500.0, "still leaning on the wall")
}

// demon stands a level-1 green demon (the sheet's timings, radii and moves) at
// (x, y), home there: the slam, cooling 6 s and doubled, and the fire claw,
// shown for 0.4 s.
func demon(t *testing.T, em *ecs.EntityManager, x, y float64) *ecs.Entity {
	t.Helper()
	e := hunter(em, x, y)
	m := monster(e)
	m.Archetype, m.Name, m.Boss = components.MonsterArchetypeDemon, "Demon", true
	m.AttackInterval, m.WindUp, m.AttackRange = 1.6, 0.8, 75
	m.AggroRadius, m.LeashRadius = 320, 700
	m.Claw, m.SlamCooldown, m.SlamMultiplier, m.ClawShowFor = true, 6, 2, 0.4
	velocityOf(t, e).Speed = 120
	cc, _ := e.GetComponent(ecs.ComponentTypeCombat)
	cc.(*components.CombatComponent).Attack = 28
	return e
}

// sturdy gives a delver health enough to stand through a long fight.
func sturdy(e *ecs.Entity) *ecs.Entity {
	hc, _ := e.GetComponent(ecs.ComponentTypeHealth)
	h := hc.(*components.HealthComponent)
	h.CurrentHealth, h.MaxHealth = 100000, 100000
	return e
}

// moment is one tick of a fight as the wire and the delver see it.
type moment struct {
	at     float64 // seconds since the fight's first tick
	action components.MonsterAction
	damage int // what the delver lost this tick
	still  bool
}

// duel ticks monster AI and combat for the seconds given and logs every tick.
func duel(t *testing.T, em *ecs.EntityManager, m, d *ecs.Entity, seconds float64) []moment {
	t.Helper()
	ai := NewMonsterAISystem(firstRoll, nil)
	combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)
	var log []moment
	for i := range ticks(seconds) {
		before := health(d)
		entities := em.GetAllEntities()
		ai.Update(tickSeconds, entities)
		combat.Update(tickSeconds, entities, nil)
		v := velocityOf(t, m)
		log = append(log, moment{
			at:     float64(i) * tickSeconds,
			action: monster(m).Action,
			damage: before - health(d),
			still:  v.VX == 0 && v.VY == 0,
		})
	}
	return log
}

// swing is a move starting: the tick its action changed into attack or claw.
type swing struct {
	at     float64
	action components.MonsterAction
}

func swings(log []moment) []swing {
	var out []swing
	prev := components.MonsterActionIdle
	for _, m := range log {
		striking := m.action == components.MonsterActionAttack || m.action == components.MonsterActionClaw
		if striking && m.action != prev {
			out = append(out, swing{m.at, m.action})
		}
		prev = m.action
	}
	return out
}

// hits is every tick the delver lost health: when, and how much.
func hits(log []moment) []moment {
	var out []moment
	for _, m := range log {
		if m.damage > 0 {
			out = append(out, m)
		}
	}
	return out
}

// mitigated is a monster strike of this power and coefficient through the
// delver's 10 defense.
func mitigated(power, coefficient float64) int {
	damage, _ := ResolveDamage(components.AttackSnapshot{DamageType: components.DamagePhysical, Power: power, Coefficient: coefficient}, Mitigation{Defense: 10}, neverCrit())
	return damage
}

// A demon in range opens with the slam: the 0.8 s `attack` wind-up, landing 2 ×
// its level damage. With its slam cooling it claws on every 1.6 s swing,
// landing 1 × the same tick; 6 s after the slam was chosen, the next swing is a
// slam again. FS-VHGE7 §B R16–19.
func TestMonsterAISystem_DemonMoves_SlamThenClawsUntilTheSlamCoolsDown(t *testing.T) {
	em := ecs.NewEntityManager()
	m := demon(t, em, 500, 500)
	d := sturdy(delver(em, 560, 500)) // 60 ≤ 75 range

	log := duel(t, em, m, d, 7.5)

	got := swings(log)
	want := []swing{
		{0, components.MonsterActionAttack},
		{1.6, components.MonsterActionClaw},
		{3.2, components.MonsterActionClaw},
		{4.8, components.MonsterActionClaw},
		{6.4, components.MonsterActionAttack},
	}
	require.Len(t, got, len(want), "swings: %v", got)
	for i := range want {
		assert.Equal(t, want[i].action, got[i].action, "swing %d", i)
		// each 1.6 s interval runs to the tick after, as every monster's does
		assert.InDelta(t, want[i].at, got[i].at, 0.1, "swing %d", i)
	}

	landed := hits(log)
	require.Len(t, landed, 5, "hits: %v", landed)
	slam, claw := mitigated(28, 2), mitigated(28, 1)
	assert.InDelta(t, 0.8, landed[0].at, 2*tickSeconds, "the slam lands as its wind-up ends")
	assert.InDelta(t, got[4].at+0.8, landed[4].at, 2*tickSeconds)
	assert.Equal(t, slam, landed[0].damage, "the slam hits twice as hard")
	for i := 1; i <= 3; i++ {
		assert.Equal(t, got[i].at, landed[i].at, "claw %d lands the tick it starts", i)
		assert.Equal(t, claw, landed[i].damage, "claw %d", i)
	}
	assert.Equal(t, slam, landed[4].damage)
}

// From the tick a claw lands the demon reports `claw` for 0.4 s standing still,
// then a non-striking action until its next swing, so the client sees every
// claw as a fresh change into `claw`: never claw to claw, never attack to claw.
// FS-VHGE7 §B R24.
func TestMonsterAISystem_DemonClaw_IsShownForItsWindowThenBreaks(t *testing.T) {
	em := ecs.NewEntityManager()
	m := demon(t, em, 500, 500)
	d := sturdy(delver(em, 560, 500))

	log := duel(t, em, m, d, 7.5)

	var clawFrom float64
	prev := components.MonsterActionIdle
	for _, tick := range log {
		if tick.action == components.MonsterActionClaw && prev != components.MonsterActionClaw {
			clawFrom = tick.at
		}
		if tick.action == components.MonsterActionClaw {
			assert.True(t, tick.still, "moved mid-claw at %.3f", tick.at)
			assert.Less(t, tick.at-clawFrom, 0.4+1e-9, "claw shown past its window at %.3f", tick.at)
		}
		if prev == components.MonsterActionClaw && tick.action != components.MonsterActionClaw {
			assert.InDelta(t, 0.4, tick.at-clawFrom, 2*tickSeconds, "claw window at %.3f", clawFrom)
		}

		striking := func(a components.MonsterAction) bool {
			return a == components.MonsterActionAttack || a == components.MonsterActionClaw
		}
		if striking(prev) && striking(tick.action) {
			assert.Equal(t, prev, tick.action, "%s straight into %s at %.3f", prev, tick.action, tick.at)
		}
		prev = tick.action
	}
}

// A slam whose target stepped out by the end of the wind-up whiffs, and has
// still spent the slam cooldown: the next swing is a claw. FS-VHGE7 §B R20,
// §Edge States "Target steps out during the slam wind-up".
func TestMonsterAISystem_DemonWhiffedSlam_StillSpendsTheCooldown(t *testing.T) {
	em := ecs.NewEntityManager()
	m := demon(t, em, 500, 500)
	d := sturdy(delver(em, 560, 500))
	brawl(em, 1)
	require.Equal(t, components.MonsterActionAttack, monster(m).Action)

	moveTo(t, d, 500+100, 500) // 100 > 75 × 1.25
	brawl(em, ticks(0.8))
	require.Equal(t, 100000, health(d), "the slam whiffed")

	moveTo(t, d, 560, 500)
	log := duel(t, em, m, d, 1.5)

	got := swings(log)
	require.NotEmpty(t, got)
	assert.Equal(t, components.MonsterActionClaw, got[0].action)
}

// The slam cooldown counts down every tick, whatever the demon does: one that
// wanders home with its slam cooling has it ready again 6 s on. FS-VHGE7 §B
// R20, §Edge States "Demon leashes home with its slam cooling".
func TestMonsterAISystem_DemonSlamCooldown_RunsWhileItWanders(t *testing.T) {
	em := ecs.NewEntityManager()
	m := demon(t, em, 500, 500)
	monster(m).SlamCooldownRemaining = 6

	hunt(em, ticks(3))
	assert.InDelta(t, 3, monster(m).SlamCooldownRemaining, 2*tickSeconds)

	hunt(em, ticks(3))
	assert.Zero(t, monster(m).SlamCooldownRemaining)
}

// The target leaving mid-claw changes nothing until the claw's window is out:
// the demon stands it out, then chases. The claw already landed. FS-VHGE7
// §Edge States "Target leaves mid-claw show".
func TestMonsterAISystem_TargetLeavesMidClaw_DemonFinishesItThenChases(t *testing.T) {
	em := ecs.NewEntityManager()
	m := demon(t, em, 500, 500)
	monster(m).SlamCooldownRemaining = 6 // its next swing is a claw
	d := sturdy(delver(em, 560, 500))
	brawl(em, 1)
	require.Equal(t, components.MonsterActionClaw, monster(m).Action)
	require.Equal(t, 100000-mitigated(28, 1), health(d), "the claw lands the tick it starts")

	moveTo(t, d, 700, 500)
	brawl(em, ticks(0.3))
	assert.Equal(t, components.MonsterActionClaw, monster(m).Action)
	assert.Zero(t, velocityOf(t, m).VX)

	brawl(em, ticks(0.1))
	assert.Equal(t, components.MonsterActionMove, monster(m).Action)
	assert.Positive(t, velocityOf(t, m).VX)
}

// A demon standing out its claw keeps facing its target as they move round it,
// still standing. FS-VHGE7 §B R24 "stands still, facing its target".
func TestMonsterAISystem_DemonClaw_KeepsFacingItsTargetThroughTheShow(t *testing.T) {
	em := ecs.NewEntityManager()
	m := demon(t, em, 500, 500)
	monster(m).SlamCooldownRemaining = 6 // its next swing is a claw
	d := sturdy(delver(em, 560, 500))
	brawl(em, 1)
	require.Equal(t, components.MonsterActionClaw, monster(m).Action)
	require.InDelta(t, 1.0, monster(m).FacingX, 1e-9)

	moveTo(t, d, 500, 560) // round to its south, still in range
	brawl(em, 1)

	assert.Equal(t, components.MonsterActionClaw, monster(m).Action)
	assert.InDelta(t, 0.0, monster(m).FacingX, 1e-9)
	assert.InDelta(t, 1.0, monster(m).FacingY, 1e-9)
	assert.Zero(t, velocityOf(t, m).VX)
	assert.Zero(t, velocityOf(t, m).VY)
}

// Every other archetype keeps its one strike: no claw, no multiplier, no slam
// cooldown. A ghoul swings `attack` every interval, each hit 1 × its damage.
// FS-VHGE7 §B R15.
func TestMonsterAISystem_GhoulHasNoClaw(t *testing.T) {
	em := ecs.NewEntityManager()
	g := hunter(em, 500, 500)
	d := sturdy(delver(em, 540, 500))

	log := duel(t, em, g, d, 4.5)

	got := swings(log)
	require.Len(t, got, 5, "swings: %v", got)
	for i, s := range got {
		assert.Equal(t, components.MonsterActionAttack, s.action, "swing %d", i)
		assert.InDelta(t, float64(i), s.at, 0.1, "swing %d", i)
	}
	for _, hit := range hits(log) {
		assert.Equal(t, mitigated(6, 1), hit.damage)
	}
	assert.Zero(t, monster(g).SlamCooldownRemaining)
}

// archer stands a level-1 Bone Archer (the sheet's timings, radii and shot) at
// (x, y), home there. FS-B4SG9 §A R2.
func archer(em *ecs.EntityManager, x, y float64) *ecs.Entity {
	e := em.CreateEntity()
	e.AddComponent(&components.MonsterComponent{
		Archetype:      components.MonsterArchetypeBoneArcher,
		Level:          1,
		Name:           "Bone Archer",
		HomeX:          x,
		HomeY:          y,
		Action:         components.MonsterActionIdle,
		FacingY:        1,
		AttackInterval: 2.0,
		WindUp:         0.6,
		AttackRange:    320,
		AggroRadius:    360,
		LeashRadius:    560,

		ShotProjectileType: "bone_arrow",
		ShotSpeed:          420,
		ShotRadius:         8,
		ShotMaxFlight:      700,
	})
	e.AddComponent(components.NewTransformComponent(x, y))
	e.AddComponent(components.NewVelocityComponent(0, 0, 130))
	e.AddComponent(components.NewHealthComponent(30, 30))
	e.AddComponent(&components.CombatComponent{Attack: 7, Defense: 2})
	e.AddComponent(components.NewAttackIntentComponent())
	return e
}

// handed takes what a monster has handed the CombatSystem and not had
// resolved, leaving it nothing queued.
func handed(e *ecs.Entity) []components.AttackIntent {
	c, _ := e.GetComponent(ecs.ComponentTypeAttackIntent)
	ic := c.(*components.AttackIntentComponent)
	pending := ic.Pending
	ic.Pending = nil
	return pending
}

// leaveDelver marks a delver left behind: out of play, as an escape is.
func leaveDelver(e *ecs.Entity) {
	c, _ := e.GetComponent(ecs.ComponentTypePlayer)
	c.(*components.PlayerComponent).LeftBehind = true
}

// A ranged monster walks at its target until they are within its shooting
// range, then stands and faces them. FS-B4SG9 §A R4.
func TestMonsterAISystem_Ranged_WalksToShootingRangeThenStands(t *testing.T) {
	tests := []struct {
		name   string
		apart  float64
		stands bool
	}{
		{"at 500 px it walks", 500, false},
		{"a step outside its range it walks", 321, false},
		{"at 320 px it stands", 320, true},
		{"point-blank it stands", 30, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			a := archer(em, 500, 500)
			d := delver(em, 500, 500+tt.apart)
			monster(a).Target = d.ID // 500 px is past its aggro, inside its leash

			think(em)

			m := monster(a)
			assert.InDelta(t, 0.0, m.FacingX, 1e-9)
			assert.InDelta(t, 1.0, m.FacingY, 1e-9)
			if !tt.stands {
				assert.InDelta(t, 1.0, velocityOf(t, a).VY, 1e-9)
				assert.Equal(t, components.MonsterActionMove, m.Action)
				return
			}
			assert.Zero(t, velocityOf(t, a).VX)
			assert.Zero(t, velocityOf(t, a).VY)
			assert.Equal(t, components.MonsterActionAttack, m.Action, "its interval has elapsed: it draws")
		})
	}
}

// Through the wind-up a ranged monster stands still, reports `attack` and keeps
// turning to face its target; the shot it hands over as the wind-up ends is
// aimed at where the target stands on that tick, not where they stood when the
// draw began. FS-B4SG9 §A R7, R8.
func TestMonsterAISystem_Ranged_DrawFollowsItsTargetAndShootsWhereTheyStand(t *testing.T) {
	em := ecs.NewEntityManager()
	a := archer(em, 500, 500)
	d := delver(em, 700, 500)

	think(em)
	require.Equal(t, components.MonsterActionAttack, monster(a).Action)
	require.InDelta(t, 1.0, monster(a).FacingX, 1e-9)

	var shots []components.AttackIntent
	var x, y float64
	for i := 0; len(shots) == 0 && i < ticks(0.6); i++ {
		// the target circles round to stand below it
		x, y = 500+float64(i), 700
		moveTo(t, d, x, y)
		think(em)

		m := monster(a)
		assert.Equal(t, components.MonsterActionAttack, m.Action)
		assert.Zero(t, velocityOf(t, a).VX)
		assert.Zero(t, velocityOf(t, a).VY)
		dist := math.Hypot(x-500, y-500)
		assert.InDelta(t, (x-500)/dist, m.FacingX, 1e-9, "the draw points at its target")
		assert.InDelta(t, (y-500)/dist, m.FacingY, 1e-9)
		shots = handed(a)
	}

	assert.Equal(t, []components.AttackIntent{{Kind: components.AttackMonsterShot, TargetX: x, TargetY: y}}, shots)
}

// A melee wind-up does not turn: the swing keeps the facing it began with.
func TestMonsterAISystem_MeleeWindUp_DoesNotTurn(t *testing.T) {
	em := ecs.NewEntityManager()
	g := hunter(em, 500, 500)
	d := delver(em, 540, 500)
	think(em)
	require.Equal(t, components.MonsterActionAttack, monster(g).Action)

	moveTo(t, d, 500, 540)
	think(em)

	assert.InDelta(t, 1.0, monster(g).FacingX, 1e-9)
	assert.InDelta(t, 0.0, monster(g).FacingY, 1e-9)
}

// There is no range check at release: a target who ran out of its shooting
// range during the draw, still inside the leash, is shot at where they stand.
// FS-B4SG9 §A R8.
func TestMonsterAISystem_Ranged_TargetOutOfRangeAtRelease_IsStillShotAt(t *testing.T) {
	em := ecs.NewEntityManager()
	a := archer(em, 500, 500)
	d := delver(em, 700, 500)
	think(em)

	moveTo(t, d, 1040, 500) // 540: past range × 1.25, inside the 560 leash
	var shots []components.AttackIntent
	for i := 0; len(shots) == 0 && i < ticks(0.6); i++ {
		think(em)
		shots = handed(a)
	}

	assert.Equal(t, []components.AttackIntent{{Kind: components.AttackMonsterShot, TargetX: 1040, TargetY: 500}}, shots)
}

// A ranged monster with no target when its wind-up ends looses nothing.
// FS-B4SG9 §A R8, R12.
func TestMonsterAISystem_Ranged_NoTargetAtTheWindUpsEnd_LoosesNothing(t *testing.T) {
	tests := []struct {
		name string
		lose func(t *testing.T, d *ecs.Entity)
	}{
		{"the target died", func(_ *testing.T, d *ecs.Entity) { killDelver(d) }},
		{"the target escaped", func(_ *testing.T, d *ecs.Entity) { escapeDelver(d) }},
		{"the target left", func(_ *testing.T, d *ecs.Entity) { leaveDelver(d) }},
		{"the target passed the leash", func(t *testing.T, d *ecs.Entity) { moveTo(t, d, 500+561, 500) }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			a := archer(em, 500, 500)
			d := delver(em, 700, 500)
			think(em)
			require.Equal(t, components.MonsterActionAttack, monster(a).Action)

			tt.lose(t, d)
			for range ticks(0.6) {
				think(em)
				assert.Empty(t, handed(a))
			}

			assert.Zero(t, monster(a).WindUpRemaining, "the wind-up ran out")
			assert.Equal(t, uuid.Nil, monster(a).Target)
		})
	}
}

// Its target gone and another taken up during the wind-up: the shot goes at
// the one it has when the wind-up ends. FS-B4SG9 §Edge States "Target swaps
// during a wind-up".
func TestMonsterAISystem_Ranged_TargetSwapsDuringTheWindUp_ShootsTheNewOne(t *testing.T) {
	em := ecs.NewEntityManager()
	a := archer(em, 500, 500)
	first := delver(em, 700, 500)
	think(em)
	require.Equal(t, first.ID, monster(a).Target)

	killDelver(first)
	second := delver(em, 500, 300)
	var shots []components.AttackIntent
	for i := 0; len(shots) == 0 && i < ticks(0.6); i++ {
		think(em)
		shots = handed(a)
	}

	assert.Equal(t, second.ID, monster(a).Target)
	assert.Equal(t, []components.AttackIntent{{Kind: components.AttackMonsterShot, TargetX: 500, TargetY: 300}}, shots)
}

// A delver standing against a ranged monster is shot at point-blank: it never
// steps away from them and never queues a melee strike. FS-B4SG9 §A R6.
func TestMonsterAISystem_Ranged_PointBlank_StandsAndShootsNeverStrikes(t *testing.T) {
	em := ecs.NewEntityManager()
	a := archer(em, 500, 500)
	delver(em, 545, 500)

	shots := 0
	for range ticks(5) {
		think(em)
		assert.Zero(t, velocityOf(t, a).VX)
		assert.Zero(t, velocityOf(t, a).VY)
		for _, intent := range handed(a) {
			require.Equal(t, components.AttackMonsterShot, intent.Kind)
			shots++
		}
	}

	assert.Equal(t, 3, shots, "one at 0.6 s, then every 2.0 s")
}

// Between arrows it stands idle, facing its target. FS-B4SG9 §A R6.
func TestMonsterAISystem_Ranged_BetweenArrows_StandsIdleFacingItsTarget(t *testing.T) {
	em := ecs.NewEntityManager()
	a := archer(em, 500, 500)
	d := delver(em, 700, 500)
	for i := 0; len(handed(a)) == 0; i++ {
		require.Less(t, i, ticks(0.6), "it loosed its first arrow")
		think(em)
	}

	moveTo(t, d, 500, 700)
	think(em)

	m := monster(a)
	assert.Equal(t, components.MonsterActionIdle, m.Action)
	assert.Zero(t, velocityOf(t, a).VX)
	assert.Zero(t, velocityOf(t, a).VY)
	assert.InDelta(t, 0.0, m.FacingX, 1e-9)
	assert.InDelta(t, 1.0, m.FacingY, 1e-9)
}

// Hit from beyond its aggro radius, a ranged monster takes the attacker as its
// target and walks to its shooting range. FS-B4SG9 §A R5 (aggro and
// retaliation unchanged).
func TestMonsterAISystem_Ranged_HitFromBeyondAggro_WalksToRange(t *testing.T) {
	em := ecs.NewEntityManager()
	a := archer(em, 500, 500)
	d := delver(em, 950, 500) // 450 > 360 aggro
	think(em)
	require.Equal(t, uuid.Nil, monster(a).Target)

	monster(a).LastAttacker = d.ID
	hunt(em, 1)
	assert.Equal(t, d.ID, monster(a).Target)
	assert.Equal(t, components.MonsterActionMove, monster(a).Action)

	for i := 0; monster(a).Action == components.MonsterActionMove && i < ticks(2); i++ {
		hunt(em, 1)
	}
	gap := 950 - transformOf(t, a).X
	assert.LessOrEqual(t, gap, 320.0)
	assert.Greater(t, gap, 320.0-130*tickSeconds-1e-9, "it stopped on the step that brought it in range")
	assert.Equal(t, components.MonsterActionAttack, monster(a).Action)
}

// skirmish ticks a run's systems in their order (monster AI, movement,
// projectiles, combat) for n ticks. FS-77AB6 §Requirements 27.
func skirmish(em *ecs.EntityManager, n int) {
	skirmishOn(em, NewMonsterAISystem(firstRoll, nil), NewMovementSystem(), n)
}

// skirmishOn is skirmish on a floor: its monster AI and its movement system.
func skirmishOn(em *ecs.EntityManager, ai *MonsterAISystem, move *MovementSystem, n int) {
	shots := NewProjectileSystem(em, PlayerDamageOff)
	combat := NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects)
	for range n {
		entities := em.GetAllEntities()
		ai.Update(tickSeconds, entities)
		move.Update(tickSeconds, entities)
		combat.Update(tickSeconds, entities, shots.Update(tickSeconds, entities))
	}
}

// An arrow reaching a delver in play damages them through the CombatSystem by
// the monster formula: the archer's damage at level, mitigated by the delver's
// defense. FS-B4SG9 §A R9.
func TestMonsterAISystem_Ranged_ArrowDamagesByTheMonsterFormula(t *testing.T) {
	em := ecs.NewEntityManager()
	archer(em, 500, 500)
	d := delver(em, 700, 500)

	skirmish(em, ticks(0.6))
	require.Len(t, projectiles(em), 1, "loosed")
	require.Equal(t, 150, health(d), "an arrow loosed on one tick first moves on the next")

	skirmish(em, ticks(0.5))

	assert.Equal(t, 150-mitigated(7, 1), health(d))
	assert.Empty(t, projectiles(em), "the arrow never pierces")
}
