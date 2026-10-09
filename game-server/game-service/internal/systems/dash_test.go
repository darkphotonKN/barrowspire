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
	The warrior's charge (the dash skill): a gradual move over several ticks,
	carried by the MovementSystem in place of the walk, not a teleport. Walls,
	closed doors and the world's edge stop it, as do death, leaving play and a
	new cast. It passes through bodies, as the teleport did, so a burning trail
	still lies under the monsters it ran through.
*/

// dashWorld ticks movement then combat, the order a world steps them in.
type dashWorld struct {
	em     *ecs.EntityManager
	move   *MovementSystem
	combat *CombatSystem
}

func newDashWorld() *dashWorld {
	em := ecs.NewEntityManager()
	return &dashWorld{
		em:     em,
		move:   NewMovementSystem(),
		combat: NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects),
	}
}

func (w *dashWorld) tick() {
	w.move.Update(tickSeconds, w.em.GetAllEntities())
	w.combat.Update(tickSeconds, w.em.GetAllEntities(), nil)
}

func (w *dashWorld) ticks(n int) {
	for range n {
		w.tick()
	}
}

// positions ticks n times and reports where the entity stands after each.
func (w *dashWorld) positions(t *testing.T, e *ecs.Entity, n int) [][2]float64 {
	t.Helper()
	out := make([][2]float64, 0, n)
	for range n {
		w.tick()
		at := transformOf(t, e)
		out = append(out, [2]float64{at.X, at.Y})
	}
	return out
}

// dashTicks is how many ticks a full charge takes at the test tick length.
var dashTicks = int(math.Ceil(dashDistance / (dashSpeed * tickSeconds)))

// walking gives the delver a body that walks (vx, vy) at the default speed.
func walking(e *ecs.Entity, vx, vy float64) *ecs.Entity {
	e.AddComponent(components.NewVelocityComponent(vx, vy, constants.DefaultSpeed))
	return e
}

func dashing(e *ecs.Entity) bool {
	return e.HasComponent(ecs.ComponentTypeDash)
}

func dashToward(e *ecs.Entity, x, y float64) {
	intend(e, components.AttackIntent{Kind: components.AttackDash, TargetX: x, TargetY: y})
}

// The charge carries the delver its full distance over several ticks, never in
// one jump. It was a teleport: 180 px on the tick the cast resolved.
func TestDash_CarriesTheDelverGraduallyOverSeveralTicks(t *testing.T) {
	w := newDashWorld()
	d := delver(w.em, 100, 100)

	dashToward(d, 400, 100)
	path := w.positions(t, d, dashTicks+10)

	moving := 0
	prev := 100.0
	for i, at := range path {
		step := at[0] - prev
		assert.LessOrEqual(t, step, dashSpeed*tickSeconds+1e-9, "tick %d jumped %.1f px", i, step)
		if step > 1e-9 {
			moving++
		}
		assert.Equal(t, 100.0, at[1])
		prev = at[0]
	}
	assert.Equal(t, dashTicks, moving, "the charge spans several ticks")
	assert.GreaterOrEqual(t, moving, 5)
	assert.InDelta(t, 100+dashDistance, prev, 1e-6, "and still covers its full distance")
	assert.False(t, dashing(d), "a spent charge is over")
}

// The cast resolves on the combat tick: mana and cooldown are spent there and
// the charge is set going, but the body only moves on the ticks after.
func TestDash_CastSpendsManaAndCooldownAndSetsTheChargeGoing(t *testing.T) {
	w := newDashWorld()
	d := delver(w.em, 100, 100)

	dashToward(d, 100, 400)
	w.combat.Update(tickSeconds, w.em.GetAllEntities(), nil)

	assert.Equal(t, 90, mana(d))
	assert.Positive(t, cooldownOf(d, components.AttackDash))
	require.True(t, dashing(d))
	dc, _ := d.GetComponent(ecs.ComponentTypeDash)
	charge := dc.(*components.DashComponent)
	assert.InDelta(t, 0, charge.DirX, 1e-9)
	assert.InDelta(t, 1, charge.DirY, 1e-9)
	assert.Equal(t, dashDistance, charge.Remaining)
	assert.Equal(t, 100.0, transformOf(t, d).Y, "nothing moves on the cast")
}

// While the charge runs it replaces the walk: held movement input neither adds
// to it nor steers it. The walk picks up again once it is over.
func TestDash_ReplacesTheWalkWhileItLasts(t *testing.T) {
	w := newDashWorld()
	d := walking(delver(w.em, 300, 300), 1, 0)

	walkedX := 300 + constants.DefaultSpeed*tickSeconds
	dashToward(d, walkedX, 600)
	w.tick() // the walk's tick, then the cast
	require.Equal(t, walkedX, transformOf(t, d).X)
	path := w.positions(t, d, dashTicks)

	for i, at := range path {
		assert.Equal(t, walkedX, at[0], "tick %d: no walk under the charge", i)
	}
	assert.InDelta(t, 300+dashDistance, path[len(path)-1][1], 1e-6)

	w.tick()
	assert.InDelta(t, walkedX+constants.DefaultSpeed*tickSeconds, transformOf(t, d).X, 1e-9, "the walk resumes")
}

// What stops a charge short: it ends where it stopped, and nothing carries the
// delver on afterwards.
func TestDash_StopsShort(t *testing.T) {
	tests := []struct {
		name  string
		setup func(w *dashWorld) *ecs.Entity
		// interrupt runs after the given number of charge ticks
		after     int
		interrupt func(w *dashWorld, d *ecs.Entity)
		wantX     float64
	}{
		{
			name: "a wall stops it flush against the wall",
			setup: func(w *dashWorld) *ecs.Entity {
				wall := w.em.CreateEntity()
				wall.AddComponent(components.NewTransformComponent(200, 0))
				wall.AddComponent(&components.WallComponent{Width: 20, Height: 300})
				return delver(w.em, 100, 100)
			},
			wantX: 200 - constants.PlayerRadius,
		},
		{
			name: "a closed door stops it",
			setup: func(w *dashWorld) *ecs.Entity {
				door := w.em.CreateEntity()
				door.AddComponent(components.NewTransformComponent(200, 0))
				door.AddComponent(&components.DoorComponent{Width: 20, Height: 300})
				return delver(w.em, 100, 100)
			},
			wantX: 200 - constants.PlayerRadius,
		},
		{
			name: "the world's edge stops it",
			setup: func(w *dashWorld) *ecs.Entity {
				return delver(w.em, constants.MapWidth-100, 100)
			},
			wantX: constants.MapWidth - constants.PlayerRadius,
		},
		{
			name:      "death stops it",
			setup:     func(w *dashWorld) *ecs.Entity { return delver(w.em, 100, 100) },
			after:     3,
			interrupt: func(_ *dashWorld, d *ecs.Entity) { killDelver(d) },
			wantX:     100 + 3*dashSpeed*tickSeconds,
		},
		{
			name:      "leaving play stops it",
			setup:     func(w *dashWorld) *ecs.Entity { return delver(w.em, 100, 100) },
			after:     3,
			interrupt: func(_ *dashWorld, d *ecs.Entity) { escapeDelver(d) },
			wantX:     100 + 3*dashSpeed*tickSeconds,
		},
		{
			name:  "a new cast stops it where it stands",
			setup: func(w *dashWorld) *ecs.Entity { return delver(w.em, 100, 100) },
			after: 3,
			interrupt: func(_ *dashWorld, d *ecs.Entity) {
				intend(d, components.AttackIntent{Kind: components.AttackSlash, TargetX: 100, TargetY: 400})
			},
			// the slash resolves on the 4th tick's combat, after its movement
			wantX: 100 + 4*dashSpeed*tickSeconds,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := newDashWorld()
			d := tt.setup(w)
			dashToward(d, 2000, 100)
			w.tick() // the cast

			if tt.interrupt != nil {
				w.ticks(tt.after)
				tt.interrupt(w, d)
			}
			w.ticks(dashTicks + 10)

			assert.InDelta(t, tt.wantX, transformOf(t, d).X, 1e-6)
			assert.Equal(t, 100.0, transformOf(t, d).Y)
			assert.False(t, dashing(d), "the charge is over")
		})
	}
}

// A new charge cast mid-charge starts afresh from where the delver stands: the
// old one's unspent distance is dropped, never added on.
func TestDash_ANewChargeStartsAfreshFromWhereTheDelverStands(t *testing.T) {
	w := newDashWorld()
	d := delver(w.em, 100, 100)

	dashToward(d, 400, 100)
	w.tick()
	w.ticks(3)
	stoodX := transformOf(t, d).X

	cc, _ := d.GetComponent(ecs.ComponentTypeCooldown)
	delete(cc.(*components.CooldownComponent).Remaining, components.AttackDash)
	// the new cast lands on a combat tick after that tick's step of the old one
	castX := stoodX + dashSpeed*tickSeconds
	dashToward(d, castX, 400)
	w.ticks(dashTicks + 10)

	at := transformOf(t, d)
	assert.InDelta(t, castX, at.X, 1e-6)
	assert.InDelta(t, 100+dashDistance, at.Y, 1e-6)
}

// The charge passes through monsters and delvers, as the teleport did; the
// world settles any overlap once it is over.
func TestDash_PassesThroughBodies(t *testing.T) {
	w := newDashWorld()
	d := walking(delver(w.em, 100, 100), 0, 0)
	ghoul(w.em, 190, 100, 100)
	walking(delver(w.em, 240, 100), 0, 0)

	dashToward(d, 400, 100)
	w.tick()
	w.ticks(dashTicks)

	assert.InDelta(t, 100+dashDistance, transformOf(t, d).X, 1e-6)
}

// Spamming the charge never outruns it: it is gated by its cooldown and mana,
// no tick ever carries the delver further than one charge step, and the
// distance covered is never more than one full charge per cast.
func TestDash_CannotBeChainedIntoASpeedExploit(t *testing.T) {
	w := newDashWorld()
	d := walking(delver(w.em, 50, 300), 1, 0)
	mc, _ := d.GetComponent(ecs.ComponentTypeMana)
	mc.(*components.ManaComponent).CurrentMana = 10_000

	const seconds = 2.0
	prev := transformOf(t, d).X
	for range int(seconds / tickSeconds) {
		dashToward(d, 2000, 300)
		w.tick()
		x := transformOf(t, d).X
		assert.LessOrEqual(t, x-prev, dashSpeed*tickSeconds+1e-9)
		prev = x
	}

	casts := (10_000 - mana(d)) / 10
	assert.LessOrEqual(t, casts, int(seconds/attackTable[components.AttackDash].cooldown)+1)
	// a charge carries the delver in place of the walk, so the walk adds at most its own pace
	assert.LessOrEqual(t, prev-50, float64(casts)*dashDistance+seconds*constants.DefaultSpeed+1e-6)
}

// At the world's tick rate the charge is a slow, readable move: about 0.4 s,
// 12 ticks of 15 px, over the old teleport's 180 px.
func TestDash_TakesAboutFourTenthsOfASecondAtTheWorldsTickRate(t *testing.T) {
	w := newDashWorld()
	d := delver(w.em, 100, 100)
	worldTick := 1.0 / float64(constants.GameFrameRate)

	dashToward(d, 400, 100)
	w.move.Update(worldTick, w.em.GetAllEntities())
	w.combat.Update(worldTick, w.em.GetAllEntities(), nil) // the cast

	var steps []float64
	prev := 100.0
	for range 30 {
		w.move.Update(worldTick, w.em.GetAllEntities())
		w.combat.Update(worldTick, w.em.GetAllEntities(), nil)
		x := transformOf(t, d).X
		if x-prev > 1e-9 {
			steps = append(steps, x-prev)
		}
		prev = x
	}

	require.Len(t, steps, 12)
	for _, step := range steps {
		assert.InDelta(t, 15, step, 1e-9)
	}
	assert.InDelta(t, 0.4, float64(len(steps))*worldTick, 1e-9)
	assert.InDelta(t, 280, prev, 1e-6)
}
