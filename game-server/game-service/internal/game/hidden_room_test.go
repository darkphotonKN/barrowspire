package game

import (
	"context"
	"slices"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/levelgen"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// keyRun is floor 1 of a seeded run of delvers with the Hidden Key forced, so
// its one hidden room is the key's, and no monster on it; its sender records.
// Every delver stands in the start room's centre, far from the door.
type keyRun struct {
	s       *Session
	sender  *recordingSender
	delvers []uuid.UUID
	hidden  levelgen.BarredRoom
	door    *ecs.Entity
}

func newKeyRun(t *testing.T, seed uint64, delvers int) *keyRun {
	t.Helper()
	s, ids := dungeonRun(t, seed, delvers, 0, forcedSeal(components.SealHiddenKey))
	require.NotNil(t, s.dungeon, "seed %d: a dungeon floor", seed)
	for _, m := range monstersInWorld(s.EntityManager) {
		s.EntityManager.RemoveEntity(m.ID)
	}
	require.Len(t, s.dungeon.layout.Hidden, 1, "the key's hidden room")
	sender := &recordingSender{}
	s.sender = sender
	k := &keyRun{s: s, sender: sender, delvers: ids, hidden: s.dungeon.layout.Hidden[0]}
	doors := barriersOfKind(s, components.BarrierSecretDoor)
	require.Len(t, doors, 1, "one secret door")
	k.door = doors[0]
	start := s.dungeon.roomCentre(s.dungeon.layout.Roles.Start)
	for _, id := range ids {
		at := transformOf(t, delverEntity(t, s, id))
		at.X, at.Y = start.x, start.y
	}
	return k
}

// outward is the door's middle and the unit step from it away from its room,
// along the corridor.
func (k *keyRun) outward() (x, y, dx, dy float64) {
	d := k.s.dungeon
	size := d.layout.CellSize
	door := k.hidden.Barrier
	room := d.layout.Rooms[k.hidden.Room].Rect
	x = (float64(door.X) + float64(door.W)/2) * size
	y = (float64(door.Y) + float64(door.H)/2) * size
	if door.W == 1 { // a column: the corridor runs east-west
		dx = -1
		if room.X < door.X {
			dx = 1
		}
		return x, y, dx, 0
	}
	dy = -1
	if room.Y < door.Y {
		dy = 1
	}
	return x, y, 0, dy
}

// standOff stands the delver cells cells out from the door's middle cell
// centre, along the corridor.
func (k *keyRun) standOff(t *testing.T, delver uuid.UUID, cells float64) {
	t.Helper()
	x, y, dx, dy := k.outward()
	size := k.s.dungeon.layout.CellSize
	// the door's middle cell's centre, then out along the corridor
	mid := k.s.dungeon.cellCentre(k.s.dungeon.cellOf(point{x, y}))
	at := transformOf(t, delverEntity(t, k.s, delver))
	at.X, at.Y = mid.x+dx*cells*size, mid.y+dy*cells*size
}

// secretDoorsIn is the secret doors a frame lists.
func secretDoorsIn(state *types.ClientGameState) []*types.BarrierState {
	return slices.DeleteFunc(slices.Clone(state.Barriers), func(b *types.BarrierState) bool { return b.Kind != string(components.BarrierSecretDoor) })
}

// FS-5FZ4J §F R38, §I R46: an undetected secret door is in no state; on the
// tick a delver's body centre comes within 2 cells of it, it is in every
// member's barriers, shut, and stays there once they walk off.
func TestSecretDoor_DetectedWithinTwoCells_SentToEveryMember(t *testing.T) {
	k := newKeyRun(t, 7, 2)
	k.standOff(t, k.delvers[0], 3)
	tick(k.s)
	for _, id := range k.delvers {
		assert.Empty(t, secretDoorsIn(runState(t, k.s, id)), "3 cells off: in no state")
	}

	k.standOff(t, k.delvers[0], 2)
	tick(k.s)
	for _, id := range k.delvers {
		doors := secretDoorsIn(runState(t, k.s, id))
		require.Len(t, doors, 1, "2 cells off: in every member's state")
		assert.Equal(t, k.door.ID, doors[0].EntityID)
		assert.False(t, doors[0].Open)
		assert.Len(t, doors[0].Cells, k.hidden.Barrier.W*k.hidden.Barrier.H)
	}

	start := k.s.dungeon.roomCentre(k.s.dungeon.layout.Roles.Start)
	at := transformOf(t, delverEntity(t, k.s, k.delvers[0]))
	at.X, at.Y = start.x, start.y
	tick(k.s)
	assert.Len(t, secretDoorsIn(runState(t, k.s, k.delvers[1])), 1, "detected for the floor's life")
}

// An interact on an undetected secret door finds nothing to work: the client
// has no id for it (FS-5FZ4J §F R38). It is answered as a target not found,
// and refused quietly: play, not a fault, so never logged as an error.
func TestSecretDoor_UndetectedIsNoTarget_RefusedQuietly(t *testing.T) {
	k := newKeyRun(t, 7, 1)
	k.standOff(t, k.delvers[0], 1)
	err := k.s.handleInteract(k.delvers[0], k.door.ID)
	assert.ErrorIs(t, err, ErrEntityNotFound)
	assert.ErrorIs(t, err, ErrUndetected)
	assert.True(t, interactRefusedQuietly(err), "a quiet refusal")
	assert.False(t, delverEntity(t, k.s, k.delvers[0]).HasComponent(ecs.ComponentTypeTimedOpen))
	assert.False(t, interactRefusedQuietly(ErrEntityNotFound), "a target that is not there at all is a fault")
}

// searchTicks is a 2 s search's ticks at 30 a second: it completes on the
// tick after 60 have counted its time.
const searchTicks = 61

// search stands the delver one cell off the door, ticks once so they detect
// it, and starts their search.
func (k *keyRun) search(t *testing.T, delver uuid.UUID) {
	t.Helper()
	k.standOff(t, delver, 1)
	tick(k.s)
	require.NoError(t, k.s.handleInteract(delver, k.door.ID))
	oc, ok := delverEntity(t, k.s, delver).GetComponent(ecs.ComponentTypeTimedOpen)
	require.True(t, ok, "the reach starts a search")
	require.Equal(t, components.TimedTargetSearch, oc.(*components.TimedOpenComponent).TargetKind)
}

// FS-5FZ4J §F R38: a 2 s search opens the door, for good, on the tick its time
// has passed, and not a tick sooner; bodies and monster paths pass it from
// then; a reach for the open door is refused quietly, door_open.
func TestSecretDoor_SearchOpensItAfterTwoSeconds(t *testing.T) {
	k := newKeyRun(t, 7, 1)
	cells := doorCellsOf(k.door)
	for _, c := range cells {
		require.False(t, k.s.navGrid.Walkable(c.X, c.Y), "a shut secret door is rock to monster paths")
	}
	k.search(t, k.delvers[0])

	for n := 1; n < searchTicks; n++ {
		tick(k.s)
		require.False(t, barrierOpen(k.door), "tick %d: still searching", n)
	}
	tick(k.s)
	assert.True(t, barrierOpen(k.door), "the search opens the door")
	for _, c := range cells {
		assert.True(t, k.s.navGrid.Walkable(c.X, c.Y), "an open secret door is ground to monster paths")
	}
	assert.Len(t, secretDoorsIn(runState(t, k.s, k.delvers[0])), 1)
	assert.True(t, secretDoorsIn(runState(t, k.s, k.delvers[0]))[0].Open)

	require.NoError(t, k.s.handleInteract(k.delvers[0], k.door.ID))
	reply := lastReply(t, k.sender, k.delvers[0])
	assert.Equal(t, false, reply["success"])
	assert.Equal(t, RefusalDoorOpen, reply["reason"])
	assert.False(t, delverEntity(t, k.s, k.delvers[0]).HasComponent(ecs.ComponentTypeTimedOpen), "no search of an open door")
}

// doorCellsOf is a barrier's cells.
func doorCellsOf(e *ecs.Entity) []components.Cell {
	bc, _ := e.GetComponent(ecs.ComponentTypeBarrier)
	return bc.(*components.BarrierComponent).Cells
}

// FS-5FZ4J §F R38 (the FS-MQYEX rules): moving cancels a search, and so does
// a hit; the door stays shut.
func TestSecretDoor_SearchCancelledByMovingOrAHit(t *testing.T) {
	t.Run("moving", func(t *testing.T) {
		k := newKeyRun(t, 7, 1)
		k.search(t, k.delvers[0])
		tick(k.s)
		transformOf(t, delverEntity(t, k.s, k.delvers[0])).X += 4
		tick(k.s)
		assert.False(t, delverEntity(t, k.s, k.delvers[0]).HasComponent(ecs.ComponentTypeTimedOpen), "a move cancels it")
		ticks(k.s, searchTicks)
		assert.False(t, barrierOpen(k.door))
	})
	t.Run("a hit", func(t *testing.T) {
		k := newKeyRun(t, 7, 1)
		k.search(t, k.delvers[0])
		tick(k.s)
		delver := delverEntity(t, k.s, k.delvers[0])
		k.s.hitByTrap(k.door.ID, delver, TrapFactorDartWall)
		tick(k.s)
		assert.False(t, delver.HasComponent(ecs.ComponentTypeTimedOpen), "a hit cancels it")
		ticks(k.s, searchTicks)
		assert.False(t, barrierOpen(k.door))
	})
}

// FS-5FZ4J §F R38, Edge States: two delvers search one door, each on their own
// timer; the first to finish opens it for both, and the other's search ends
// on that tick.
func TestSecretDoor_TwoSearchers_TheFirstToFinishOpensIt(t *testing.T) {
	k := newKeyRun(t, 7, 2)
	// each stands before an end cell of the door, clear of the other's body
	cells := doorCellsOf(k.door)
	k.standBefore(t, k.delvers[0], cells[0])
	k.standBefore(t, k.delvers[1], cells[len(cells)-1])
	tick(k.s)
	require.NoError(t, k.s.handleInteract(k.delvers[0], k.door.ID))
	ticks(k.s, 10)
	require.NoError(t, k.s.handleInteract(k.delvers[1], k.door.ID))

	ticks(k.s, searchTicks-11)
	require.False(t, barrierOpen(k.door))
	for _, id := range k.delvers {
		require.True(t, delverEntity(t, k.s, id).HasComponent(ecs.ComponentTypeTimedOpen), "both still search")
	}
	tick(k.s)
	assert.True(t, barrierOpen(k.door), "the first search opens it")
	for _, id := range k.delvers {
		assert.False(t, delverEntity(t, k.s, id).HasComponent(ecs.ComponentTypeTimedOpen), "every search of it ends")
	}
}

// standBefore stands the delver one cell out from the door's cell c.
func (k *keyRun) standBefore(t *testing.T, delver uuid.UUID, c components.Cell) {
	t.Helper()
	_, _, dx, dy := k.outward()
	centre, size := k.s.dungeon.cellCentre(c), k.s.dungeon.layout.CellSize
	at := transformOf(t, delverEntity(t, k.s, delver))
	at.X, at.Y = centre.x+dx*size, centre.y+dy*size
}

// floorMapRegions is the regions of the floor map last published.
func floorMapRegions(t *testing.T, s *Session) []levelgen.Region {
	t.Helper()
	message, ok := s.FloorMapMessage()
	require.True(t, ok)
	return message.Payload["regions"].([]levelgen.Region)
}

// cellShown is whether a region of regions covers c.
func cellShown(regions []levelgen.Region, c components.Cell) bool {
	for _, r := range regions {
		for _, rect := range r.Cells {
			if c.X >= rect.X && c.X < rect.X+rect.W && c.Y >= rect.Y && c.Y < rect.Y+rect.H {
				return true
			}
		}
	}
	return false
}

// FS-5FZ4J §F R37, §I R50: until the door opens the floor map leaves out the
// hidden room's region and the door's cells, and every other cell is there
// once; on the tick the search opens it, the map is published with both and
// sent to every member.
func TestFloorMap_LeavesOutTheHiddenRoomUntilItsDoorOpens(t *testing.T) {
	k := newKeyRun(t, 7, 2)
	d := k.s.dungeon
	roomRegion := d.roomRegion(k.hidden.Room)

	before := floorMapRegions(t, k.s)
	assert.False(t, slices.ContainsFunc(before, func(r levelgen.Region) bool { return r.ID == roomRegion }), "no room region")
	for _, c := range doorCellsOf(k.door) {
		assert.False(t, cellShown(before, c), "door cell %v reads as rock", c)
	}
	assert.Equal(t, walkableCells(d)-roomCells(d, k.hidden.Room)-len(doorCellsOf(k.door)), shownCells(before),
		"every other walkable cell is shown, once")

	k.search(t, k.delvers[0])
	sentBefore := map[uuid.UUID]int{}
	for _, id := range k.delvers {
		sentBefore[id] = len(floorMapsSent(k.sender, id))
	}
	ticks(k.s, searchTicks)
	require.True(t, barrierOpen(k.door))

	after := floorMapRegions(t, k.s)
	assert.True(t, slices.ContainsFunc(after, func(r levelgen.Region) bool { return r.ID == roomRegion }), "the room is in")
	for _, c := range doorCellsOf(k.door) {
		assert.True(t, cellShown(after, c), "door cell %v is ground", c)
	}
	assert.Equal(t, d.layout.Regions, after, "the whole floor, as laid")
	for _, id := range k.delvers {
		assert.Len(t, floorMapsSent(k.sender, id), sentBefore[id]+1, "every member is sent the map again")
	}
}

// floorMapsSent is every floor_map the player was sent.
func floorMapsSent(sender *recordingSender, playerID uuid.UUID) []types.Message {
	return slices.DeleteFunc(sender.to(playerID), func(m types.Message) bool { return m.Action != string(constants.ActionFloorMap) })
}

func walkableCells(d *dungeonFloor) int {
	n := 0
	for _, r := range d.region {
		if r != 0 {
			n++
		}
	}
	return n
}

func roomCells(d *dungeonFloor, room int) int {
	r := d.layout.Rooms[room].Rect
	return r.W * r.H
}

// shownCells is how many cells regions cover, counting a cell twice if two
// rects cover it.
func shownCells(regions []levelgen.Region) int {
	n := 0
	for _, r := range regions {
		for _, rect := range r.Cells {
			n += rect.W * rect.H
		}
	}
	return n
}

// cutCells keeps a rect it does not touch and covers what is left of one it
// does exactly once.
func TestCutCells_CoversWhatIsLeftOnce(t *testing.T) {
	rects := []levelgen.CellRect{{X: 0, Y: 0, W: 4, H: 2}, {X: 10, Y: 10, W: 2, H: 2}}
	out := cutCells(rects, []levelgen.Cell{{X: 1, Y: 0}, {X: 1, Y: 1}})
	assert.Contains(t, out, levelgen.CellRect{X: 10, Y: 10, W: 2, H: 2})
	assert.ElementsMatch(t, []levelgen.CellRect{
		{X: 0, Y: 0, W: 1, H: 1}, {X: 2, Y: 0, W: 2, H: 1},
		{X: 0, Y: 1, W: 1, H: 1}, {X: 2, Y: 1, W: 2, H: 1},
		{X: 10, Y: 10, W: 2, H: 2},
	}, out)
}

// stairKeyOf is the floor's stair key piece, if it lies.
func stairKeyOf(s *Session) (*ecs.Entity, bool) {
	for _, e := range s.EntityManager.GetAllEntities() {
		if pc, ok := e.GetComponent(ecs.ComponentTypeSealPiece); ok && pc.(*components.SealPieceComponent).Kind == components.SealPieceStairKey {
			return e, true
		}
	}
	return nil, false
}

// FS-5FZ4J §E R32, §F R37, R39: the stair key lies in the hidden room, sent
// in no state while its door is shut and listed once it opens.
func TestHiddenKey_KeyLiesInTheHiddenRoom_SentOnceItOpens(t *testing.T) {
	k := newKeyRun(t, 7, 1)
	key, ok := stairKeyOf(k.s)
	require.True(t, ok)
	at := transformOf(t, key)
	assert.Equal(t, k.hidden.Room, k.s.dungeon.roomAt(at.X, at.Y), "in the key's hidden room")

	keyListed := func() bool {
		return slices.ContainsFunc(runState(t, k.s, k.delvers[0]).SealPieces, func(p *types.SealPieceState) bool {
			return p.Kind == string(components.SealPieceStairKey)
		})
	}
	assert.False(t, keyListed(), "nothing on the wire names the room")
	k.search(t, k.delvers[0])
	ticks(k.s, searchTicks)
	assert.True(t, keyListed(), "listed once its room is open")
}

// FS-5FZ4J §E R32, §B R13: taking the key removes it, sets key_carried and
// wakes an ambush; the shut gate interacted with the key carried breaks the
// seal and opens.
func TestHiddenKey_TakeTheKeyThenTheGate(t *testing.T) {
	k := newKeyRun(t, 7, 1)
	k.search(t, k.delvers[0])
	ticks(k.s, searchTicks)
	key, _ := stairKeyOf(k.s)
	keyAt := transformOf(t, key)
	delver := transformOf(t, delverEntity(t, k.s, k.delvers[0]))
	delver.X, delver.Y = keyAt.X+20, keyAt.Y

	require.NoError(t, k.s.handleInteract(k.delvers[0], key.ID))

	_, lies := stairKeyOf(k.s)
	assert.False(t, lies, "the key leaves the world")
	state := runState(t, k.s, k.delvers[0])
	require.NotNil(t, state.Seal)
	assert.True(t, state.Seal.KeyCarried, "the party carries the key")
	assert.False(t, state.Seal.Broken)
	assert.NotEmpty(t, monstersInWorld(k.s.EntityManager), "taking the key wakes an ambush")

	delver.X, delver.Y, _, _ = gateApproach(k.s)
	require.NoError(t, k.s.handleInteract(k.delvers[0], gateOf(t, k.s).ID))
	assert.True(t, runState(t, k.s, k.delvers[0]).Seal.Broken, "the key breaks the seal")
	assert.True(t, barrierOpen(gateOf(t, k.s)), "and opens the gate")
}

// FS-5FZ4J §B R13: without the key the gate is refused gate_sealed.
func TestHiddenKey_GateWithoutTheKey_RefusesGateSealed(t *testing.T) {
	k := newKeyRun(t, 7, 1)
	delver := transformOf(t, delverEntity(t, k.s, k.delvers[0]))
	delver.X, delver.Y, _, _ = gateApproach(k.s)
	require.NoError(t, k.s.handleInteract(k.delvers[0], gateOf(t, k.s).ID))
	assert.Equal(t, RefusalGateSealed, lastReply(t, k.sender, k.delvers[0])["reason"])
	assert.False(t, barrierOpen(gateOf(t, k.s)))
}

// FS-5FZ4J §A R4, §F R36: a shut secret door blocks a delver walking at it
// along the corridor.
func TestSecretDoor_ShutBlocksABody(t *testing.T) {
	k := newKeyRun(t, 7, 1)
	_, _, dx, dy := k.outward()
	k.standOff(t, k.delvers[0], 1)
	delver := delverEntity(t, k.s, k.delvers[0])
	vc, _ := delver.GetComponent(ecs.ComponentTypeVelocity)
	vc.(*components.VelocityComponent).VX, vc.(*components.VelocityComponent).VY = -dx, -dy
	ticks(k.s, 60)
	at := transformOf(t, delver)
	assert.NotEqual(t, k.hidden.Room, k.s.dungeon.roomAt(at.X, at.Y), "the shut door keeps the body out")
}

// FS-5FZ4J §F R35: no hidden room on floor 1, 0-1 on floors 2-5, 0-2 on
// floors 6+, each count drawn; the Hidden Key adds its own; a use asked for
// adds one more.
func TestHiddenRoomsFor_CountsPerBand(t *testing.T) {
	counts := func(depth int, seals []components.SealKind, also ...hiddenUse) map[int]int {
		seen := map[int]int{}
		for seed := uint64(1); seed <= 400; seed++ {
			uses := hiddenRoomsFor(seededSpawns(seed), depth, seals, also...)
			seen[len(uses)]++
			if slices.Contains(seals, components.SealHiddenKey) {
				assert.Equal(t, 1, countOf(uses, hiddenStairKey), "one key room")
			}
			for _, use := range also {
				assert.Contains(t, uses, use)
			}
		}
		return seen
	}
	lever := []components.SealKind{components.SealLeverOrder}
	key := []components.SealKind{components.SealHiddenKey}

	assert.Equal(t, map[int]int{0: 400}, counts(1, lever), "floor 1: none")
	assert.Equal(t, map[int]int{1: 400}, counts(1, key), "floor 1 with the key: its room")
	for _, depth := range []int{2, 5} {
		got := counts(depth, lever)
		assert.ElementsMatch(t, []int{0, 1}, countsOf(got), "floor %d: 0-1", depth)
	}
	for _, depth := range []int{6, 10} {
		got := counts(depth, lever)
		assert.ElementsMatch(t, []int{0, 1, 2}, countsOf(got), "floor %d: 0-2", depth)
		got = counts(depth, key, hiddenChest)
		assert.ElementsMatch(t, []int{2, 3, 4}, countsOf(got), "floor %d with the key and one more: 2-4", depth)
	}
}

// R39: a rolled room is a better chest about 60% of the time, else a shrine.
func TestHiddenRoomsFor_ChestOrShrineShare(t *testing.T) {
	chests, rolled := 0, 0
	for seed := uint64(1); seed <= 4000; seed++ {
		for _, use := range hiddenRoomsFor(seededSpawns(seed), 10, nil) {
			rolled++
			if use == hiddenChest {
				chests++
			}
		}
	}
	require.NotZero(t, rolled)
	assert.InDelta(t, HiddenChestShare, float64(chests)/float64(rolled), 0.03)
}

func countOf[T comparable](xs []T, x T) int {
	n := 0
	for _, y := range xs {
		if y == x {
			n++
		}
	}
	return n
}

func countsOf(m map[int]int) []int {
	out := make([]int, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

/**
* FS-5FZ4J §F R35-R39 over a seed sweep of whole climbs: every floor holds the
* hidden rooms its band allows, each behind a shut, undetected secret door on
* its layout's door cells; each holds a better chest or a lore shrine (or the
* key) and nothing else: no monster, no other container; what it holds is
* concealed.
**/
func TestHiddenRooms_PerFloor_DoorsAndContents(t *testing.T) {
	seen := map[int]bool{}
	for seed := uint64(1); seed <= 12; seed++ {
		s, _ := dungeonRun(t, seed, 1, 0, forcedSeal(components.SealLeverOrder))
		for depth := firstFloor; depth <= testSpireHeight; depth++ {
			d := s.dungeon
			require.NotNil(t, d, "seed %d floor %d", seed, depth)
			n := len(d.layout.Hidden)
			// the hallowed altar's room, when it stands hidden here, on top
			assert.LessOrEqual(t, n, hiddenRoomMax(depth)+len(s.hiddenAltarUses(depth)), "seed %d floor %d", seed, depth)
			seen[n] = true
			doors := barriersOfKind(s, components.BarrierSecretDoor)
			require.Len(t, doors, n, "seed %d floor %d: a door per hidden room", seed, depth)
			for _, h := range d.layout.Hidden {
				assertHiddenRoomHoldsOnlyItsOwn(t, s, h, seed, depth)
			}
			for _, door := range doors {
				assert.False(t, barrierOpen(door), "seed %d floor %d: shut", seed, depth)
			}
			if depth < testSpireHeight {
				require.NoError(t, s.regenerateFloor())
			}
		}
	}
	assert.True(t, seen[1], "some floor has a hidden room")
}

// assertHiddenRoomHoldsOnlyItsOwn checks a hidden room holds exactly one of a
// better chest, a shrine, the stair key or the hallowed altar, concealed, and
// no monster.
func assertHiddenRoomHoldsOnlyItsOwn(t *testing.T, s *Session, h levelgen.BarredRoom, seed uint64, depth int) {
	t.Helper()
	held := 0
	for _, e := range s.EntityManager.GetAllEntities() {
		tc, ok := e.GetComponent(ecs.ComponentTypeTransform)
		if !ok || e.HasComponent(ecs.ComponentTypePlayer) {
			continue
		}
		at := tc.(*components.TransformComponent)
		if s.dungeon.roomAt(at.X, at.Y) != h.Room {
			continue
		}
		assert.False(t, e.HasComponent(ecs.ComponentTypeEnemy), "seed %d floor %d: no monster in a hidden room", seed, depth)
		assert.True(t, e.HasComponent(ecs.ComponentTypeConcealed), "seed %d floor %d: concealed", seed, depth)
		if cc, ok := e.GetComponent(ecs.ComponentTypeContainer); ok {
			assert.True(t, cc.(*components.ContainerComponent).Better, "seed %d floor %d: only a better chest", seed, depth)
			assert.Equal(t, components.ContainerKindChest, cc.(*components.ContainerComponent).Kind)
			assert.False(t, e.HasComponent(ecs.ComponentTypeGuarded), "no guard")
			held++
			continue
		}
		if e.HasComponent(ecs.ComponentTypeHallowedAltar) {
			held++
			continue
		}
		if lc, ok := e.GetComponent(ecs.ComponentTypeLorePiece); ok {
			assert.Equal(t, components.LoreShrine, lc.(*components.LorePieceComponent).Kind)
			assert.False(t, e.HasComponent(ecs.ComponentTypeSealPiece), "a shrine is no seal piece")
			held++
			continue
		}
		pc, ok := e.GetComponent(ecs.ComponentTypeSealPiece)
		require.True(t, ok, "seed %d floor %d: a hidden room holds a chest, a shrine, the key or the hallowed altar", seed, depth)
		assert.Equal(t, components.SealPieceStairKey, pc.(*components.SealPieceComponent).Kind)
		held++
	}
	assert.Equal(t, 1, held, "seed %d floor %d: one thing in the hidden room", seed, depth)
}

// FS-5FZ4J §F R39, §I R49: a lore shrine answers an interact with reason
// shrine and wakes nothing.
func TestShrine_RepliesShrine(t *testing.T) {
	s, player, sender := sealedRun(t, 7)
	at := transformOf(t, delverEntity(t, s, player))
	shrine := CreateLorePieceEntity(s.EntityManager, LorePieceConfig{Kind: components.LoreShrine, X: at.X + 20, Y: at.Y})
	before := len(monstersInWorld(s.EntityManager))

	require.NoError(t, s.handleInteract(player, shrine.ID))

	reply := lastReply(t, sender, player)
	assert.Equal(t, true, reply["success"])
	assert.Equal(t, ReasonShrine, reply["reason"])
	assert.Len(t, monstersInWorld(s.EntityManager), before, "it wakes nothing")
}

// loreOfKind is the floor's lore pieces of kind.
func loreOfKind(s *Session, kind components.LoreKind) []*ecs.Entity {
	var out []*ecs.Entity
	for _, e := range s.EntityManager.GetAllEntities() {
		if lc, ok := e.GetComponent(ecs.ComponentTypeLorePiece); ok && lc.(*components.LorePieceComponent).Kind == kind {
			out = append(out, e)
		}
	}
	return out
}

// loreOf is a lore piece entity's lore piece.
func loreOf(e *ecs.Entity) *components.LorePieceComponent {
	lc, _ := e.GetComponent(ecs.ComponentTypeLorePiece)
	return lc.(*components.LorePieceComponent)
}

// capturingSerializer records the entities each broadcast serialized.
type capturingSerializer struct {
	mockStateSerializer
	sent [][]*ecs.Entity
}

func (c *capturingSerializer) SerializeBackendState(_ context.Context, _ uuid.UUID, _ types.WorldType, entities []*ecs.Entity) (*types.BackendGameState, error) {
	c.sent = append(c.sent, entities)
	return nil, nil
}

// A tick's broadcast is of the world as the tick left it: the stair key taken
// on the tick, and so gone from the world, is not sent once more (FS-5FZ4J
// §E R32, §I R46); nothing created on the tick waits a tick to be sent.
func TestTick_EntityRemovedMidTick_IsNotBroadcast(t *testing.T) {
	k := newKeyRun(t, 7, 1)
	k.search(t, k.delvers[0])
	ticks(k.s, searchTicks)
	key, _ := stairKeyOf(k.s)
	keyAt := transformOf(t, key)
	delver := transformOf(t, delverEntity(t, k.s, k.delvers[0]))
	delver.X, delver.Y = keyAt.X+20, keyAt.Y
	capture := &capturingSerializer{}
	k.s.stateSerializer = capture

	k.s.queueIntent(func() { require.NoError(t, k.s.handleInteract(k.delvers[0], key.ID)) })
	_, err := k.s.advanceTick(1.0 / float64(constants.GameFrameRate))
	require.NoError(t, err)

	require.Len(t, capture.sent, 1, "one broadcast a tick")
	for _, e := range capture.sent[0] {
		assert.NotEqual(t, key.ID, e.ID, "the taken key is not broadcast")
	}
	woken := monstersInWorld(k.s.EntityManager)
	require.NotEmpty(t, woken, "the taking woke an ambush")
	assert.Contains(t, capture.sent[0], woken[0], "created on the tick, sent on the tick")
}
