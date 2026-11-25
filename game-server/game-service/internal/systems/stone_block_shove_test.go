package systems

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §J R52 as reconciled at wave 2, FS-5FZ4J §C R19: a shove moves a
// stone block one cell at once, landing as a walked push lands. I-X2CMM-17.

func blockT(t *testing.T, e *ecs.Entity) *components.StoneBlockComponent {
	t.Helper()
	bc, ok := e.GetComponent(ecs.ComponentTypeStoneBlock)
	require.True(t, ok)
	return bc.(*components.StoneBlockComponent)
}

// A shove east lands the block on the cell east of it at once: its new cell
// shut on the grid from the shove, the shover its pusher and its drift timer
// started over; it slides there and its old cell opens when it arrives.
func TestShoveStoneBlock_LandsItOneCellAlongTheWay(t *testing.T) {
	w := newPushWorld(t)
	shover := uuid.New()
	blockT(t, w.block).Still = 12

	require.True(t, ShoveStoneBlock(w.grid, w.block, 1, 0, shover, w.em.GetAllEntities()))

	block := blockT(t, w.block)
	assert.Equal(t, components.Cell{X: 6, Y: 5}, cellOf(w.block), "its cell moves on at once")
	assert.False(t, w.grid.Walkable(6, 5), "its new cell shut from the shove")
	assert.False(t, w.grid.Walkable(5, 5), "its old cell shut until it arrives")
	assert.True(t, block.Sliding)
	assert.Equal(t, shover, block.PushedBy, "the shover is its pusher, as a walker is")
	assert.Zero(t, block.Still, "its drift home counts from the shove")

	w.run(pushTime() + 0.1)

	bx, by := centreOf(w.block)
	assert.InDelta(t, 6.5*blockCell, bx, 1e-9, "slid onto its new cell")
	assert.InDelta(t, 5.5*blockCell, by, 1e-9)
	assert.False(t, blockT(t, w.block).Sliding)
	assert.True(t, w.grid.Walkable(5, 5), "its old cell open once it is there")
}

// A shove the Spire's push rule refuses moves nothing and says so: into rock,
// another block, a body, out of the plates room, or by a way that is no
// single step along one axis.
func TestShoveStoneBlock_RefusedWhereAPushIsRefused(t *testing.T) {
	tests := []struct {
		name   string
		ready  func(t *testing.T, w *pushWorld)
		dx, dy int
	}{
		{"rock beyond", func(_ *testing.T, w *pushWorld) { w.grid.SetWalkable(6, 5, false) }, 1, 0},
		{"another block beyond", func(_ *testing.T, w *pushWorld) { w.addBlock(5, 6) }, 0, 1},
		{"a delver beyond", func(_ *testing.T, w *pushWorld) { w.addDelver(4.5*blockCell, 5.5*blockCell, 0, 0) }, -1, 0},
		{"a monster beyond", func(_ *testing.T, w *pushWorld) { w.addMonster(5.5*blockCell, 4.5*blockCell, 0, 0) }, 0, -1},
		{"out of its plates room", func(t *testing.T, w *pushWorld) {
			blockT(t, w.block).Room = components.CellRect{X: 3, Y: 3, W: 3, H: 3}
		}, 1, 0},
		{"no step along one axis", func(*testing.T, *pushWorld) {}, 1, 1},
		{"no step at all", func(*testing.T, *pushWorld) {}, 0, 0},
		{"a step of two cells", func(*testing.T, *pushWorld) {}, 2, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := newPushWorld(t)
			tt.ready(t, w)
			bx, by := centreOf(w.block)

			assert.False(t, StoneBlockShovable(w.grid, w.block, tt.dx, tt.dy, w.em.GetAllEntities()))
			assert.False(t, ShoveStoneBlock(w.grid, w.block, tt.dx, tt.dy, uuid.New(), w.em.GetAllEntities()))

			assert.Equal(t, components.Cell{X: 5, Y: 5}, cellOf(w.block), "the block stays")
			assert.False(t, blockT(t, w.block).Sliding)
			ax, ay := centreOf(w.block)
			assert.Equal(t, bx, ax)
			assert.Equal(t, by, ay)
		})
	}
}

// A block still sliding from a push or a shove is not shoved again until it
// stands on its cell.
func TestShoveStoneBlock_RefusedWhileItSlides(t *testing.T) {
	w := newPushWorld(t)
	require.True(t, ShoveStoneBlock(w.grid, w.block, 1, 0, uuid.New(), w.em.GetAllEntities()))

	assert.False(t, StoneBlockShovable(w.grid, w.block, 1, 0, w.em.GetAllEntities()))
	assert.False(t, ShoveStoneBlock(w.grid, w.block, 1, 0, uuid.New(), w.em.GetAllEntities()))
	assert.Equal(t, components.Cell{X: 6, Y: 5}, cellOf(w.block), "one cell, not two")
}

// Shovable answers as the shove would, and moves nothing.
func TestStoneBlockShovable_MovesNothing(t *testing.T) {
	w := newPushWorld(t)

	assert.True(t, StoneBlockShovable(w.grid, w.block, 0, 1, w.em.GetAllEntities()))

	assert.Equal(t, components.Cell{X: 5, Y: 5}, cellOf(w.block))
	assert.True(t, w.grid.Walkable(5, 6))
	assert.False(t, blockT(t, w.block).Sliding)
}

// Anything that is no stone block, and a floor with no grid, shove nothing.
func TestShoveStoneBlock_NoBlockOrNoGridShovesNothing(t *testing.T) {
	w := newPushWorld(t)
	lever := w.em.CreateEntity()
	lever.AddComponent(&components.SealPieceComponent{Kind: components.SealPieceLever, Cell: components.Cell{X: 2, Y: 2}})
	lever.AddComponent(components.NewTransformComponent(2.5*blockCell, 2.5*blockCell))

	assert.False(t, ShoveStoneBlock(w.grid, lever, 1, 0, uuid.New(), w.em.GetAllEntities()))
	assert.False(t, ShoveStoneBlock(w.grid, nil, 1, 0, uuid.New(), w.em.GetAllEntities()))
	assert.False(t, ShoveStoneBlock(nil, w.block, 1, 0, uuid.New(), w.em.GetAllEntities()))
	assert.True(t, w.grid.Walkable(3, 2))
	assert.Equal(t, components.Cell{X: 5, Y: 5}, cellOf(w.block))
}
