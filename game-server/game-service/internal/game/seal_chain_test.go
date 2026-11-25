package game

import (
	"slices"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// chainedRun is floor 9 of the first seeded run of one delver whose floor 9
// drew first then second, with no monster on it; its delver's id and its
// seals by stage.
func chainedRun(t *testing.T, first, second components.SealKind) (*Session, uuid.UUID, []*ecs.Entity) {
	t.Helper()
	for seed := uint64(1); seed < 400; seed++ {
		s, ids := dungeonRun(t, seed, 1, 0)
		floor := currentFloor(t, s)
		floor.Count, floor.Depth = 12, 8
		require.NoError(t, s.regenerateFloor())
		if s.dungeon == nil {
			continue
		}
		seals := entitiesWith(s, ecs.ComponentTypeSeal)
		slices.SortFunc(seals, func(a, b *ecs.Entity) int { return sealComponentOf(a).Stage - sealComponentOf(b).Stage })
		if len(seals) == 2 && sealComponentOf(seals[0]).Kind == first && sealComponentOf(seals[1]).Kind == second {
			clearMonsters(s)
			return s, ids[0], seals
		}
	}
	require.Fail(t, "no seed chains the kinds", "%s then %s", first, second)
	return nil, uuid.Nil, nil
}

// piecesOfSeal is seal's laid pieces.
func piecesOfSeal(s *Session, seal *ecs.Entity) []*ecs.Entity {
	var out []*ecs.Entity
	for _, e := range s.EntityManager.GetAllEntities() {
		if pc, ok := e.GetComponent(ecs.ComponentTypeSealPiece); ok && pc.(*components.SealPieceComponent).Seal == seal.ID {
			out = append(out, e)
		}
	}
	return out
}

// FS-5FZ4J §B R9, R13, §I R46: floor 9 chains two seals; only the first's
// pieces stand at the build and the wire names it stage 1 of 2; the first's
// break lays the second's pieces on that tick and the wire moves to stage 2;
// the gate holds until the second, a gate-holding kind, breaks too.
func TestChainedSeals_SecondsPiecesOnTheFirstsBreak(t *testing.T) {
	s, player, seals := chainedRun(t, components.SealLeverOrder, components.SealWeightedPlates)
	require.Empty(t, piecesOfSeal(s, seals[1]), "the second's pieces are not laid yet")
	require.NotEmpty(t, piecesOfSeal(s, seals[0]))
	tick(s)
	assert.False(t, sealComponentOf(seals[1]).Broken, "a second with no pieces holds")
	state := runState(t, s, player).Seal
	assert.Equal(t, "lever_order", state.Kind)
	assert.Equal(t, 1, state.Stage)
	assert.Equal(t, 2, state.Stages)

	for _, lever := range leversInTurn(t, s) {
		pull(t, s, player, lever)
	}

	require.True(t, sealComponentOf(seals[0]).Broken)
	plates := piecesOfKind(s, components.SealPiecePlate)
	assert.NotEmpty(t, plates, "the second's plates are laid on the first's break")
	assert.Len(t, piecesOfKind(s, components.SealPieceBlock), len(plates))
	assert.False(t, barrierOpen(gateOf(t, s)), "the second still holds the gate")
	assert.True(t, s.sealHolds())
	state = runState(t, s, player).Seal
	assert.Equal(t, "weighted_plates", state.Kind)
	assert.Equal(t, 2, state.Stage)
	assert.False(t, state.Broken)

	s.breakSeal(seals[1])
	assert.True(t, barrierOpen(gateOf(t, s)), "the last gate-holding seal opens it")
	assert.True(t, runState(t, s, player).Seal.Broken)
}

// FS-5FZ4J §B R9, R13, §E R33: with a Chasm chained second the gate opens on
// the first's break, since the Chasm holds none, and the stairs refuse until
// the bridge is lowered.
func TestChainedSeals_ChasmSecond_GateOpensWithTheFirst(t *testing.T) {
	s, player, seals := chainedRun(t, components.SealBraziers, components.SealChasm)
	require.True(t, s.dungeon.layout.ChasmCapable, "a Chasm only on a stairs room that holds one")
	require.NotEmpty(t, barriersOfKind(s, components.BarrierPit), "the chasm's ground is laid with the floor")
	require.Empty(t, piecesOfKind(s, components.SealPieceBridgeLever), "the bridge lever waits for the first's break")

	s.breakSeal(seals[0])

	assert.True(t, barrierOpen(gateOf(t, s)), "the Chasm holds no gate")
	assert.True(t, s.sealHolds(), "the stairs refuse until the bridge")
	levers := piecesOfKind(s, components.SealPieceBridgeLever)
	require.Len(t, levers, 1)
	pull(t, s, player, levers[0])
	assert.False(t, s.sealHolds())
}

// FS-5FZ4J §B R9, §F R37: a Hidden Key chained second lays its key in its
// hidden room on the first's break, concealed while the room's door is shut.
func TestChainedSeals_HiddenKeySecond_KeyLaidConcealed(t *testing.T) {
	s, player, seals := chainedRun(t, components.SealLeverOrder, components.SealHiddenKey)
	room, ok := s.dungeon.hiddenRoomOf(hiddenStairKey)
	require.True(t, ok, "the key's hidden room is drawn with the floor")
	_, lies := stairKeyOf(s)
	require.False(t, lies)

	s.breakSeal(seals[0])

	key, lies := stairKeyOf(s)
	require.True(t, lies, "the key is laid on the first's break")
	at := transformOf(t, key)
	assert.Equal(t, room.Room, s.dungeon.roomAt(at.X, at.Y))
	assert.True(t, key.HasComponent(ecs.ComponentTypeConcealed), "hidden behind its shut door")
	for _, p := range runState(t, s, player).SealPieces {
		assert.NotEqual(t, "stair_key", p.Kind, "not sent while concealed")
	}
}

// FS-5FZ4J §B R9, §C R19: a chained Weighted Plates' block laid on the
// first's break never lands on a body: a delver standing on a block's planned
// cell has the block laid on a free cell of the room beside it instead, its
// home still the planned cell, and once left alone it drifts home.
func TestChainedSeals_PlatesSecond_BlockLaidOffABody_ThenDriftsHome(t *testing.T) {
	s, player, seals := chainedRun(t, components.SealLeverOrder, components.SealWeightedPlates)
	var planned []components.Cell
	for _, p := range s.dungeon.seals[1].pieces {
		if p.kind == components.SealPieceBlock {
			planned = append(planned, s.dungeon.cellOf(p.at))
		}
	}
	require.NotEmpty(t, planned)
	delver := delverEntity(t, s, player)
	standOn(t, s, delver, planned[0])

	s.breakSeal(seals[0])

	blocks := piecesOfKind(s, components.SealPieceBlock)
	require.Len(t, blocks, len(planned), "every block is laid")
	var nudged *ecs.Entity
	for _, b := range blocks {
		if stoneOf(b).Home == planned[0] {
			nudged = b
		}
		assert.False(t, systems.BodyOverlapsCell(pieceOf(b).Cell, s.dungeon.layout.CellSize, s.EntityManager.GetAllEntities()),
			"no block laid on a body")
	}
	require.NotNil(t, nudged, "the block keeps its planned cell as its home")
	assert.NotEqual(t, planned[0], pieceOf(nudged).Cell, "laid beside the delver")
	c := pieceOf(nudged).Cell
	assert.False(t, s.navGrid.Walkable(c.X, c.Y), "its cell is shut to paths")
	assert.Equal(t, roomOfPieces(t, s, []*ecs.Entity{nudged}), roomOfPieces(t, s, blocks), "in the plates room")

	start := s.dungeon.roomCentre(s.dungeon.layout.Roles.Start)
	transformOf(t, delver).X, transformOf(t, delver).Y = start.x, start.y
	for range int(BlockDriftAfter+10) * constants.GameFrameRate {
		keepStanding(s.EntityManager)
		tick(s)
	}
	assert.Equal(t, planned[0], pieceOf(nudged).Cell, "home once left alone")
}
