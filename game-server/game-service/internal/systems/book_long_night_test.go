package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §E R26, R31. I-X2CMM-6.

// selfCast is the caster's cast of a page that names no target.
func selfCast(caster *ecs.Entity, id components.PageID) BookCast {
	page, _ := BookPageOf(string(id))
	return BookCast{Caster: caster, Page: page, CellSize: testCell}
}

// A level-3 archer's Tracker's Eye is instant: 20 stamina, its 60 s cooldown
// and tracker's eye for 15 s on the archer's states. R26; §B.
func TestBookSystemCast_TrackersEyeGivesTheArcherItsStateFor15s(t *testing.T) {
	em := ecs.NewEntityManager()
	archer := bookDelver(em, "archer", 3, 500, 500, components.PageTrackersEye)

	require.NoError(t, NewBookSystem(em).Cast(selfCast(archer, components.PageTrackersEye)))

	book := bookOfT(t, archer)
	assert.Equal(t, 15.0, book.States[components.BookStateTrackersEye])
	assert.Equal(t, 80, pool(archer), "100 - 20 stamina")
	assert.Equal(t, components.BookCooldown{Remaining: 60, Total: 60}, book.Cooldowns[components.PageTrackersEye])
	assert.Nil(t, book.Casting, "instant")
}

// A level-15 warrior's Long Night is instant: 40 stamina, its 120 s cooldown
// and long night for 6 s on the warrior's states. R31; §B.
func TestBookSystemCast_TheLongNightGivesTheWarriorItsStateFor6s(t *testing.T) {
	em := ecs.NewEntityManager()
	warrior := bookDelver(em, "warrior", 15, 500, 500, components.PageLongNight)

	require.NoError(t, NewBookSystem(em).Cast(selfCast(warrior, components.PageLongNight)))

	book := bookOfT(t, warrior)
	assert.Equal(t, 6.0, book.States[components.BookStateLongNight])
	assert.Equal(t, 60, pool(warrior), "100 - 40 stamina")
	assert.Equal(t, components.BookCooldown{Remaining: 120, Total: 120}, book.Cooldowns[components.PageLongNight])
}

// nightField is a warrior at (0, 0) who has cast the Long Night, a teammate
// at (300, 0), and the books that run the night down.
func nightField(t *testing.T) (em *ecs.EntityManager, books *BookSystem, warrior, mate *ecs.Entity) {
	t.Helper()
	em = ecs.NewEntityManager()
	warrior = bookDelver(em, "warrior", 15, 0, 0, components.PageLongNight)
	mate = delver(em, 300, 0)
	books = NewBookSystem(em)
	require.NoError(t, books.Cast(selfCast(warrior, components.PageLongNight)))
	return em, books, warrior, mate
}

// chasing is a ghoul at (x, 0) already after the target.
func chasing(em *ecs.EntityManager, x float64, target *ecs.Entity) *ecs.Entity {
	g := hunter(em, x, 0)
	monster(g).Target = target.ID
	return g
}

// Under the Long Night a monster chasing a teammate 3 cells from the warrior
// turns on the warrior; one 7 cells off keeps its teammate. R31.
func TestMonsterAISystem_TheLongNightTurnsMonstersWithin5CellsOnTheWarrior(t *testing.T) {
	em, _, warrior, mate := nightField(t)
	near := chasing(em, 3*testCell, mate)
	far := chasing(em, 7*testCell, mate)

	think(em)

	assert.Equal(t, warrior.ID, monster(near).Target, "3 cells: turned")
	assert.Equal(t, mate.ID, monster(far).Target, "7 cells: not")
}

// A monster that comes within 5 cells while the night runs turns too, and one
// turned holds the warrior as a retaliation is held: walked off past its
// leash, it still chases them. R31.
func TestMonsterAISystem_TheLongNightTakesMonstersThatComeNearAndHoldsThem(t *testing.T) {
	em, _, warrior, mate := nightField(t)
	g := chasing(em, 7*testCell, mate)
	think(em)
	require.Equal(t, mate.ID, monster(g).Target)

	moveTo(t, g, 4*testCell, 0)
	think(em)
	assert.Equal(t, warrior.ID, monster(g).Target, "came within 5 cells")

	moveTo(t, g, 600, 0) // past the ghoul's 520 px leash of the warrior
	think(em)
	assert.Equal(t, warrior.ID, monster(g).Target, "held beyond the leash")
}

// A stunned monster within 5 cells takes the warrior as its target and stays
// stunned. R31; Edge States "Stunned monster under the Long Night".
func TestMonsterAISystem_AStunnedMonsterUnderTheLongNightStaysStunned(t *testing.T) {
	em, _, warrior, mate := nightField(t)
	g := chasing(em, 3*testCell, mate)
	stun(monster(g), 4)

	think(em)

	assert.Equal(t, warrior.ID, monster(g).Target)
	assert.Greater(t, monster(g).StunRemaining, 3.9, "still stunned")
	assert.Equal(t, components.MonsterActionStunned, monster(g).Action)
	assert.Zero(t, velocityOf(t, g).VX, "stands")
}

// A warrior out of play turns no one, under the night or not. R31.
func TestMonsterAISystem_TheLongNightOfADeadWarriorTurnsNoOne(t *testing.T) {
	em, _, warrior, mate := nightField(t)
	g := chasing(em, 3*testCell, mate)
	killDelver(warrior)

	think(em)

	assert.Equal(t, mate.ID, monster(g).Target)
}

// After its 6 s the night is gone, and a monster near the warrior picks its
// target as it normally does. R31.
func TestMonsterAISystem_AfterTheLongNightMonstersPickTheirTargetsNormally(t *testing.T) {
	em, books, warrior, mate := nightField(t)
	for range ticks(6) {
		books.Update(tickSeconds, em.GetAllEntities())
	}
	require.NotContains(t, bookOfT(t, warrior).States, components.BookStateLongNight, "the night is over")
	g := chasing(em, 3*testCell, mate)

	think(em)

	assert.Equal(t, mate.ID, monster(g).Target)
}

// Every hit on a warrior under the Long Night deals 30 % less: the troll's 30
// lands as 21. R31.
func TestCombatSystem_AHitOnAWarriorUnderTheLongNightDeals70Percent(t *testing.T) {
	for _, tt := range []struct {
		name  string
		night bool
		want  int
	}{
		{"under the night", true, 21},
		{"without it", false, 30},
	} {
		t.Run(tt.name, func(t *testing.T) {
			em := ecs.NewEntityManager()
			warrior := delver(em, 100, 100)
			warrior.AddComponent(components.NewBookComponent([]components.PageID{components.PageLongNight}))
			if tt.night {
				setBookState(warrior, components.BookStateLongNight, 6)
			}
			troll := striker(em, 140, 100, 200)
			troll.AddComponent(&components.CombatComponent{Attack: 36, Defense: 50})

			strikeOnce(em, troll, warrior)

			assert.Equal(t, tt.want, 150-health(warrior))
		})
	}
}
