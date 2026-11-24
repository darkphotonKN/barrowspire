package game

import (
	"context"
	"math"
	"slices"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/levelgen"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/serializer"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// forceSeal has every sealed floor built in this test take kind's seal.
func forceSeal(t testing.TB, kind components.SealKind) {
	t.Helper()
	was := ForcedSealKind
	ForcedSealKind = kind
	t.Cleanup(func() { ForcedSealKind = was })
}

// platesRun is floor 1 of a seeded run of one delver with Weighted Plates
// forced and no monster on it, the delver's id and the floor's seal.
func platesRun(t *testing.T, seed uint64) (*Session, uuid.UUID, *ecs.Entity) {
	t.Helper()
	forceSeal(t, components.SealWeightedPlates)
	s, ids := dungeonRun(t, seed, 1, 0)
	require.NotNil(t, s.dungeon, "seed %d: a dungeon floor", seed)
	for _, m := range monstersInWorld(s.EntityManager) {
		s.EntityManager.RemoveEntity(m.ID)
	}
	var seal *ecs.Entity
	for _, e := range s.EntityManager.GetAllEntities() {
		if e.HasComponent(ecs.ComponentTypeSeal) {
			seal = e
		}
	}
	require.NotNil(t, seal, "seed %d: the floor is sealed", seed)
	return s, ids[0], seal
}

// sealComponentOf is a seal entity's seal.
func sealComponentOf(e *ecs.Entity) *components.SealComponent {
	sc, _ := e.GetComponent(ecs.ComponentTypeSeal)
	return sc.(*components.SealComponent)
}

// offset is the cell (dx, dy) from c.
func offset(c components.Cell, dx, dy int) components.Cell {
	return components.Cell{X: c.X + dx, Y: c.Y + dy}
}

// standOn stands e's centre on cell's centre.
func standOn(t *testing.T, s *Session, e *ecs.Entity, cell components.Cell) {
	t.Helper()
	at, centre := transformOf(t, e), s.dungeon.cellCentre(cell)
	at.X, at.Y = centre.x, centre.y
}

// roomOfPieces is the one room every piece stands in.
func roomOfPieces(t *testing.T, s *Session, pieces []*ecs.Entity) int {
	t.Helper()
	room := -1
	for _, p := range pieces {
		at := transformOf(t, p)
		r := s.dungeon.roomAt(at.X, at.Y)
		if room == -1 {
			room = r
		}
		require.Equal(t, room, r, "every piece in one room")
	}
	return room
}

// FS-5FZ4J §C R17, R19-R20, §D R22: floor 1's Weighted Plates has 2 plates
// and as many blocks, all in one room of at least 6x5 cells that is not the
// start, stairs or a treasure room, on distinct cells inside its border and
// beside no doorway, no block on a plate; the room holds nothing else that
// stands on the ground; each block's cell is shut on the floor's grid; one
// plate carries the seal's one ambush. Checked over many seeds.
func TestWeightedPlates_Floor1_PlatesAndBlocksInOneQuietRoom(t *testing.T) {
	for seed := uint64(1); seed <= 25; seed++ {
		forceSeal(t, components.SealWeightedPlates)
		s, _ := dungeonRun(t, seed, 1, 0)
		d := s.dungeon
		require.NotNil(t, d, "seed %d", seed)
		seals := sealsOf(t, s)
		require.Len(t, seals, 1, "seed %d", seed)
		assert.Equal(t, components.SealWeightedPlates, seals[0].Kind)

		plates := piecesOfKind(s, components.SealPiecePlate)
		blocks := piecesOfKind(s, components.SealPieceBlock)
		require.Len(t, plates, PlateCountLow, "seed %d", seed)
		require.Len(t, blocks, len(plates), "seed %d: as many blocks as plates", seed)

		room := roomOfPieces(t, s, slices.Concat(plates, blocks))
		r := d.layout.Rooms[room]
		assert.GreaterOrEqual(t, max(r.Rect.W, r.Rect.H), PlateRoomLong, "seed %d", seed)
		assert.GreaterOrEqual(t, min(r.Rect.W, r.Rect.H), PlateRoomShort, "seed %d", seed)
		assert.NotEqual(t, d.layout.Roles.Start, room)
		assert.NotEqual(t, d.layout.Roles.Stairs, room)
		assert.NotContains(t, d.layout.Roles.Treasure, room)

		cells := map[components.Cell]bool{}
		ambushes := 0
		for _, e := range slices.Concat(plates, blocks) {
			c := pieceOf(e).Cell
			at := transformOf(t, e)
			assert.Equal(t, d.cellOf(point{at.X, at.Y}), c)
			assert.False(t, cells[c], "seed %d: no two pieces on one cell", seed)
			cells[c] = true
			assert.Contains(t, d.plateFooting(room), c, "seed %d: inside the border, beside no doorway", seed)
			if e.HasComponent(ecs.ComponentTypeAmbush) {
				ambushes++
			}
		}
		assert.Equal(t, 1, ambushes, "seed %d: the seal's one ambush", seed)
		for _, b := range blocks {
			assert.True(t, b.HasComponent(ecs.ComponentTypeStoneBlock))
			assert.False(t, s.navGrid.Walkable(pieceOf(b).Cell.X, pieceOf(b).Cell.Y), "seed %d: a block's cell is shut to paths", seed)
		}

		for _, e := range s.EntityManager.GetAllEntities() {
			tc, placed := e.GetComponent(ecs.ComponentTypeTransform)
			if !placed || e.HasComponent(ecs.ComponentTypeSealPiece) || e.HasComponent(ecs.ComponentTypeWall) ||
				e.HasComponent(ecs.ComponentTypePlayer) || e.HasComponent(ecs.ComponentTypeItem) {
				continue
			}
			at := tc.(*components.TransformComponent)
			assert.NotEqual(t, room, d.roomAt(at.X, at.Y), "seed %d: nothing else stands in the plates room", seed)
		}
	}
}

// FS-5FZ4J §C R17: floors 4+ have 2 or 3 plates.
func TestPlateCount_ByFloor(t *testing.T) {
	rng := seededSpawns(1)
	for depth := 1; depth <= PlateLowFloorsMax; depth++ {
		assert.Equal(t, 2, plateCount(rng, depth))
	}
	seen := map[int]bool{}
	for range 200 {
		seen[plateCount(rng, 5)] = true
	}
	assert.Equal(t, map[int]bool{2: true, 3: true}, seen)
}

// FS-5FZ4J §C R20: with Weighted Plates forced, every seed of a 500-seed
// sweep lays its plates and blocks at a placement the push search passes,
// on floor 1 (2 plates) and on a floor of 2 or 3 (floor 5): no seed leaves the
// floor unsealable.
func TestWeightedPlates_PlacementSearch_PassesOnEverySeed(t *testing.T) {
	if testing.Short() {
		t.Skip("the 500-seed sweep")
	}
	forceSeal(t, components.SealWeightedPlates)
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, &countingItemsClient{}, RunBounds())
	for _, depth := range []int{1, 5} {
		params, _ := dungeonParams(depth)
		for seed := uint64(1); seed <= 500; seed++ {
			layout, err := levelgen.GenerateDungeon(params, seed)
			require.NoError(t, err, "seed %d", seed)
			d := newDungeonFloor(layout)
			s.spawnRand = seededSpawns(seed)
			s.objectOccupiedPlaceAreas = nil

			fixtures, err := s.placeFixtures(depth, d, sealKindsFor(depth))
			require.NoError(t, err, "floor %d seed %d: the plates fit", depth, seed)
			require.Len(t, fixtures.seals, 1)

			var plates, blocks []components.Cell
			for _, p := range fixtures.seals[0].pieces {
				switch p.kind {
				case components.SealPiecePlate:
					plates = append(plates, d.cellOf(p.at))
				case components.SealPieceBlock:
					blocks = append(blocks, d.cellOf(p.at))
				}
			}
			require.Len(t, blocks, len(plates))
			room := d.roomAt(fixtures.seals[0].pieces[0].at.x, fixtures.seals[0].pieces[0].at.y)
			r := d.layout.Rooms[room]
			assert.True(t, platesCoverable(r.Rect.W, r.Rect.H, d.inRoom(room, plates), d.inRoom(room, blocks), d.roomEntry(room)),
				"floor %d seed %d: every plate can be covered", depth, seed)
		}
	}
}

// FS-5FZ4J §C R17-R18, §B R11-R13: one plate held breaks nothing; every
// plate held by a delver on the same tick breaks the seal and opens the gate;
// a plate is shown active while held.
func TestWeightedPlates_EveryPlateHeld_BreaksTheSeal(t *testing.T) {
	s, player, seal := platesRun(t, 7)
	plates := piecesOfKind(s, components.SealPiecePlate)
	first := delverEntity(t, s, player)
	secondID := uuid.New()
	s.AddPlayer(secondID, types.CharacterInPlay{Name: "Second", Class: "warrior"}, "")
	second := delverEntity(t, s, secondID)

	standOn(t, s, first, pieceOf(plates[0]).Cell)
	tick(s)
	assert.True(t, pieceOf(plates[0]).Active, "held")
	assert.False(t, pieceOf(plates[1]).Active)
	assert.False(t, sealComponentOf(seal).Broken, "one plate of two")

	standOn(t, s, second, pieceOf(plates[1]).Cell)
	tick(s)
	assert.True(t, sealComponentOf(seal).Broken, "every plate held")
	assert.True(t, barrierOpen(gateOf(t, s)), "the gate opens with it")

	// stepping off: the plates are let go, the seal stays broken (Edge States)
	standOn(t, s, first, offset(pieceOf(plates[0]).Cell, -1, 0))
	tick(s)
	assert.False(t, pieceOf(plates[0]).Active)
	assert.True(t, sealComponentOf(seal).Broken)
}

// FS-5FZ4J §C R18: a monster never holds a plate.
func TestWeightedPlates_MonsterOnAPlate_HoldsNothing(t *testing.T) {
	s, player, seal := platesRun(t, 7)
	plates := piecesOfKind(s, components.SealPiecePlate)
	standOn(t, s, delverEntity(t, s, player), pieceOf(plates[0]).Cell)
	centre := s.dungeon.cellCentre(pieceOf(plates[1]).Cell)
	monster := CreateMonsterEntity(s.EntityManager, MonsterConfig{Archetype: components.MonsterArchetypeGhoul, Level: 1, X: centre.x, Y: centre.y})
	monsterOf(monster).StunRemaining = 10

	tick(s)

	assert.False(t, pieceOf(plates[1]).Active, "a monster weighs nothing")
	assert.False(t, sealComponentOf(seal).Broken)
}

// pushOnto stands block one cell short of target along a free axis, a delver
// behind it, and walks the delver at it until the block has slid onto target.
func pushOnto(t *testing.T, s *Session, delver, block *ecs.Entity, target components.Cell) {
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

		standOn(t, s, delver, behind)
		vc, _ := delver.GetComponent(ecs.ComponentTypeVelocity)
		vc.(*components.VelocityComponent).VX, vc.(*components.VelocityComponent).VY = float64(dir[0]), float64(dir[1])
		for range 4 * constants.GameFrameRate {
			keepStanding(s.EntityManager)
			tick(s)
			bc, _ := block.GetComponent(ecs.ComponentTypeStoneBlock)
			if pieceOf(block).Cell == target && !bc.(*components.StoneBlockComponent).Sliding {
				break
			}
		}
		vc.(*components.VelocityComponent).VX, vc.(*components.VelocityComponent).VY = 0, 0
		require.Equal(t, target, pieceOf(block).Cell, "the block was pushed onto the target")
		return
	}
	require.Fail(t, "no free axis to push the block onto the target")
}

// FS-5FZ4J §C R17-R19: a block pushed onto a plate holds it, and a block and a
// delver together, or blocks alone, holding every plate break the seal.
func TestWeightedPlates_BlocksAndBodiesHoldPlates_TheSealBreaks(t *testing.T) {
	t.Run("a block and a delver", func(t *testing.T) {
		s, player, seal := platesRun(t, 7)
		plates := piecesOfKind(s, components.SealPiecePlate)
		blocks := piecesOfKind(s, components.SealPieceBlock)
		delver := delverEntity(t, s, player)

		pushOnto(t, s, delver, blocks[0], pieceOf(plates[0]).Cell)
		tick(s)
		assert.True(t, pieceOf(plates[0]).Active, "the block holds its plate")
		require.False(t, sealComponentOf(seal).Broken)

		standOn(t, s, delver, pieceOf(plates[1]).Cell)
		tick(s)
		assert.True(t, sealComponentOf(seal).Broken)
	})
	t.Run("blocks alone, one delver", func(t *testing.T) {
		s, player, seal := platesRun(t, 11)
		plates := piecesOfKind(s, components.SealPiecePlate)
		blocks := piecesOfKind(s, components.SealPieceBlock)
		delver := delverEntity(t, s, player)
		for i := range plates {
			pushOnto(t, s, delver, blocks[i], pieceOf(plates[i]).Cell)
		}
		start := s.dungeon.roomCentre(s.dungeon.layout.Roles.Start)
		transformOf(t, delver).X, transformOf(t, delver).Y = start.x, start.y
		tick(s)
		assert.True(t, sealComponentOf(seal).Broken, "solvable by one")
	})
}

// FS-5FZ4J §C R18, §B R14: the first plate held wakes the seal's one ambush,
// hunting the delver who holds it; another plate held after, or the first
// held again, wakes nothing.
func TestWeightedPlates_FirstPlateHeld_WakesTheOneAmbush(t *testing.T) {
	s, player, _ := platesRun(t, 7)
	plates := piecesOfKind(s, components.SealPiecePlate)
	delver := delverEntity(t, s, player)

	standOn(t, s, delver, pieceOf(plates[1]).Cell)
	tick(s)
	pack := monstersInWorld(s.EntityManager)
	require.GreaterOrEqual(t, len(pack), AmbushSizeMin)
	require.LessOrEqual(t, len(pack), AmbushSizeMax)
	for _, m := range pack {
		assert.Equal(t, delver.ID, monsterOf(m).LastAttacker, "it hunts the holder")
	}

	for _, cell := range []components.Cell{offset(pieceOf(plates[1]).Cell, -1, 0), pieceOf(plates[0]).Cell, pieceOf(plates[1]).Cell} {
		standOn(t, s, delver, cell)
		tick(s)
	}
	assert.Len(t, monstersInWorld(s.EntityManager), len(pack), "one ambush in the floor's life")
}

// FS-5FZ4J §D R22, §C R19: a monster's path goes round a block, and a pushed
// block shuts its new cell to paths and opens its old one.
func TestWeightedPlates_MonsterPathsRouteRoundABlock(t *testing.T) {
	s, player, _ := platesRun(t, 7)
	blocks := piecesOfKind(s, components.SealPieceBlock)
	plates := piecesOfKind(s, components.SealPiecePlate)
	block := blocks[0]
	grid := s.navGrid
	cols := s.dungeon.layout.Cols
	index := func(c components.Cell) int { return c.Y*cols + c.X }

	was := pieceOf(block).Cell
	path, found := grid.Path(nil, index(offset(was, -1, 0)), index(offset(was, 1, 0)))
	require.True(t, found, "a way round")
	assert.NotContains(t, path, index(was), "the path goes round the block")

	pushOnto(t, s, delverEntity(t, s, player), block, pieceOf(plates[0]).Cell)
	now := pieceOf(block).Cell
	assert.False(t, grid.Walkable(now.X, now.Y), "its new cell is shut")
	if now != was {
		assert.True(t, grid.Walkable(was.X, was.Y), "its old cell is ground again")
	}
}

// FS-5FZ4J §I R46: a block rides seal_pieces as kind block, with the cell it
// stands on or slides to and its position mid-slide; a plate's active is
// whether it is held.
func TestWeightedPlates_Wire_BlocksMidSlideAndHeldPlates(t *testing.T) {
	s, player, _ := platesRun(t, 7)
	plates := piecesOfKind(s, components.SealPiecePlate)
	block := piecesOfKind(s, components.SealPieceBlock)[0]
	standOn(t, s, delverEntity(t, s, player), pieceOf(plates[0]).Cell)
	tick(s)

	bc, _ := block.GetComponent(ecs.ComponentTypeStoneBlock)
	stone := bc.(*components.StoneBlockComponent)
	at := transformOf(t, block)
	stone.Sliding, stone.FromX, stone.FromY, stone.SlideFor = true, at.X, at.Y, 10
	pieceOf(block).Cell = offset(pieceOf(block).Cell, 1, 0)
	tick(s)

	ser := serializer.NewStateSerializer(s.EntityManager, nil)
	backend, err := ser.SerializeBackendState(context.Background(), s.ID, s.worldType, s.EntityManager.GetAllEntities())
	require.NoError(t, err)
	frame := ser.FormatStateToClientState(backend, uuid.New())
	assert.Equal(t, "weighted_plates", frame.Seal.Kind)
	byID := map[uuid.UUID]int{}
	for i, p := range frame.SealPieces {
		byID[p.EntityID] = i
	}
	wire := frame.SealPieces[byID[block.ID]]
	assert.Equal(t, "block", wire.Kind)
	assert.Equal(t, pieceOf(block).Cell.X, wire.Cell.X, "the cell it slides to")
	assert.Greater(t, wire.Position.X, stone.FromX, "mid-slide")
	assert.Less(t, wire.Position.X, stone.FromX+s.dungeon.layout.CellSize)
	assert.True(t, frame.SealPieces[byID[plates[0].ID]].Active, "a held plate")
	assert.False(t, frame.SealPieces[byID[plates[1].ID]].Active)
	assert.True(t, math.Abs(wire.Position.Y-stone.FromY) < 1e-9)
}
