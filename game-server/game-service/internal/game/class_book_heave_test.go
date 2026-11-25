package game

import (
	"slices"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-X2CMM §B R12, §J R52 as reconciled at wave 2, on FS-5FZ4J §C R17-R19's
// Weighted Plates. I-X2CMM-17.

// heaveReady stands block one cell short of target along a free axis of its
// room and the warrior behind it, level 3, on a floor's grid as a push would
// have left them. The cell the block is shoved to is target.
func heaveReady(t *testing.T, s *Session, warrior, block *ecs.Entity, target components.Cell) {
	t.Helper()
	d := s.dungeon
	room := d.layout.Rooms[d.roomAt(transformOf(t, block).X, transformOf(t, block).Y)].Rect
	inRoom := func(c components.Cell) bool {
		return c.X >= room.X && c.Y >= room.Y && c.X < room.X+room.W && c.Y < room.Y+room.H
	}
	taken := func(c components.Cell) bool {
		for _, other := range slices.Concat(piecesOfKind(s, components.SealPieceBlock), piecesOfKind(s, components.SealPiecePlate)) {
			if other.ID != block.ID && pieceOf(other).Cell == c {
				return true
			}
		}
		return false
	}
	sc, _ := warrior.GetComponent(ecs.ComponentTypeStats)
	sc.(*components.StatsComponent).Level = 3
	for _, dir := range [][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}} {
		from, behind := offset(target, -dir[0], -dir[1]), offset(target, -2*dir[0], -2*dir[1])
		if !inRoom(from) || !inRoom(behind) || taken(from) || taken(behind) {
			continue
		}
		was := pieceOf(block).Cell
		s.navGrid.SetWalkable(was.X, was.Y, true)
		pieceOf(block).Cell = from
		standOn(t, s, block, from)
		s.navGrid.SetWalkable(from.X, from.Y, false)
		standOn(t, s, warrior, behind)
		return
	}
	require.Fail(t, "no free axis to heave the block onto the target")
}

// A level-3 warrior beside a stone block heaves it, by its entity id, onto
// the plate beyond: after the 2 s cast the block slides there, comes to rest
// and holds the plate on the warrior's account; its 20 s cooldown runs.
func TestCastSkill_HeaveShovesABlockOntoAPlate(t *testing.T) {
	s, player, _ := platesRun(t, 7)
	plates := piecesOfKind(s, components.SealPiecePlate)
	blocks := piecesOfKind(s, components.SealPieceBlock)
	warrior := delverEntity(t, s, player)
	target := pieceOf(plates[0]).Cell
	heaveReady(t, s, warrior, blocks[0], target)

	require.NoError(t, s.castSkill(player, types.PlayerCastSkillPayload{SkillID: "heave", TargetID: blocks[0].ID.String()}))
	require.NotNil(t, bookOf(t, warrior).Casting, "a 2 s cast")
	ticks(s, castTicks(2)+castTicks(1))

	assert.Equal(t, target, pieceOf(blocks[0]).Cell, "shoved onto the plate")
	assert.False(t, stoneOf(blocks[0]).Sliding, "come to rest")
	assert.Equal(t, warrior.ID, stoneOf(blocks[0]).PushedBy, "the warrior's shove")
	assert.True(t, pieceOf(plates[0]).Active, "the block holds the plate")
	assert.Equal(t, 20.0, bookOf(t, warrior).Cooldowns[components.PageHeave].Total, "paid for: its cooldown runs")
}
