package systems

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

/*
	The roll (FS-7P736 §A): a delver's dodge, 200 px in a straight line over
	0.4 s at one constant speed, carried by the MovementSystem through bodies
	but never through a wall; untouchable while it runs; then a 3 s wait.
*/

// rollTick is a world tick at the game's own rate, 30 Hz: a roll is 12 of them.
const rollTick = 1.0 / float64(constants.GameFrameRate)

// rollTicks is how many ticks a whole roll takes.
var rollTicks = int(math.Round(constants.RollDuration / rollTick))

// rollWorld ticks the roll, movement then combat, the order a world steps them.
type rollWorld struct {
	em     *ecs.EntityManager
	move   *MovementSystem
	combat *CombatSystem
	// impacts are handed to the next tick's combat, then cleared
	impacts []Impact
}

func newRollWorld() *rollWorld {
	em := ecs.NewEntityManager()
	return &rollWorld{
		em:     em,
		move:   NewMovementSystem(),
		combat: NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects),
	}
}

func (w *rollWorld) tick() {
	NewRollSystem().Update(rollTick, w.em.GetAllEntities())
	w.move.Update(rollTick, w.em.GetAllEntities())
	impacts := w.impacts
	w.impacts = nil
	w.combat.Update(rollTick, w.em.GetAllEntities(), impacts)
}

func (w *rollWorld) ticks(n int) {
	for range n {
		w.tick()
	}
}

// roller is a delver standing still at (x, y), sturdy enough for any hit.
func roller(w *rollWorld, x, y float64) *ecs.Entity {
	return sturdy(walking(delver(w.em, x, y), 0, 0))
}

// rollCooldownOf is the roll cooldown's remaining and total, 0, 0 when ready.
func rollCooldownOf(e *ecs.Entity) (float64, float64) {
	cooldown, ok := RollCooldown(e)
	if !ok {
		return 0, 0
	}
	return cooldown.Remaining, cooldown.Total
}

// A roll carries the delver 200 px along its heading over 12 ticks, the same
// step every tick: 500 px/s. FS-7P736 §A R3; AC 1.
func TestRoll_CarriesTheDelver200pxOver12TicksAtOneSpeed(t *testing.T) {
	w := newRollWorld()
	d := roller(w, 300, 300)

	require.True(t, StartRoll(d, 1, 0))
	prev := 300.0
	for i := range rollTicks {
		w.tick()
		at := transformOf(t, d)
		assert.InDelta(t, 500*rollTick, at.X-prev, 1e-9, "tick %d's step", i)
		assert.Equal(t, 300.0, at.Y)
		assert.True(t, Rolling(d), "tick %d: rolling", i)
		prev = at.X
	}
	assert.Equal(t, 12, rollTicks)
	assert.InDelta(t, 500.0, prev, 1e-6, "200 px in all")

	w.ticks(5)
	assert.InDelta(t, 500.0, transformOf(t, d).X, 1e-6, "and no further")
	assert.False(t, Rolling(d), "the roll is over")
}

// The heading is normalised: any length of (dir_x, dir_y) rolls 200 px along
// it. FS-7P736 §A R2.
func TestRoll_TheHeadingIsNormalised(t *testing.T) {
	w := newRollWorld()
	d := roller(w, 300, 300)

	require.True(t, StartRoll(d, 30, 40))
	w.ticks(rollTicks + 2)

	at := transformOf(t, d)
	assert.InDelta(t, 300+0.6*200, at.X, 1e-6)
	assert.InDelta(t, 300+0.8*200, at.Y, 1e-6)
}

// Nothing that scales a walk scales the roll: worn move speed, a slowed walk,
// an attack pin and the walk input held through it. The pace is a walk's
// figure (DefaultSpeed), never read. FS-7P736 §A R3, R8; AC 1.
func TestRoll_TheSameWhateverScalesTheWalk(t *testing.T) {
	tests := []struct {
		name  string
		setup func(d *ecs.Entity)
	}{
		{"a plain walk", func(*ecs.Entity) {}},
		{"worn move speed", func(d *ecs.Entity) { velocityOf(t, d).Speed = constants.DefaultSpeed * 1.6 }},
		{"a slowed walk", func(d *ecs.Entity) { velocityOf(t, d).Speed = constants.DefaultSpeed * 0.3 }},
		{"an attack pin", func(d *ecs.Entity) { d.AddComponent(&components.AttackPinComponent{Remaining: 5}) }},
		{"walking against the roll", func(d *ecs.Entity) { velocityOf(t, d).VX, velocityOf(t, d).VY = -1, 1 }},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := newRollWorld()
			d := roller(w, 300, 300)
			tt.setup(d)

			require.True(t, StartRoll(d, 1, 0))
			w.ticks(rollTicks)

			assert.InDelta(t, 500.0, transformOf(t, d).X, 1e-6)
			assert.Equal(t, 300.0, transformOf(t, d).Y, "held input never steers it")
		})
	}
}

// Walking input is ignored for the roll's length; the velocity the client
// holds applies again on the tick after it ends. FS-7P736 §A R8; AC 7.
func TestRoll_TheHeldWalkResumesTheTickAfter(t *testing.T) {
	w := newRollWorld()
	d := roller(w, 300, 300)
	velocityOf(t, d).VY = 1

	require.True(t, StartRoll(d, 1, 0))
	w.ticks(rollTicks)
	require.Equal(t, 300.0, transformOf(t, d).Y)

	w.tick()
	assert.InDelta(t, 300+constants.DefaultSpeed*rollTick, transformOf(t, d).Y, 1e-9, "the walk is back")
	assert.InDelta(t, 500.0, transformOf(t, d).X, 1e-6)
}

// What stands in the roll's way stops it where it touches, and the roll ends
// there, early: a wall, a shut door, a shut pit, a stone block, the world's
// edge. FS-7P736 §A R4; AC 2; Edge States "Rolling over a pit's edge".
func TestRoll_StopsAtWhatBlocksAWalk(t *testing.T) {
	shutDoor := func(w *rollWorld, x float64) *ecs.Entity {
		door := w.em.CreateEntity()
		door.AddComponent(components.NewTransformComponent(x, 0))
		door.AddComponent(&components.DoorComponent{Width: 20, Height: 600})
		door.AddComponent(components.NewOpenableComponent(false))
		return door
	}
	tests := []struct {
		name  string
		setup func(w *rollWorld)
		wantX float64
	}{
		{"a wall", func(w *rollWorld) {
			wall := w.em.CreateEntity()
			wall.AddComponent(components.NewTransformComponent(400, 0))
			wall.AddComponent(&components.WallComponent{Width: 20, Height: 600})
		}, 400 - constants.PlayerRadius},
		// a floor's lone closed cell is a one-cell wall rect (levelgen's shell)
		{"a one-cell pillar", func(w *rollWorld) {
			pillar := w.em.CreateEntity()
			pillar.AddComponent(components.NewTransformComponent(400, 260))
			pillar.AddComponent(&components.WallComponent{Width: 80, Height: 80})
		}, 400 - constants.PlayerRadius},
		{"a shut door", func(w *rollWorld) { shutDoor(w, 400) }, 400 - constants.PlayerRadius},
		{"a shut pit", func(w *rollWorld) {
			shutDoor(w, 400).AddComponent(&components.BarrierComponent{Kind: components.BarrierPit})
		}, 400 - constants.PlayerRadius},
		{"a stone block", func(w *rollWorld) {
			block := w.em.CreateEntity()
			block.AddComponent(&components.SealPieceComponent{Kind: components.SealPieceBlock, Cell: components.Cell{X: 5, Y: 3}})
			block.AddComponent(components.NewTransformComponent(440, 300))
			block.AddComponent(&components.StoneBlockComponent{Size: 80})
		}, 400 - constants.PlayerRadius},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := newRollWorld()
			tt.setup(w)
			d := roller(w, 300, 300)

			require.True(t, StartRoll(d, 1, 0))
			w.ticks(rollTicks + 5)

			assert.InDelta(t, tt.wantX, transformOf(t, d).X, 1e-6, "flush against it, never into it")
			assert.Equal(t, 300.0, transformOf(t, d).Y)
			assert.False(t, Rolling(d), "the roll is over")
		})
	}

	t.Run("the world's edge", func(t *testing.T) {
		w := newRollWorld()
		d := roller(w, constants.MapWidth-100, 300)

		require.True(t, StartRoll(d, 1, 0))
		w.ticks(rollTicks + 5)

		assert.InDelta(t, constants.MapWidth-constants.PlayerRadius, transformOf(t, d).X, 1e-6)
		assert.False(t, Rolling(d))
	})
}

// An afloat (Levitate) roller passes a shut pit as its walk does, the whole
// 200 px; a grounded roller beside them stops at the same pit's edge. A pit is
// rock only to a body on the ground, so a roll begun over one is never pushed
// out of it. FS-7P736 §A R4, Edge States "Afloat"; Reconciled at build
// (I-7P736-1); FS-X2CMM §J R51.
func TestRoll_AfloatPassesShutPits(t *testing.T) {
	w := newRollWorld()
	addPit(w.em, 400, 0, 80, constants.MapHeight)
	floating := lift(roller(w, 300, 200), 60)
	grounded := roller(w, 300, 600)

	require.True(t, StartRoll(floating, 1, 0))
	require.True(t, StartRoll(grounded, 1, 0))
	w.ticks(rollTicks + 5)

	assert.InDelta(t, 300+constants.RollDistance, transformOf(t, floating).X, 1e-6, "afloat: the whole roll, over the pit")
	assert.InDelta(t, 400-constants.PlayerRadius, transformOf(t, grounded).X, 1e-6, "grounded: flush against the pit, never into it")
	assert.False(t, Rolling(floating), "both rolls are over")
	assert.False(t, Rolling(grounded))
}

// It ends early: the tick after a roll touches a wall it is over, well short
// of its 12 ticks, and the walk is back. FS-7P736 §A R4; Edge States "Roll
// started touching a wall".
func TestRoll_EndsTheTickAfterItTouches(t *testing.T) {
	w := newRollWorld()
	wall := w.em.CreateEntity()
	wall.AddComponent(components.NewTransformComponent(300+constants.PlayerRadius, 0))
	wall.AddComponent(&components.WallComponent{Width: 20, Height: 600})
	d := roller(w, 300, 300)

	require.True(t, StartRoll(d, 1, 0))
	w.tick()
	assert.True(t, Rolling(d), "rolling on the tick it touched")
	w.tick()
	assert.False(t, Rolling(d), "over on the next")
	remaining, total := rollCooldownOf(d)
	assert.Positive(t, remaining, "its cooldown runs: it started")
	assert.Equal(t, constants.RollCooldown, total)
}

// Bodies never stop a roll: it passes through a monster, and through another
// delver rolling the other way. FS-7P736 §A R4; AC 2; Edge States "Two delvers
// rolling through each other".
func TestRoll_PassesThroughBodies(t *testing.T) {
	w := newRollWorld()
	w.move.PlayersPassThrough = false
	hunter(w.em, 400, 300)
	d := roller(w, 300, 300)
	other := roller(w, 600, 300)

	require.True(t, StartRoll(d, 1, 0))
	require.True(t, StartRoll(other, -1, 0))
	w.ticks(rollTicks)

	assert.InDelta(t, 500.0, transformOf(t, d).X, 1e-6)
	assert.InDelta(t, 400.0, transformOf(t, other).X, 1e-6)
}

// A rolling delver pushes no stone block: the roll is no walk. FS-7P736 §A R4.
func TestRoll_PushesNoBlock(t *testing.T) {
	w := newPushWorld(t)
	x, y := westOfBlock()
	d := w.addDelver(x, y, 1, 0)
	require.True(t, StartRoll(d, 1, 0))

	w.run(constants.RollDuration)

	assert.Equal(t, components.Cell{X: 5, Y: 5}, cellOf(w.block), "not pushed")
}

// No hit lands on a rolling delver, from its first tick to its last: a
// monster's strike, its shot and its area ability each leave health as it was
// and apply nothing; the same hit lands the tick after the roll ends.
// FS-7P736 §A R5; AC 3.
func TestRoll_NoHitLandsWhileRolling(t *testing.T) {
	t.Run("a monster's strike", func(t *testing.T) {
		w := newRollWorld()
		d := roller(w, 300, 300)
		poisoning := monsterStrike()
		poisoning.PoisonSeconds = 4

		require.True(t, StartRoll(d, 1, 0))
		for i := range rollTicks {
			w.impacts = []Impact{{Attack: poisoning, TargetEntityID: d.ID}}
			w.tick()
			assert.Equal(t, 100000, health(d), "tick %d: unhurt", i)
		}
		assert.False(t, d.HasComponent(ecs.ComponentTypePoison), "and nothing applied")

		w.impacts = []Impact{{Attack: poisoning, TargetEntityID: d.ID}}
		w.tick()
		require.False(t, Rolling(d))
		assert.Less(t, health(d), 100000, "the tick after, the same hit lands")
		assert.True(t, d.HasComponent(ecs.ComponentTypePoison))
	})

	t.Run("a monster's shot", func(t *testing.T) {
		em := ecs.NewEntityManager()
		d := sturdy(delver(em, 50, 0))
		require.True(t, StartRoll(d, 0, 1))
		shot := em.CreateEntity()
		shot.AddComponent(components.NewTransformComponent(0, 0))
		shot.AddComponent(components.NewVelocityComponent(100, 0, 100))
		shot.AddComponent(components.NewProjectileComponent(monsterStrike(), 100, 500, 10, "arrow"))

		impacts := NewProjectileSystem(em, PlayerDamageOff).Update(0.35, em.GetAllEntities())
		assert.Empty(t, impacts, "it flies through the roller")

		d.RemoveComponent(ecs.ComponentTypeRoll)
		back := em.CreateEntity()
		back.AddComponent(components.NewTransformComponent(0, 0))
		back.AddComponent(components.NewVelocityComponent(100, 0, 100))
		back.AddComponent(components.NewProjectileComponent(monsterStrike(), 100, 500, 10, "arrow"))
		impacts = NewProjectileSystem(em, PlayerDamageOff).Update(0.35, []*ecs.Entity{d, back})
		assert.Len(t, impacts, 1, "once the roll is over the shot hits")
	})

	t.Run("a monster's area ability", func(t *testing.T) {
		slam := func(rolling bool) int {
			em := ecs.NewEntityManager()
			bloodTroll(t, em, 500, 500)
			d := sturdy(delver(em, 580, 500))
			brawl(em, 1)
			if rolling {
				require.True(t, StartRoll(d, 0, 1))
			}
			brawl(em, ticks(0.9))
			return health(d)
		}
		assert.Equal(t, 100000, slam(true), "the slam lands on no roller")
		assert.Less(t, slam(false), 100000, "it lands on one standing")
	})

	t.Run("a monster's targeted strike", func(t *testing.T) {
		w := newRollWorld()
		g := hunter(w.em, 340, 300)
		g.AddComponent(components.NewAttackIntentComponent())
		d := roller(w, 300, 300)

		require.True(t, StartRoll(d, 0, 0.0001))
		intend(g, components.AttackIntent{Kind: components.AttackTargeted, TargetEntityID: d.ID})
		w.combat.Update(rollTick, w.em.GetAllEntities(), nil)
		assert.Equal(t, 100000, health(d))
	})
}

// A lasting poison already on the delver keeps ticking through the roll: it
// is no blow. FS-7P736 §A R5.
func TestRoll_APoisonAlreadyOnTheDelverRunsOn(t *testing.T) {
	w := newRollWorld()
	d := roller(w, 300, 300)
	Poison(d, 4)

	require.True(t, StartRoll(d, 1, 0))
	before, _ := PoisonedFor(d)
	NewPoisonSystem(10).Update(rollTick, w.em.GetAllEntities())

	after, _ := PoisonedFor(d)
	assert.Less(t, after, before)
	assert.Less(t, health(d), 100000)
}

// The roll cooldown starts on the tick the roll does, 3 s long: a roll inside
// it is refused, the first after it rolls. It is no ability's cooldown, so no
// attack speed touches it. FS-7P736 §A R7; AC 6.
func TestRoll_TheCooldownRunsThreeSeconds(t *testing.T) {
	w := newRollWorld()
	d := roller(w, 300, 300)

	require.True(t, StartRoll(d, 1, 0))
	remaining, total := rollCooldownOf(d)
	assert.Equal(t, 3.0, remaining)
	assert.Equal(t, 3.0, total)

	cooldownTicks := int(math.Round(constants.RollCooldown / rollTick))
	w.ticks(cooldownTicks - 1)
	assert.False(t, StartRoll(d, -1, 0), "a tick short of 3 s: refused")
	w.tick()
	remaining, _ = rollCooldownOf(d)
	assert.Zero(t, remaining, "ready at 3 s")
	assert.True(t, StartRoll(d, -1, 0), "and it rolls")
}

// Refused, nothing changed: out of play, inside the cooldown, already
// rolling, inside a charge in flight, a zero or non-finite heading.
// FS-7P736 §A R2, R6; AC 6.
func TestRoll_Refusals_ChangeNothing(t *testing.T) {
	tests := []struct {
		name       string
		setup      func(w *rollWorld, d *ecs.Entity)
		dirX, dirY float64
	}{
		{"dead", func(_ *rollWorld, d *ecs.Entity) { killDelver(d) }, 1, 0},
		{"escaped", func(_ *rollWorld, d *ecs.Entity) { escapeDelver(d) }, 1, 0},
		{"inside the cooldown", func(_ *rollWorld, d *ecs.Entity) {
			d.AddComponent(&components.RollCooldownComponent{Remaining: 0.5, Total: 3})
		}, 1, 0},
		{"inside a dash", func(_ *rollWorld, d *ecs.Entity) {
			d.AddComponent(&components.DashComponent{Carry: components.Carry{DirX: 0, DirY: 1, Speed: 450, Remaining: 100}})
		}, 1, 0},
		{"a zero heading", func(*rollWorld, *ecs.Entity) {}, 0, 0},
		{"a NaN heading", func(*rollWorld, *ecs.Entity) {}, math.NaN(), 1},
		{"an infinite heading", func(*rollWorld, *ecs.Entity) {}, math.Inf(1), 0},
		{"a heading too long to measure", func(*rollWorld, *ecs.Entity) {}, math.MaxFloat64, math.MaxFloat64},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := newRollWorld()
			d := roller(w, 300, 300)
			tt.setup(w, d)
			cooldownBefore, _ := rollCooldownOf(d)

			assert.False(t, StartRoll(d, tt.dirX, tt.dirY))

			assert.False(t, Rolling(d), "no roll")
			cooldownAfter, _ := rollCooldownOf(d)
			assert.Equal(t, cooldownBefore, cooldownAfter, "no cooldown started")
		})
	}

	t.Run("already rolling", func(t *testing.T) {
		w := newRollWorld()
		d := roller(w, 300, 300)
		require.True(t, StartRoll(d, 1, 0))
		w.tick()
		d.RemoveComponent(ecs.ComponentTypeRollCooldown)

		assert.False(t, StartRoll(d, 0, 1))
		dirX, dirY, rolling := RollHeading(d)
		assert.True(t, rolling)
		assert.Equal(t, [2]float64{1, 0}, [2]float64{dirX, dirY}, "the roll in flight runs on")
		assert.False(t, d.HasComponent(ecs.ComponentTypeRollCooldown), "no cooldown started")
	})
}

// A rolling delver resolves no attack or ability: what is queued for them is
// dropped, not kept for after. FS-7P736 §A R8; AC 7.
func TestRoll_QueuedAttacksAreDroppedWhileRolling(t *testing.T) {
	w := newRollWorld()
	d := roller(w, 300, 300)
	target := dummy(w.em, 330, 300)

	require.True(t, StartRoll(d, 0, 1))
	intend(d, components.AttackIntent{Kind: components.AttackTargeted, TargetEntityID: target.ID})
	intend(d, components.AttackIntent{Kind: components.AttackDash, TargetX: 300, TargetY: 0})
	w.tick()

	assert.Equal(t, 1000, health(target), "no strike")
	assert.False(t, d.HasComponent(ecs.ComponentTypeDash), "no dash")
	assert.Equal(t, 100, pool(d), "nothing spent")
	w.ticks(rollTicks)
	assert.Equal(t, 1000, health(target), "and nothing kept for after")
}

// No dash starts on a rolling body, whatever asks for it: one carry at a time,
// so the roll in flight is the one the movement carries. FS-7P736 §A R6, R8.
func TestRoll_NoDashStartsMidRoll(t *testing.T) {
	w := newRollWorld()
	d := roller(w, 300, 300)
	require.True(t, StartRoll(d, 0, 1))

	startCharge(d, transformOf(t, d), 400, 300)

	assert.False(t, d.HasComponent(ecs.ComponentTypeDash), "no charge in flight")
	carry, ok := carryOf(d)
	require.True(t, ok)
	assert.Equal(t, [2]float64{0, 1}, [2]float64{carry.DirX, carry.DirY}, "the roll carries on")
	w.tick()
	assert.Equal(t, 300.0, transformOf(t, d).X, "carried along the roll, not the dash")
	assert.Greater(t, transformOf(t, d).Y, 300.0)
}

// A roll on a body out of play is over on the next tick: a delver a poison
// tick kills mid-roll stands where it fell. FS-7P736 Edge States "Death
// mid-roll".
func TestRoll_EndsWithTheDelver(t *testing.T) {
	w := newRollWorld()
	d := roller(w, 300, 300)

	require.True(t, StartRoll(d, 1, 0))
	w.ticks(3)
	killDelver(d)
	stood := transformOf(t, d).X
	w.ticks(3)

	assert.False(t, Rolling(d))
	assert.Equal(t, stood, transformOf(t, d).X)
}
