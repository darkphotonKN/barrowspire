package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// parryMerc stands a mercenary at (x, y) who can raise the parry stance: 0 of 3
// parry charges and no stance yet.
func parryMerc(em *ecs.EntityManager, x, y float64) *ecs.Entity {
	e := mercenary(em, x, y)
	e.AddComponent(components.NewResourceComponent(components.ResourceParryCharges, 0, 3, 0))
	e.AddComponent(components.NewAbilityComponent(components.AttackParry))
	e.AddComponent(components.NewParryComponent())
	return e
}

func parryOf(e *ecs.Entity) *components.ParryComponent {
	c, _ := e.GetComponent(ecs.ComponentTypeParry)
	return c.(*components.ParryComponent)
}

func castParry(e *ecs.Entity) {
	intend(e, components.AttackIntent{Kind: components.AttackParry})
}

func strikeOn(monster, target *ecs.Entity) {
	intend(monster, components.AttackIntent{Kind: components.AttackMonsterStrike, TargetEntityID: target.ID})
}

// A parry cast and a monster strike resolved on the same tick: the stance opens
// first, so the strike is negated and grants a parry charge, whichever entity
// the tick reaches first. FS-MAMHR §Requirements 11–12, 14.
func TestCombatSystem_Parry_SameTickStrikeIsParriedInEitherEntityOrder(t *testing.T) {
	tests := []struct {
		name  string
		order func(merc, troll *ecs.Entity) []*ecs.Entity
	}{
		{"merc first", func(merc, troll *ecs.Entity) []*ecs.Entity { return []*ecs.Entity{merc, troll} }},
		{"monster first", func(merc, troll *ecs.Entity) []*ecs.Entity { return []*ecs.Entity{troll, merc} }},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			merc := parryMerc(em, 100, 100)
			troll := striker(em, 140, 100, 200)

			castParry(merc)
			strikeOn(troll, merc)
			NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(tickSeconds, tt.order(merc, troll), nil)

			assert.Equal(t, 150, health(merc), "negated")
			assert.Equal(t, 1, pool(merc), "one parry charge")
			assert.Equal(t, 1, parryOf(merc).Parries)
		})
	}
}

// stanceWorld ticks combat alone, at a chosen tick length.
type stanceWorld struct {
	em     *ecs.EntityManager
	combat *CombatSystem
	dt     float64
}

func newStanceWorld(dt float64) *stanceWorld {
	em := ecs.NewEntityManager()
	return &stanceWorld{em: em, combat: NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects), dt: dt}
}

func (w *stanceWorld) tick() {
	w.combat.Update(w.dt, w.em.GetAllEntities(), nil)
}

func (w *stanceWorld) ticks(n int) {
	for range n {
		w.tick()
	}
}

// The stance covers every strike resolved on its opening tick and on each tick
// until 0.25 s have elapsed; a strike on the first tick past that is taken in
// full. Checked at both tick rates a world runs at. FS-MAMHR §Requirements 11.
func TestCombatSystem_Parry_WindowIsAQuarterSecondFromItsOpeningTick(t *testing.T) {
	tests := []struct {
		name     string
		dt       float64
		lastOpen int // ticks after the opening tick, the last still within 0.25 s
	}{
		{"60 Hz", 1.0 / 60, 15},
		{"30 Hz", 1.0 / 30, 7},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			for _, after := range []int{0, tt.lastOpen} {
				w := newStanceWorld(tt.dt)
				merc := parryMerc(w.em, 100, 100)
				troll := striker(w.em, 140, 100, 200)

				castParry(merc)
				w.ticks(after)
				strikeOn(troll, merc)
				w.tick()

				assert.Equal(t, 150, health(merc), "a strike %d ticks after the opening is parried", after)
				assert.Equal(t, 1, pool(merc))
			}

			w := newStanceWorld(tt.dt)
			merc := parryMerc(w.em, 100, 100)
			troll := striker(w.em, 140, 100, 200)

			castParry(merc)
			w.ticks(tt.lastOpen + 1)
			strikeOn(troll, merc)
			w.tick()

			assert.Equal(t, 150-30, health(merc), "past 0.25 s the strike lands")
			assert.Equal(t, 0, pool(merc))
			assert.False(t, parryOf(merc).Open)
		})
	}
}

// Several strikes in one window are each negated and each grant a parry
// charge, up to 3. At the cap a parry still negates and still counts.
// FS-MAMHR §Requirements 14; Edge States "At 3 parry charges, another parry".
func TestCombatSystem_Parry_EachStrikeInTheWindowGrantsAParryChargeUpToThree(t *testing.T) {
	w := newStanceWorld(tickSeconds)
	merc := parryMerc(w.em, 100, 100)
	first := striker(w.em, 140, 100, 200)
	second := striker(w.em, 60, 100, 200)

	castParry(merc)
	strikeOn(first, merc)
	strikeOn(second, merc)
	w.tick()

	assert.Equal(t, 150, health(merc))
	assert.Equal(t, 2, pool(merc), "+2 parry charges")
	assert.True(t, parryOf(merc).Open, "the stance stays open for the rest of its window")

	strikeOn(first, merc)
	w.tick()
	strikeOn(second, merc)
	w.tick()

	assert.Equal(t, 150, health(merc), "negated at the cap too")
	assert.Equal(t, 3, pool(merc), "no 4th parry charge")
	assert.Equal(t, 4, parryOf(merc).Parries, "every parry counts")
}

// Every monster strike can be parried, an elite's and the boss's included.
// FS-MAMHR §Requirements 14.
func TestCombatSystem_Parry_EliteAndBossStrikesAreParried(t *testing.T) {
	tests := []struct {
		name        string
		elite, boss bool
	}{
		{"an elite", true, false},
		{"the boss", false, true},
		{"an ordinary monster", false, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := newStanceWorld(tickSeconds)
			merc := parryMerc(w.em, 100, 100)
			troll := striker(w.em, 140, 100, 200)
			monster(troll).Elite, monster(troll).Boss = tt.elite, tt.boss

			castParry(merc)
			strikeOn(troll, merc)
			w.tick()

			assert.Equal(t, 150, health(merc))
			assert.Equal(t, 1, pool(merc))
		})
	}
}

// A parried strike deals nothing, so Gravewarden's Oath has nothing to
// reflect. FS-MAMHR §Requirements 14.
func TestCombatSystem_Parry_ParriedStrikeOnAGravewardenWearerReflectsNothing(t *testing.T) {
	w := newStanceWorld(tickSeconds)
	merc := parryMerc(w.em, 100, 100)
	wearUnique(w.em, merc, chestSlot, types.ItemTypeArmor, types.UniqueEffectMeleeReflect)
	troll := striker(w.em, 140, 100, 200)

	castParry(merc)
	strikeOn(troll, merc)
	w.tick()

	assert.Equal(t, 150, health(merc))
	assert.Equal(t, 200, health(troll), "nothing reflected")
	assert.Equal(t, uuid.Nil, monster(troll).LastAttacker)
}

// A window that negated nothing starts a 1.0 s whiff lockout from its close;
// a parry cast inside it does nothing, and the first one after it raises the
// stance. FS-MAMHR §Requirements 15.
func TestCombatSystem_Parry_EmptyWindowLocksTheStanceOutForASecondFromItsClose(t *testing.T) {
	w := newStanceWorld(1.0 / 60)
	merc := parryMerc(w.em, 100, 100)
	stance := parryOf(merc)

	castParry(merc)
	w.ticks(16) // the opening tick and the 15 within 0.25 s

	assert.True(t, stance.Open, "still open at 0.25 s")
	assert.Zero(t, stance.LockoutRemaining)

	w.tick() // 0.2667 s: the window has closed empty

	assert.False(t, stance.Open)
	assert.InDelta(t, 1.0-1.0/60, stance.LockoutRemaining, 1e-9, "counted from the close at 0.25 s, not from this tick")

	// the lockout ends 1.25 s after the opening tick, 75 ticks at 60 Hz
	for tick := 17; tick < 75; tick++ {
		castParry(merc)
		w.tick()
		require.False(t, stance.Open, "a parry %d ticks after the opening is refused", tick)
		require.Positive(t, stance.LockoutRemaining)
	}

	castParry(merc)
	w.tick()

	assert.True(t, stance.Open, "the first cast after the lockout raises the stance")
	assert.Zero(t, stance.LockoutRemaining)
}

// A window that negated a strike starts no lockout: the merc can raise the
// stance again on the tick it closes. FS-MAMHR §Requirements 15.
func TestCombatSystem_Parry_WindowThatParriedStartsNoLockout(t *testing.T) {
	w := newStanceWorld(1.0 / 60)
	merc := parryMerc(w.em, 100, 100)
	troll := striker(w.em, 140, 100, 200)

	castParry(merc)
	strikeOn(troll, merc)
	w.ticks(16)

	castParry(merc)
	w.tick() // the window closes and the new cast arrives on the same tick

	assert.True(t, parryOf(merc).Open, "raised again at once")
	assert.Zero(t, parryOf(merc).LockoutRemaining)
	assert.Zero(t, parryOf(merc).OpenFor, "a fresh window")
}

// A parry cast while the stance is open neither extends nor restarts it.
// FS-MAMHR §Requirements 16.
func TestCombatSystem_Parry_CastWhileOpenChangesNothing(t *testing.T) {
	w := newStanceWorld(1.0 / 60)
	merc := parryMerc(w.em, 100, 100)
	stance := parryOf(merc)

	castParry(merc)
	w.ticks(10)
	castParry(merc)
	w.tick()

	assert.InDelta(t, 10.0/60, stance.OpenFor, 1e-9, "not restarted")

	w.ticks(5) // 0.25 s from the first cast
	assert.True(t, stance.Open)
	w.tick()
	assert.False(t, stance.Open, "closed on the first cast's clock")
}

// Another class sending parry gets nothing: no stance, nothing spent, no
// cooldown, and a charge in flight is not stopped. FS-MAMHR §Requirements 18.
func TestCombatSystem_Parry_NonMercenaryGetsNothing(t *testing.T) {
	w := newStanceWorld(tickSeconds)
	warrior := delver(w.em, 100, 100)
	troll := striker(w.em, 140, 100, 200)

	castParry(warrior)
	strikeOn(troll, warrior)
	w.tick()

	assert.False(t, warrior.HasComponent(ecs.ComponentTypeParry))
	assert.Equal(t, 150-30, health(warrior), "the strike lands")
	assert.Equal(t, 100, pool(warrior), "nothing spent")
	cc, _ := warrior.GetComponent(ecs.ComponentTypeCooldown)
	assert.Empty(t, cc.(*components.CooldownComponent).Remaining)
}

// The stance protects only the merc who raised it. FS-MAMHR §Requirements 17.
func TestCombatSystem_Parry_TeammateBesideAnOpenStanceIsStruck(t *testing.T) {
	w := newStanceWorld(tickSeconds)
	merc := parryMerc(w.em, 100, 100)
	teammate := delver(w.em, 110, 100)
	troll := striker(w.em, 140, 100, 200)

	castParry(merc)
	strikeOn(troll, teammate)
	w.tick()

	assert.Equal(t, 150-30, health(teammate))
	assert.Equal(t, 0, pool(merc), "not the merc's parry")
	assert.Zero(t, parryOf(merc).Parries)
}

// The merc's other casts do not close the stance, and it does not stop them.
// FS-MAMHR §Requirements 13; Edge States "Stance open when a cut resolves".
func TestCombatSystem_Parry_CutWhileOpenLeavesTheStanceOpen(t *testing.T) {
	w := newStanceWorld(tickSeconds)
	merc := parryMerc(w.em, 100, 100)
	target := dummy(w.em, 140, 100)

	castParry(merc)
	w.tick()
	intend(merc, components.AttackIntent{Kind: components.AttackCut, TargetX: 140, TargetY: 100})
	w.tick()

	assert.Less(t, health(target), 1000, "the cut resolves")
	assert.True(t, parryOf(merc).Open, "the stance stays up")
}

// The stance never roots: a merc with it open walks as far as one without.
// FS-MAMHR §Requirements 13.
func TestParry_MercMovesAtFullSpeedWithTheStanceOpen(t *testing.T) {
	w := newDashWorld()
	parrying := walking(parryMerc(w.em, 100, 100), 1, 0)
	idle := walking(parryMerc(w.em, 100, 400), 1, 0)

	castParry(parrying)
	for range 10 {
		w.tick()
		require.True(t, parryOf(parrying).Open || parryOf(parrying).LockoutRemaining > 0)
	}

	assert.Equal(t, transformOf(t, idle).X, transformOf(t, parrying).X)
	assert.Greater(t, transformOf(t, parrying).X, 100.0)
}

// A merc out of play casts nothing, and their parry state is left as it was.
// FS-MAMHR §Edge States "Merc escapes or is otherwise out of play".
func TestCombatSystem_Parry_OutOfPlayCastsNothing(t *testing.T) {
	w := newStanceWorld(tickSeconds)
	merc := parryMerc(w.em, 100, 100)
	pc, _ := merc.GetComponent(ecs.ComponentTypePlayer)
	pc.(*components.PlayerComponent).Escape = true

	castParry(merc)
	w.tick()

	assert.False(t, parryOf(merc).Open)
}
