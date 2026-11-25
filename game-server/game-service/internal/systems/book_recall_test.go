package systems

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §A R8, §D R17, §E R25. I-X2CMM-5.

// recallTicks is Recall's 3 s cast at castTick, the cast's own tick counted.
const recallTicks = 90

// recallGround is the ground a Recall reads past its entities: open ground with
// the walk's own walls and edge.
var recallGround = BookGround{Walkable: anyGround, Ground: NewMovementSystem()}

// recallBody is a delver who walks, so a body others land clear of.
func recallBody(em *ecs.EntityManager, class string, level int, x, y float64, pages ...components.PageID) *ecs.Entity {
	e := bookDelver(em, class, level, x, y, pages...)
	e.AddComponent(components.NewVelocityComponent(0, 0, 100))
	return e
}

// recallCast is a level-17 mage at (500, 500) casting Recall.
func recallCast(em *ecs.EntityManager) (*ecs.Entity, BookCast) {
	mage := recallBody(em, "mage", 17, 500, 500, components.PageRecall)
	page, _ := BookPageOf(string(components.PageRecall))
	return mage, BookCast{Caster: mage, Page: page, CellSize: testCell, BookGround: recallGround}
}

// recallThrough counts a Recall's whole cast, nothing else in the world moving.
func recallThrough(s *BookSystem, em *ecs.EntityManager, ground BookGround) {
	for range recallTicks {
		s.Update(castTick, em.GetAllEntities(), ground)
		s.AdvanceCasts(castTick, em.GetAllEntities(), nil, ground)
	}
}

func at(t *testing.T, e *ecs.Entity) (float64, float64) {
	t.Helper()
	tc, ok := bodyCentre(e)
	require.True(t, ok)
	return tc.X, tc.Y
}

func apart(t *testing.T, a, b *ecs.Entity) float64 {
	t.Helper()
	ax, ay := at(t, a)
	bx, by := at(t, b)
	return math.Hypot(ax-bx, ay-by)
}

// clearOf is whether two bodies stand apart, not one on the other.
func clearOf(t *testing.T, a, b *ecs.Entity) bool {
	return apart(t, a, b) >= 2*constants.PlayerRadius-1e-6
}

// A completed Recall stands two teammates from the far corners of the floor
// within 2 cells of the mage, on the nearest free spots, clear of the mage and
// of each other; 50 mana is paid and the page is spent, with no cooldown.
// AC 1; R25, R8.
func TestBookSystemCast_RecallPullsEveryTeammateToTheMage(t *testing.T) {
	em := ecs.NewEntityManager()
	mage, cast := recallCast(em)
	near := recallBody(em, "warrior", 17, 1300, 800)
	far := recallBody(em, "archer", 17, 100, 100)
	books := NewBookSystem(em)

	require.NoError(t, books.Cast(cast))
	recallThrough(books, em, recallGround)

	for _, mate := range []*ecs.Entity{near, far} {
		assert.InDelta(t, 2*constants.PlayerRadius, apart(t, mage, mate), 1e-6, "on the nearest ring, touching the mage")
	}
	assert.True(t, clearOf(t, near, far), "not on each other")
	pool, _ := bookPool(mage)
	assert.Equal(t, 50, pool.Current, "50 mana")
	book := bookOfT(t, mage)
	assert.True(t, book.Spent[components.PageRecall], "spent")
	assert.Empty(t, book.Cooldowns, "no cooldown")
	assert.Nil(t, book.Casting)
}

// A Recall with no one to pull is refused at the cast with nothing spent: a
// solo mage, and a mage whose only teammate is dead, escaped or left behind.
// AC 2; R25.
func TestBookSystemCast_RecallWithNoOneToPullIsRefused(t *testing.T) {
	tests := []struct {
		name string
		mate func(em *ecs.EntityManager)
	}{
		{"solo", func(*ecs.EntityManager) {}},
		{"a dead teammate", func(em *ecs.EntityManager) {
			hc, _ := recallBody(em, "warrior", 1, 900, 500).GetComponent(ecs.ComponentTypeHealth)
			hc.(*components.HealthComponent).CurrentHealth = 0
		}},
		{"an escaped teammate", func(em *ecs.EntityManager) {
			pc, _ := recallBody(em, "warrior", 1, 900, 500).GetComponent(ecs.ComponentTypePlayer)
			pc.(*components.PlayerComponent).Escape = true
		}},
		{"a teammate left behind", func(em *ecs.EntityManager) {
			pc, _ := recallBody(em, "warrior", 1, 900, 500).GetComponent(ecs.ComponentTypePlayer)
			pc.(*components.PlayerComponent).LeftBehind = true
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			mage, cast := recallCast(em)
			tt.mate(em)

			assert.ErrorIs(t, NewBookSystem(em).Cast(cast), ErrNoOneToPull)

			book := bookOfT(t, mage)
			assert.Nil(t, book.Casting, "not casting")
			assert.False(t, book.Spent[components.PageRecall], "not spent")
			pool, _ := bookPool(mage)
			assert.Equal(t, 100, pool.Current, "no mana")
		})
	}
}

// A teammate who dies during the cast leaves no one to pull: the cast ends
// with nothing, the page still ready for the floor. R17, R25.
func TestBookSystemCast_RecallWhoseTeammateFellMidCastEndsWithNothing(t *testing.T) {
	em := ecs.NewEntityManager()
	mage, cast := recallCast(em)
	mate := recallBody(em, "warrior", 1, 900, 500)
	books := NewBookSystem(em)
	require.NoError(t, books.Cast(cast))

	hc, _ := mate.GetComponent(ecs.ComponentTypeHealth)
	hc.(*components.HealthComponent).CurrentHealth = 0
	recallThrough(books, em, recallGround)

	book := bookOfT(t, mage)
	assert.Nil(t, book.Casting, "the cast ended")
	assert.False(t, book.Spent[components.PageRecall], "not spent")
	pool, _ := bookPool(mage)
	assert.Equal(t, 100, pool.Current, "no mana")
	x, y := at(t, mate)
	assert.Equal(t, [2]float64{900, 500}, [2]float64{x, y}, "the fallen stay where they fell")
}

// A recalled teammate's own timed open and cast break, and a charge in flight
// ends where they stood, before the move. R25; §Edge States "Recall pulls a
// teammate mid-cast or mid-timed-open".
func TestBookSystemCast_RecallBreaksWhatTheTeammateWasDoing(t *testing.T) {
	em := ecs.NewEntityManager()
	mage, cast := recallCast(em)
	mate := recallBody(em, "warrior", 9, 1000, 500, components.PageHardened)
	mate.AddComponent(&components.TimedOpenComponent{TargetID: uuid.New(), Duration: 1.5, FromX: 1000, FromY: 500, HealthBeforeCombat: 100})
	mate.AddComponent(&components.DashComponent{DirX: 1, Speed: 600, Remaining: 100})
	var endedAt [2]float64
	ground := recallGround
	ground.EndCharge = func(e *ecs.Entity) {
		endedAt[0], endedAt[1] = at(t, e)
		e.RemoveComponent(ecs.ComponentTypeDash)
	}
	cast.BookGround = ground
	books := NewBookSystem(em)
	require.NoError(t, books.Cast(cast))

	// the teammate starts a cast of their own on the recall's last tick
	for range recallTicks {
		books.Update(castTick, em.GetAllEntities(), BookGround{})
		books.AdvanceCasts(castTick, em.GetAllEntities(), nil, ground)
	}
	bookOfT(t, mate).Casting = &components.BookCasting{Page: components.PageHardened, Total: 1, FromX: 1000, FromY: 500, HealthBeforeCombat: 100}
	books.AdvanceCasts(castTick, em.GetAllEntities(), nil, ground)

	require.InDelta(t, 2*constants.PlayerRadius, apart(t, mage, mate), 1e-6, "recalled")
	assert.False(t, mate.HasComponent(ecs.ComponentTypeTimedOpen), "the timed open broke")
	assert.Nil(t, bookOfT(t, mate).Casting, "the cast broke")
	assert.Equal(t, [2]float64{1000, 500}, endedAt, "the charge ended where they stood")
	assert.False(t, mate.HasComponent(ecs.ComponentTypeDash))
}

// A teammate never lands in a wall, past one, or on another body: with a wall
// along the mage's right and a monster at their left, every landing is on the
// mage's side of the wall, clear of it by a body's radius, and clear of the
// monster. R25.
func TestBookSystemCast_RecallLandsClearOfWallsAndBodies(t *testing.T) {
	em := ecs.NewEntityManager()
	mage, cast := recallCast(em)
	wall := em.CreateEntity()
	wall.AddComponent(components.NewTransformComponent(540, 0))
	wall.AddComponent(components.NewWallComponent(uuid.Nil, uuid.New(), 20, 960))
	monster := em.CreateEntity()
	monster.AddComponent(components.NewTransformComponent(460, 500))
	monster.AddComponent(components.NewVelocityComponent(0, 0, 100))
	mates := []*ecs.Entity{
		recallBody(em, "warrior", 1, 1300, 500),
		recallBody(em, "archer", 1, 1300, 700),
		recallBody(em, "mercenary", 1, 100, 100),
	}
	books := NewBookSystem(em)
	require.NoError(t, books.Cast(cast))
	recallThrough(books, em, recallGround)

	for i, mate := range mates {
		x, _ := at(t, mate)
		assert.LessOrEqual(t, x+constants.PlayerRadius, 540.0, "teammate %d clear of the wall, on the mage's side", i)
		assert.LessOrEqual(t, apart(t, mage, mate), 2*testCell, "teammate %d within 2 cells", i)
		assert.True(t, clearOf(t, mate, mage), "teammate %d off the mage", i)
		assert.True(t, clearOf(t, mate, monster), "teammate %d off the monster", i)
		for _, other := range mates[i+1:] {
			assert.True(t, clearOf(t, mate, other), "teammate %d off another teammate", i)
		}
	}
}

// With no free spot within 2 cells a teammate stays where they are, their
// timed open untouched; the Recall still pays and is spent. R25.
func TestBookSystemCast_RecallWithNowhereToLandLeavesTheTeammate(t *testing.T) {
	em := ecs.NewEntityManager()
	mage, cast := recallCast(em)
	mate := recallBody(em, "warrior", 1, 1300, 500)
	mate.AddComponent(&components.TimedOpenComponent{TargetID: uuid.New(), Duration: 1.5, FromX: 1300, FromY: 500})
	ground := recallGround
	ground.Ground = groundNowhere{}
	cast.BookGround = ground
	books := NewBookSystem(em)
	require.NoError(t, books.Cast(cast))
	recallThrough(books, em, ground)

	x, y := at(t, mate)
	assert.Equal(t, [2]float64{1300, 500}, [2]float64{x, y})
	assert.True(t, mate.HasComponent(ecs.ComponentTypeTimedOpen))
	assert.True(t, bookOfT(t, mage).Spent[components.PageRecall])
}

// groundNowhere is a world walled in at every body's edge.
type groundNowhere struct{}

func (groundNowhere) Reach(_ []*ecs.Entity, fromX, fromY, _, _ float64) (float64, float64) {
	return fromX, fromY
}
