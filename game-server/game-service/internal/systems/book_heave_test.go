package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §B R12, §J R52 as reconciled at wave 2: Heave shoves an adjacent
// stone block one cell directly away from the warrior, inside its plates
// room, where a push could take it. I-X2CMM-17.

// heaveWorld is a push world (a 12 x 12 floor, a stone block on (5, 5),
// blockCell = testCell) with a level-3 warrior holding Heave, their centre on
// cell (x, y)'s centre. The block is an interactable, as a laid seal piece is.
func heaveWorld(t *testing.T, x, y float64) (*pushWorld, *ecs.Entity) {
	t.Helper()
	w := newPushWorld(t)
	w.block.AddComponent(&components.InteractableComponent{})
	warrior := bookDelver(w.em, "warrior", 3, (x+0.5)*blockCell, (y+0.5)*blockCell, components.PageHeave)
	return w, warrior
}

// heaveCast is the warrior's Heave at target, over the world's grid.
func heaveCast(w *pushWorld, warrior, target *ecs.Entity) BookCast {
	page, _ := BookPageOf(string(components.PageHeave))
	return BookCast{Caster: warrior, Page: page, Target: target, CellSize: blockCell, BookGround: w.heaveGround()}
}

func (w *pushWorld) heaveGround() BookGround {
	return BookGround{Walkable: anyGround, Cells: w.grid}
}

// heaveFor counts the world's casts through seconds of ticks, nothing moving.
func heaveFor(w *pushWorld, books *BookSystem, seconds float64) {
	for range ticksOf(seconds) {
		books.AdvanceCasts(castTick, w.em.GetAllEntities(), nil, w.heaveGround(), PageEntryPoints{})
	}
}

func staminaOf(t *testing.T, e *ecs.Entity) int {
	t.Helper()
	pool, ok := bookPool(e)
	require.True(t, ok)
	return pool.Current
}

// Heave is offered: castable and sent (R59).
func TestPageOffered_Heave(t *testing.T) {
	assert.True(t, PageOffered(components.PageHeave))
}

// A completed Heave shoves the block one cell away from the warrior, as a
// push lands: the warrior its pusher. It costs 25 stamina and starts its
// 20 s cooldown only when it completes, after its 2 s.
func TestHeave_ShovesTheBlockOneCellAwayOnCompletion(t *testing.T) {
	w, warrior := heaveWorld(t, 4, 5)
	books := NewBookSystem(w.em)

	require.NoError(t, books.Cast(heaveCast(w, warrior, w.block)))
	heaveFor(w, books, 1.9)
	assert.Equal(t, components.Cell{X: 5, Y: 5}, cellOf(w.block), "nothing before its cast time")
	assert.Equal(t, 100, staminaOf(t, warrior), "nothing paid before it completes")

	heaveFor(w, books, 0.1)

	assert.Equal(t, components.Cell{X: 6, Y: 5}, cellOf(w.block), "one cell east, away from the warrior")
	assert.Equal(t, warrior.ID, blockT(t, w.block).PushedBy, "the warrior's push, for the plates")
	assert.True(t, blockT(t, w.block).Sliding, "it slides there as a push does")
	assert.False(t, w.grid.Walkable(6, 5), "the grid follows it")
	assert.Equal(t, 75, staminaOf(t, warrior), "25 stamina")
	assert.Equal(t, 20.0, bookOfT(t, warrior).Cooldowns[components.PageHeave].Total, "its 20 s cooldown")
}

// The block goes along the axis the warrior stands most along, away from
// them; a warrior on an exact diagonal shoves it along the row (x before y).
func TestHeave_ShovesAlongTheDominantAxis(t *testing.T) {
	tests := []struct {
		name   string
		x, y   float64
		toward components.Cell
	}{
		{"from the west", 4, 5, components.Cell{X: 6, Y: 5}},
		{"from the east", 6, 5, components.Cell{X: 4, Y: 5}},
		{"from the north", 5, 4, components.Cell{X: 5, Y: 6}},
		{"from the south", 5, 6, components.Cell{X: 5, Y: 4}},
		{"from west and a little north", 4, 4.6, components.Cell{X: 6, Y: 5}},
		{"from north and a little west", 4.6, 4, components.Cell{X: 5, Y: 6}},
		{"from the north-west diagonal, along the row", 4, 4, components.Cell{X: 6, Y: 5}},
		{"from the south-east diagonal, along the row", 6, 6, components.Cell{X: 4, Y: 5}},
		{"from the north-east diagonal, along the row", 6, 4, components.Cell{X: 4, Y: 5}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w, warrior := heaveWorld(t, tt.x, tt.y)
			books := NewBookSystem(w.em)

			require.NoError(t, books.Cast(heaveCast(w, warrior, w.block)))
			heaveFor(w, books, 2)

			assert.Equal(t, tt.toward, cellOf(w.block))
		})
	}
}

// A Heave at nothing, at an interactable that is no stone block, at a block
// out of reach, at a block the push rule would refuse, or on a floor with no
// grid is refused at the cast, nothing spent and no cast begun.
func TestHeave_RefusedAtTheCast(t *testing.T) {
	tests := []struct {
		name   string
		ready  func(t *testing.T, w *pushWorld, cast *BookCast)
		x, y   float64
		reason error
	}{
		{"no target", func(_ *testing.T, _ *pushWorld, cast *BookCast) { cast.Target = nil }, 4, 5, ErrBadPageTarget},
		{"an interactable that is no block", func(_ *testing.T, w *pushWorld, cast *BookCast) {
			lever := w.em.CreateEntity()
			lever.AddComponent(&components.SealPieceComponent{Kind: components.SealPieceLever, Cell: components.Cell{X: 4, Y: 4}})
			lever.AddComponent(components.NewTransformComponent(4.5*blockCell, 4.5*blockCell))
			lever.AddComponent(&components.InteractableComponent{})
			cast.Target = lever
		}, 4, 5, ErrBadPageTarget},
		{"a block two cells off", func(*testing.T, *pushWorld, *BookCast) {}, 3, 5, ErrBadPageTarget},
		{"rock beyond the block", func(_ *testing.T, w *pushWorld, _ *BookCast) { w.grid.SetWalkable(6, 5, false) }, 4, 5, ErrBlockWontShove},
		{"another block beyond", func(_ *testing.T, w *pushWorld, _ *BookCast) { w.addBlock(6, 5) }, 4, 5, ErrBlockWontShove},
		{"a delver beyond", func(_ *testing.T, w *pushWorld, _ *BookCast) { w.addDelver(6.5*blockCell, 5.5*blockCell, 0, 0) }, 4, 5, ErrBlockWontShove},
		{"beyond is out of its plates room", func(t *testing.T, w *pushWorld, _ *BookCast) {
			blockT(t, w.block).Room = components.CellRect{X: 3, Y: 3, W: 3, H: 3}
		}, 4, 5, ErrBlockWontShove},
		{"no grid", func(_ *testing.T, _ *pushWorld, cast *BookCast) { cast.Cells = nil }, 4, 5, ErrBlockWontShove},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w, warrior := heaveWorld(t, tt.x, tt.y)
			cast := heaveCast(w, warrior, w.block)
			tt.ready(t, w, &cast)

			err := NewBookSystem(w.em).Cast(cast)

			assert.ErrorIs(t, err, tt.reason)
			assert.Nil(t, bookOfT(t, warrior).Casting, "no cast begun")
			assert.Equal(t, 100, staminaOf(t, warrior))
			assert.Equal(t, components.Cell{X: 5, Y: 5}, cellOf(w.block))
		})
	}
}

// A shove refused when the cast completes ends the cast with nothing: the
// block stays, no stamina is spent and no cooldown starts. A delver stepped
// into the cell beyond, the block was taken from the floor, or it was
// pushed away and still slides.
func TestHeave_RefusedAtCompletionSpendsNothing(t *testing.T) {
	tests := []struct {
		name  string
		ready func(t *testing.T, w *pushWorld)
		stays components.Cell
	}{
		{"a delver stepped beyond", func(_ *testing.T, w *pushWorld) {
			w.addDelver(6.5*blockCell, 5.5*blockCell, 0, 0)
		}, components.Cell{X: 5, Y: 5}},
		{"the block is gone", func(_ *testing.T, w *pushWorld) { w.em.RemoveEntity(w.block.ID) }, components.Cell{X: 5, Y: 5}},
		{"the block still slides off north", func(t *testing.T, w *pushWorld) {
			require.True(t, ShoveStoneBlock(w.grid, w.block, 0, -1, uuid.New(), w.em.GetAllEntities()))
		}, components.Cell{X: 5, Y: 4}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w, warrior := heaveWorld(t, 4, 5)
			books := NewBookSystem(w.em)
			require.NoError(t, books.Cast(heaveCast(w, warrior, w.block)))

			tt.ready(t, w)
			heaveFor(w, books, 2)

			assert.Nil(t, bookOfT(t, warrior).Casting, "the cast is over")
			assert.Equal(t, tt.stays, cellOf(w.block), "not shoved by the Heave")
			assert.Equal(t, 100, staminaOf(t, warrior), "nothing spent")
			assert.NotContains(t, bookOfT(t, warrior).Cooldowns, components.PageHeave, "no cooldown")
		})
	}
}
