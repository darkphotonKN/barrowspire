package systems

import (
	"bytes"
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §E R28–R29, §F R34. I-X2CMM-8.

// houndHome is where the archer stands in these tests, clear of the world's
// edge.
const houndHome = 500.0

// callHound has a level-15 archer at (houndHome, houndHome) call the hound at
// (houndHome + x, houndHome) and lets the 2 s cast run out, its own tick counted. The books are the
// world's. Each call starts off cooldown on a full pool: one call's 60 stamina
// leaves too little for the next.
func callHound(t *testing.T, em *ecs.EntityManager, archer *ecs.Entity, x float64) *ecs.Entity {
	t.Helper()
	page, _ := BookPageOf(string(components.PageCallTheHound))
	books := NewBookSystem(em)
	if book, ok := bookOf(archer); ok {
		delete(book.Cooldowns, components.PageCallTheHound)
	}
	resourceOf(archer).Current = resourceOf(archer).Max
	require.NoError(t, books.Cast(BookCast{
		Caster: archer, Page: page, TargetX: houndHome + x, TargetY: houndHome,
		CellSize: testCell, BookGround: BookGround{Walkable: anyGround},
	}))
	for range ticksOf(2) {
		books.AdvanceCasts(castTick, em.GetAllEntities(), nil, BookGround{Walkable: anyGround}, PageEntryPoints{})
	}
	hound, ok := houndOfArcher(em, archer)
	require.True(t, ok, "the hound is called")
	return hound
}

// houndArcher is a level-15 archer at (houndHome, houndHome) with Call the
// Hound in their book.
func houndArcher(em *ecs.EntityManager) *ecs.Entity {
	return bookDelver(em, "archer", 15, houndHome, houndHome, components.PageCallTheHound)
}

// houndOfArcher is the archer's hound on the floor.
func houndOfArcher(em *ecs.EntityManager, archer *ecs.Entity) (*ecs.Entity, bool) {
	for _, e := range houndsIn(em) {
		if ec, _ := e.GetComponent(ecs.ComponentTypeBookEffect); ec.(*components.BookEffectComponent).CasterID == archer.ID {
			return e, true
		}
	}
	return nil, false
}

// houndsIn is every hound on the floor.
func houndsIn(em *ecs.EntityManager) []*ecs.Entity {
	var set []*ecs.Entity
	for _, e := range em.GetAllEntities() {
		if ec, ok := e.GetComponent(ecs.ComponentTypeBookEffect); ok && ec.(*components.BookEffectComponent).Kind == components.BookEffectHound {
			set = append(set, e)
		}
	}
	return set
}

func houndT(t *testing.T, e *ecs.Entity) *components.HoundComponent {
	t.Helper()
	hc, ok := e.GetComponent(ecs.ComponentTypeHound)
	require.True(t, ok)
	return hc.(*components.HoundComponent)
}

// houndFloor ticks a floor as a run does, the parts a hound lives in: the
// books, the monster AI with the hound's steering, the walk, then combat. It
// returns every kill record of the ticks.
type houndFloor struct {
	em     *ecs.EntityManager
	ai     *MonsterAISystem
	walk   *MovementSystem
	combat *CombatSystem
}

func newHoundFloor(em *ecs.EntityManager) *houndFloor {
	return &houndFloor{
		em:     em,
		ai:     NewMonsterAISystem(firstRoll, nil),
		walk:   NewMovementSystem(),
		combat: NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects),
	}
}

func (f *houndFloor) run(n int) []KillRecord {
	var kills []KillRecord
	for range n {
		NewBookSystem(f.em).Update(castTick, f.em.GetAllEntities(), BookGround{})
		f.ai.Update(castTick, f.em.GetAllEntities())
		f.walk.Update(castTick, f.em.GetAllEntities())
		kills = append(kills, f.combat.Update(castTick, f.em.GetAllEntities(), nil)...)
	}
	return kills
}

// held is a ghoul with the health given at (x, y) from the archer, stunned
// long enough to stand through the test.
func held(em *ecs.EntityManager, x, y float64, hp int) *ecs.Entity {
	g := ghoul(em, houndHome+x, houndHome+y, hp)
	stun(monster(g), 1000)
	return g
}

// A level-15 archer calls the hound 3 cells off: it walks to a monster 4
// cells beyond it and bites it for 8 + 0.5 × 15 = 15.5, 16 on a ghoul with
// no defense, then again every 1 s and not sooner. AC 1; R28.
func TestHound_WalksToAndBitesAMonsterEverySecond(t *testing.T) {
	em := ecs.NewEntityManager()
	archer := houndArcher(em)
	callHound(t, em, archer, 3*testCell)
	g := held(em, 7*testCell, 0, 200)
	floor := newHoundFloor(em)

	for range 90 {
		if healthT(t, g).CurrentHealth < 200 {
			break
		}
		floor.run(1)
	}
	require.Equal(t, 184, healthT(t, g).CurrentHealth, "the first bite, 16")

	floor.run(ticksOf(1) - 1)
	assert.Equal(t, 184, healthT(t, g).CurrentHealth, "not sooner than 1 s")
	floor.run(1)
	assert.Equal(t, 168, healthT(t, g).CurrentHealth, "the next, 1 s on")
}

// A level-15 archer's Call the Hound takes 2 s; on completion 60 stamina is
// paid, its 180 s cooldown starts and a hound stands at the point for 40 s,
// with 40 % of the archer's max health, the archer's member id as its owner
// and a bite of 8 + 0.5 × 15. AC 1; R28; §B.
func TestBookSystemAdvanceCasts_CallTheHoundSetsAHoundAtThePoint(t *testing.T) {
	em := ecs.NewEntityManager()
	archer := houndArcher(em)

	hound := callHound(t, em, archer, 3*testCell)

	assert.Equal(t, 40, pool(archer), "100 - 60 stamina")
	assert.Equal(t, components.BookCooldown{Remaining: 180, Total: 180}, bookOfT(t, archer).Cooldowns[components.PageCallTheHound])
	at, _ := bodyCentre(hound)
	assert.Equal(t, houndHome+3*testCell, at.X)
	assert.Equal(t, houndHome, at.Y)
	ec, _ := hound.GetComponent(ecs.ComponentTypeBookEffect)
	assert.InDelta(t, 40.0, ec.(*components.BookEffectComponent).Remaining, 1e-9)
	assert.Equal(t, 40, healthT(t, hound).CurrentHealth, "40 % of 100")
	assert.Equal(t, 40, healthT(t, hound).MaxHealth)
	assert.Equal(t, memberIDOf(archer), houndT(t, hound).OwnerMemberID)
	assert.Equal(t, 15.5, houndT(t, hound).BitePower)
	assert.False(t, InPlay(hound), "never a delver")
}

// With no monster within 5 cells the hound runs to its archer and stands
// within 2 cells of them; with the archer out of play it stands where it is.
// R28; §Edge States "Hound with no monster near".
func TestHound_FollowsTheArcherToWithinTwoCells(t *testing.T) {
	em := ecs.NewEntityManager()
	archer := houndArcher(em)
	hound := callHound(t, em, archer, 4*testCell)
	moveTo(t, archer, houndHome-4*testCell, houndHome) // 8 cells off now
	floor := newHoundFloor(em)

	floor.run(1)
	assert.Equal(t, components.HoundActionRun, houndT(t, hound).Action)

	floor.run(ticksOf(4))
	assert.LessOrEqual(t, distanceOf(t, hound, archer), 2*testCell+1, "heels within 2 cells")
	assert.Zero(t, velocityOf(t, hound).VX, "and stands there")
	assert.Equal(t, components.HoundActionIdle, houndT(t, hound).Action)

	killDelver(archer)
	moveTo(t, archer, houndHome+8*testCell, houndHome)
	before, _ := bodyCentre(hound)
	x := before.X
	floor.run(ticksOf(1))
	after, _ := bodyCentre(hound)
	assert.Equal(t, x, after.X, "the archer out of play, it stands")
}

// A monster with no delver near takes the hound as its quarry, and its strike
// lands on the hound's health. AC 2; R28.
func TestMonsterAISystem_AMonsterTargetsAndStrikesTheHound(t *testing.T) {
	em := ecs.NewEntityManager()
	archer := houndArcher(em)
	hound := callHound(t, em, archer, 3*testCell)
	moveTo(t, archer, houndHome-20*testCell, houndHome) // out of every aggro
	g := hunter(em, houndHome+5*testCell, houndHome)

	think(em)
	assert.Equal(t, hound.ID, monster(g).Target, "the hound is a quarry")

	g2 := hunter(em, houndHome+3*testCell+30, houndHome)
	intents, _ := g2.GetComponent(ecs.ComponentTypeAttackIntent)
	intents.(*components.AttackIntentComponent).Pending = []components.AttackIntent{
		{Kind: components.AttackMonsterStrike, TargetEntityID: hound.ID},
	}
	NewCombatSystem(em, neverCrit, PlayerDamageOff, testUniqueEffects).Update(castTick, em.GetAllEntities(), nil)
	assert.Less(t, healthT(t, hound).CurrentHealth, 40, "struck")
}

// A hound at no health goes on the next tick, leaving nothing; one standing
// goes when its 40 s are up. AC 2; R28.
func TestBookSystemUpdate_AHoundGoesAtNoHealthOrAfter40Seconds(t *testing.T) {
	em := ecs.NewEntityManager()
	archer := houndArcher(em)
	hound := callHound(t, em, archer, 3*testCell)
	books := NewBookSystem(em)

	healthT(t, hound).CurrentHealth = 0
	books.Update(castTick, em.GetAllEntities(), BookGround{})
	assert.Empty(t, houndsIn(em), "at no health it goes")

	callHound(t, em, archer, 3*testCell)
	castTicks(books, em, ticksOf(40)-1)
	assert.Len(t, houndsIn(em), 1, "standing through its 40 s")
	castTicks(books, em, 1)
	assert.Empty(t, houndsIn(em), "gone at 40 s")
}

// A monster the hound bites to death is the archer's kill: the kill record
// names the archer's member id, as experience and drops read it. AC 3; R29.
func TestHound_AMonsterItKillsIsTheArchersKill(t *testing.T) {
	em := ecs.NewEntityManager()
	archer := houndArcher(em)
	callHound(t, em, archer, 3*testCell)
	g := held(em, 4*testCell, 0, 10)

	kills := newHoundFloor(em).run(ticksOf(1))

	require.Len(t, kills, 1)
	assert.Equal(t, g.ID, kills[0].MonsterEntityID)
	assert.Equal(t, memberIDOf(archer), kills[0].KillerMemberID, "the archer's kill")
}

// A second call sends the first hound away: one hound per archer. Another
// archer's hound stands. AC 4; R28.
func TestBookSystemAdvanceCasts_ASecondCallReplacesTheFirstHound(t *testing.T) {
	em := ecs.NewEntityManager()
	archer := houndArcher(em)
	other := houndArcher(em)
	first := callHound(t, em, archer, 3*testCell)
	theirs := callHound(t, em, other, -3*testCell)

	second := callHound(t, em, archer, 2*testCell)

	assert.NotEqual(t, first.ID, second.ID)
	_, stands := em.GetEntity(first.ID)
	assert.False(t, stands, "the first is sent away")
	_, stands = em.GetEntity(theirs.ID)
	assert.True(t, stands, "another archer's hound stands")
	assert.Len(t, houndsIn(em), 2)
}

// No delver's hit lands on a hound, the archer's own included; a monster's
// may. R28.
func TestCanHit_NoDelversHitLandsOnAHound(t *testing.T) {
	em := ecs.NewEntityManager()
	archer := houndArcher(em)
	hound := callHound(t, em, archer, 3*testCell)

	for _, damage := range []PlayerDamage{PlayerDamageOff, PlayerDamageOn} {
		assert.False(t, CanHit(lethal(memberIDOf(archer)), hound, damage), damage)
	}
	assert.True(t, CanHit(monsterStrike(), hound, PlayerDamageOff))
}

// distanceOf is how far apart two bodies stand.
func distanceOf(t *testing.T, a, b *ecs.Entity) float64 {
	t.Helper()
	at, _ := bodyCentre(a)
	to, _ := bodyCentre(b)
	return math.Hypot(to.X-at.X, to.Y-at.Y)
}

// A hound whose 40 s run out on this tick is taken from the world at the
// tick's start, and acts no more on the tick's own entities: no bite lands, so
// no kill is the archer's, and no monster takes it as a quarry. R28 "When its
// time is up it is gone".
func TestHound_OnTheTickItsTimeIsUpItActsNoMore(t *testing.T) {
	em := ecs.NewEntityManager()
	archer := houndArcher(em)
	hound := callHound(t, em, archer, 3*testCell)
	moveTo(t, archer, houndHome-20*testCell, houndHome) // out of every aggro
	g := held(em, 3*testCell+40, 0, 10)                 // in reach: a bite kills it
	h := hunter(em, houndHome+5*testCell, houndHome)    // the hound inside its aggro
	ec, _ := hound.GetComponent(ecs.ComponentTypeBookEffect)
	ec.(*components.BookEffectComponent).Remaining = castTick // its last tick
	houndT(t, hound).BiteIn = 0
	floor := newHoundFloor(em)

	entities := em.GetAllEntities() // the tick's entities, as the session reads them once
	NewBookSystem(em).Update(castTick, entities, BookGround{})
	floor.ai.Update(castTick, entities)
	kills := floor.combat.Update(castTick, entities, nil)

	assert.Empty(t, houndsIn(em), "gone at 40 s")
	assert.Empty(t, kills, "no bite on its last tick")
	assert.Equal(t, 10, healthT(t, g).CurrentHealth)
	assert.NotEqual(t, hound.ID, monster(h).Target, "no quarry")
}

// Two monsters as near as each other: the hound takes the one with the lower
// entity id, whatever order the world lists them in. R28.
func TestNearestMonster_BreaksATieByEntityID(t *testing.T) {
	em := ecs.NewEntityManager()
	a := ghoul(em, houndHome+testCell, houndHome, 50)
	b := ghoul(em, houndHome-testCell, houndHome, 50)
	want := a
	if bytes.Compare(b.ID[:], a.ID[:]) < 0 {
		want = b
	}
	at := components.NewTransformComponent(houndHome, houndHome)

	for _, order := range [][]*ecs.Entity{{a, b}, {b, a}} {
		got, ok := nearestMonster(at, 5*testCell, order)
		require.True(t, ok)
		assert.Equal(t, want.ID, got.ID)
	}
}
