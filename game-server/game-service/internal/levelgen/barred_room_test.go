package levelgen

import (
	"fmt"
	"math"
	"slices"
	"testing"
)

// The sealed-floor checks below re-derive FS-5FZ4J §A R2-R7 and §F R36 from a
// layout with the test's own walk (walkFrom), not the generator's.

// sealedFloor is one parameter set the property test sweeps: floor 1 has no
// escape door, floors 2+ do, with 0..2 hidden rooms asked for.
type sealedFloor struct {
	name string
	p    DungeonParams
}

func sealedFloors() []sealedFloor {
	floor := func(escape bool, hidden int) DungeonParams {
		p := DungeonFloor1Params
		p.EscapeDoor, p.HiddenRooms = escape, hidden
		return p
	}
	return []sealedFloor{
		{"floor 1", floor(false, 0)},
		{"floor 2+, no hidden room", floor(true, 0)},
		{"floor 2+, one hidden room", floor(true, 1)},
		{"floor 2+, two hidden rooms", floor(true, 2)},
	}
}

// inRect reports whether cell c of a grid cols wide is in r.
func inRect(cols int, r CellRect, c int) bool {
	x, y := c%cols, c/cols
	return x >= r.X && x < r.X+r.W && y >= r.Y && y < r.Y+r.H
}

// cutOff reports whether, with every barred room's barrier shut, the walk from
// the start reaches no cell of a barred room and every other walkable cell.
func cutOff(l DungeonLayout, open []bool, barred []BarredRoom) error {
	walk := slices.Clone(open)
	for _, b := range barred {
		for c := range walk {
			if inRect(l.Cols, b.Barrier, c) {
				walk[c] = false
			}
		}
	}
	dist := walkFrom(l, walk, roomCentre(l, l.Roles.Start))
	for c := range open {
		behind := false
		for _, b := range barred {
			behind = behind || inRect(l.Cols, l.Rooms[b.Room].Rect, c)
		}
		switch {
		case behind && dist[c] >= 0:
			return fmt.Errorf("cell (%d, %d) behind a barrier is reachable", c%l.Cols, c/l.Cols)
		case walk[c] && !behind && dist[c] < 0:
			return fmt.Errorf("cell (%d, %d) is cut off by a barrier not its own", c%l.Cols, c/l.Cols)
		}
	}
	return nil
}

// barrierShaped checks R4/R36's barrier: one cell thick, as long as the room's
// one corridor is wide, every cell a corridor cell 4-adjacent to the room, and
// every corridor cell 4-adjacent to the room in it.
func barrierShaped(l DungeonLayout, b BarredRoom) error {
	var edges []Edge
	for _, e := range l.Edges {
		if e.A == b.Room || e.B == b.Room {
			edges = append(edges, e)
		}
	}
	if len(edges) != 1 {
		return fmt.Errorf("room %d is joined by %d corridors, want 1", b.Room, len(edges))
	}
	r := b.Barrier
	if (r.W != 1 && r.H != 1) || r.W*r.H != edges[0].Width {
		return fmt.Errorf("room %d barrier %+v is not one cell thick across a corridor %d wide", b.Room, r, edges[0].Width)
	}
	grid := l.Grid()
	room := l.Rooms[b.Room].Rect
	for c := range grid {
		if grid[c] <= len(l.Rooms) || grid[c] == 0 {
			continue // rock or a room
		}
		x, y := c%l.Cols, c/l.Cols
		touches := false
		for _, d := range [4][2]int{{0, -1}, {1, 0}, {0, 1}, {-1, 0}} {
			touches = touches || inRect(l.Cols, room, (y+d[1])*l.Cols+x+d[0])
		}
		if touches != inRect(l.Cols, r, c) {
			return fmt.Errorf("corridor cell (%d, %d) touches room %d: %v, in its barrier: %v", x, y, b.Room, touches, !touches)
		}
	}
	for c := range grid {
		if inRect(l.Cols, r, c) && grid[c] <= len(l.Rooms) {
			return fmt.Errorf("room %d barrier cell (%d, %d) is not a corridor cell", b.Room, c%l.Cols, c/l.Cols)
		}
	}
	held := 0
	for _, seg := range b.BarrierSegments {
		for _, cell := range seg.Cells {
			if grid[cell.Y*l.Cols+cell.X] != seg.Region || !inRect(l.Cols, r, cell.Y*l.Cols+cell.X) {
				return fmt.Errorf("room %d barrier cell %+v is not in segment %d", b.Room, cell, seg.Region)
			}
			held++
		}
	}
	if held != r.W*r.H {
		return fmt.Errorf("room %d barrier segments hold %d cells, want %d", b.Room, held, r.W*r.H)
	}
	return nil
}

// isBarrable is whether room could be a barred room: one corridor joins it,
// the corridor cells 4-adjacent to it lie in one row or column, unbroken and as
// many as the corridor is wide (a corridor across the doorway, not one running
// along the wall), and shutting them cuts it off and nothing else.
func isBarrable(l DungeonLayout, open []bool, room int) bool {
	if room == l.Roles.Start {
		return false
	}
	var joined []Edge
	for _, e := range l.Edges {
		if e.A == room || e.B == room {
			joined = append(joined, e)
		}
	}
	if len(joined) != 1 {
		return false
	}
	r := l.Rooms[room].Rect
	walk := slices.Clone(open)
	grid := l.Grid()
	var xs, ys []int
	for c := range walk {
		if grid[c] <= len(l.Rooms) {
			continue
		}
		x, y := c%l.Cols, c/l.Cols
		for _, d := range [4][2]int{{0, -1}, {1, 0}, {0, 1}, {-1, 0}} {
			if inRect(l.Cols, r, (y+d[1])*l.Cols+x+d[0]) && walk[c] {
				walk[c] = false
				xs, ys = append(xs, x), append(ys, y)
			}
		}
	}
	if len(xs) != joined[0].Width {
		return false
	}
	w := slices.Max(xs) - slices.Min(xs) + 1
	h := slices.Max(ys) - slices.Min(ys) + 1
	if (w != 1 && h != 1) || w*h != len(xs) {
		return false
	}
	dist := walkFrom(l, walk, roomCentre(l, l.Roles.Start))
	for c := range open {
		in := inRect(l.Cols, r, c)
		if (in && dist[c] >= 0) || (!in && walk[c] && dist[c] < 0) {
			return false
		}
	}
	return true
}

// checkSealed asserts FS-5FZ4J §A R2-R7 and §F R36 on one layout for p.
func checkSealed(p DungeonParams, l DungeonLayout) error {
	open := openMask(l)
	r := l.Roles

	// R2: the stairs room is barred, the farthest barrable room.
	if l.Stairs.Room != r.Stairs {
		return fmt.Errorf("stairs barred room %d, stairs role %d", l.Stairs.Room, r.Stairs)
	}
	farthest := -1
	for i := range l.Rooms {
		if isBarrable(l, open, i) && (farthest < 0 || l.Rooms[i].Distance > l.Rooms[farthest].Distance) {
			farthest = i
		}
	}
	if farthest < 0 || l.Rooms[r.Stairs].Distance != l.Rooms[farthest].Distance {
		return fmt.Errorf("stairs room %d is not the farthest barrable room %d", r.Stairs, farthest)
	}
	// R4 and R36: each barrier's shape; R36: the hidden count, each barrable.
	if len(l.Hidden) != p.HiddenRooms {
		return fmt.Errorf("%d hidden rooms, asked for %d", len(l.Hidden), p.HiddenRooms)
	}
	barred := append([]BarredRoom{l.Stairs}, l.Hidden...)
	for _, b := range barred {
		if err := barrierShaped(l, b); err != nil {
			return err
		}
		if !isBarrable(l, open, b.Room) {
			return fmt.Errorf("barred room %d is not barrable", b.Room)
		}
	}
	// R2, R8, R36: every barrier shut, the barred rooms are cut off and the rest
	// (the escape door's and switch's rooms among it) is reachable.
	if err := cutOff(l, open, barred); err != nil {
		return err
	}
	// R3: no extra connection joins a barred room, at the 0.1 share.
	extra := 0
	for _, e := range l.Edges {
		if !e.Extra {
			continue
		}
		extra++
		for _, b := range barred {
			if e.A == b.Room || e.B == b.Room {
				return fmt.Errorf("extra edge %d-%d joins barred room %d", e.A, e.B, b.Room)
			}
		}
	}
	if want := int(math.Round(0.1 * float64(len(l.Rooms)))); extra != want {
		return fmt.Errorf("%d extra edges for %d rooms, want %d", extra, len(l.Rooms), want)
	}
	// R5: no role but the stairs in the stairs room; no role in a hidden room.
	others := append([]int{r.Start, r.Switch, r.EscapeDoor}, r.Treasure...)
	for _, b := range barred {
		if slices.Contains(others, b.Room) {
			return fmt.Errorf("barred room %d holds another role: %+v", b.Room, r)
		}
		for _, h := range l.Hidden {
			if h.Room == b.Room && b.Room == r.Stairs {
				return fmt.Errorf("room %d is both the stairs and hidden", b.Room)
			}
		}
	}
	// R6 and R7.
	if !p.EscapeDoor {
		if r.Switch != noRoom || r.EscapeDoor != noRoom {
			return fmt.Errorf("floor 1 has switch %d and escape door %d, want none", r.Switch, r.EscapeDoor)
		}
		return nil
	}
	return escapeFarFromStairs(l, barred)
}

// escapeFarFromStairs asserts R7: the escape door's room is, of the rooms at
// or past the median distance that are neither the start nor barred, the one
// farthest by walk from the stairs room; the switch is another such room.
func escapeFarFromStairs(l DungeonLayout, barred []BarredRoom) error {
	r := l.Roles
	var ds []int
	for i, room := range l.Rooms {
		if i != r.Start {
			ds = append(ds, room.Distance)
		}
	}
	slices.Sort(ds)
	median := ds[len(ds)/2]
	isBarred := func(i int) bool {
		return slices.ContainsFunc(barred, func(b BarredRoom) bool { return b.Room == i })
	}
	fromStairs := walkFrom(l, openMask(l), roomCentre(l, r.Stairs))
	best := -1
	for i, room := range l.Rooms {
		if i == r.Start || isBarred(i) || room.Distance < median {
			continue
		}
		if best < 0 || fromStairs[roomCentre(l, i)] > fromStairs[roomCentre(l, best)] {
			best = i
		}
	}
	if r.EscapeDoor < 0 || fromStairs[roomCentre(l, r.EscapeDoor)] != fromStairs[roomCentre(l, best)] {
		return fmt.Errorf("escape door room %d is not the far room farthest from the stairs (%d)", r.EscapeDoor, best)
	}
	if r.Switch < 0 || r.Switch == r.EscapeDoor || r.Switch == r.Start || isBarred(r.Switch) ||
		l.Rooms[r.Switch].Distance < median {
		return fmt.Errorf("switch room %d is not another far room", r.Switch)
	}
	return nil
}

func TestChasmCapable_DepthFromTheDoorwayWall(t *testing.T) {
	tests := []struct {
		name  string
		room  CellRect
		door  CellRect
		chasm bool
	}{
		{"6 deep from a south door, 5 wide", CellRect{W: 5, H: 6}, CellRect{W: 2, H: 1}, true},
		{"6 deep from an east door, 5 wide", CellRect{W: 6, H: 5}, CellRect{W: 1, H: 3}, true},
		{"5 deep from a south door", CellRect{W: 10, H: 5}, CellRect{W: 3, H: 1}, false},
		{"4 wide along a west door", CellRect{W: 10, H: 4}, CellRect{W: 1, H: 2}, false},
		{"deep from a west door, too narrow", CellRect{W: 8, H: 4}, CellRect{W: 1, H: 3}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := chasmCapable(tt.room, tt.door); got != tt.chasm {
				t.Fatalf("chasmCapable(%+v, %+v) = %v, want %v", tt.room, tt.door, got, tt.chasm)
			}
		})
	}
}

// FS-5FZ4J §E R33: the layout says whether its stairs room takes a Chasm, and
// how often it does is logged for the seal draw (slice 6).
func TestGenerateDungeon_ChasmCapable_SaysWhetherTheStairsRoomFits(t *testing.T) {
	const seeds = 1000
	capable := 0
	for seed := uint64(0); seed < seeds; seed++ {
		l := generateDungeon(t, seed)
		room, gate := l.Rooms[l.Stairs.Room].Rect, l.Stairs.Barrier
		// a gate in a column stands on a west or east wall: depth runs east-west
		deep, wide := room.H, room.W
		if gate.W == 1 && gate.H > 1 {
			deep, wide = room.W, room.H
		}
		if want := deep >= 6 && wide >= 5; l.ChasmCapable != want {
			t.Fatalf("seed %d: chasm capable %v for a %dx%d stairs room gated at %+v", seed, l.ChasmCapable, room.W, room.H, gate)
		}
		if l.ChasmCapable {
			capable++
		}
	}
	t.Logf("%d of %d seeds have a Chasm-capable stairs room (%.1f%%)", capable, seeds, 100*float64(capable)/seeds)
}
