package levelgen

import (
	"errors"
	"math/rand/v2"
	"slices"
	"sort"
	"testing"
)

func TestWalkDistances_FollowsTheWalkableCells(t *testing.T) {
	// A U: the straight line from S to E is rock, so the walk goes round.
	cols, open := cellMask(
		".....",
		".###.",
		".#.#.",
	)
	rows := len(open) / cols
	from := 2*cols + 0 // bottom-left
	to := 2*cols + 4   // bottom-right

	dist := walkDistances(cols, rows, open, from)

	if dist[to] != 8 {
		t.Fatalf("distance to the far leg = %d, want 8", dist[to])
	}
	if island := 2*cols + 2; dist[island] != -1 {
		t.Fatalf("distance to the walled-off cell = %d, want -1", dist[island])
	}
}

// rowOfRooms lays n rooms left to right along one corridor row. Room 0 is the
// only one wide enough to start in, so distances grow with the room index.
func rowOfRooms(n int) (DungeonParams, []CellRect, []bool) {
	p := DungeonFloor1Params
	p.Cols, p.Rows = 2+6*n, 7
	rooms := make([]CellRect, n)
	open := make([]bool, p.Cols*p.Rows)
	for i := range rooms {
		rooms[i] = CellRect{X: 1 + 6*i, Y: 1, W: 4, H: 4}
		if i == 0 {
			rooms[i].W, rooms[i].H = 5, 5
		}
		r := rooms[i]
		for y := r.Y; y < r.Y+r.H; y++ {
			for x := r.X; x < r.X+r.W; x++ {
				open[y*p.Cols+x] = true
			}
		}
	}
	for x := 1; x < p.Cols-1; x++ {
		open[3*p.Cols+x] = true
	}
	return p, rooms, open
}

func TestAssignRoles_FarRoomsAndTreasure(t *testing.T) {
	p, rooms, open := rowOfRooms(12)

	for seed := uint64(0); seed < 50; seed++ {
		roles, dist, err := assignRoles(p, rand.New(rand.NewPCG(seed, seed)), rooms, open)
		if err != nil {
			t.Fatalf("seed %d: assignRoles() error = %v", seed, err)
		}

		if roles.Start != 0 {
			t.Fatalf("seed %d: start = %d, want room 0, the only 5x5", seed, roles.Start)
		}
		// Rooms 1..11 by distance: the median (upper, index 5 of 11) is room 6.
		for _, r := range []int{roles.Switch, roles.EscapeDoor, roles.Stairs} {
			if dist[r] < dist[6] {
				t.Fatalf("seed %d: role room %d at distance %d, below the median %d", seed, r, dist[r], dist[6])
			}
		}
		used := []int{roles.Start, roles.Switch, roles.EscapeDoor, roles.Stairs}
		used = append(used, roles.Treasure...)
		sorted := slices.Clone(used)
		sort.Ints(sorted)
		if len(slices.Compact(sorted)) != len(used) {
			t.Fatalf("seed %d: roles share a room: %+v", seed, roles)
		}
		if n := len(roles.Treasure); n < 3 || n > 4 {
			t.Fatalf("seed %d: %d treasure rooms, want 3..4", seed, n)
		}
		// Six far rooms, three taken by the fixed roles: the farther half
		// first means three treasure rooms are all far.
		far := 0
		for _, r := range roles.Treasure {
			if dist[r] >= dist[6] {
				far++
			}
		}
		if far < 3 {
			t.Fatalf("seed %d: %d of the treasure rooms are far, want the 3 far rooms left first: %+v", seed, far, roles)
		}
	}
}

func TestAssignRoles_NoRoomBigEnoughToStart_ReturnsInvalid(t *testing.T) {
	p, rooms, open := rowOfRooms(12)
	p.StartMin = 6

	_, _, err := assignRoles(p, rand.New(rand.NewPCG(1, 1)), rooms, open)

	if !errors.Is(err, errInvalidLayout) {
		t.Fatalf("assignRoles() error = %v, want errInvalidLayout", err)
	}
}

func TestAssignRoles_TooFewFarRooms_ReturnsInvalid(t *testing.T) {
	// Start plus four: the far half of four is two rooms, short of three roles.
	p, rooms, open := rowOfRooms(5)
	p.TreasureRooms = IntRange{Min: 0, Max: 0}

	_, _, err := assignRoles(p, rand.New(rand.NewPCG(1, 1)), rooms, open)

	if !errors.Is(err, errInvalidLayout) {
		t.Fatalf("assignRoles() error = %v, want errInvalidLayout", err)
	}
}

func TestAssignRoles_UnreachableRoom_ReturnsInvalid(t *testing.T) {
	p, rooms, open := rowOfRooms(12)
	open[3*p.Cols+6] = false // cut the corridor cell between rooms 0 and 1

	_, _, err := assignRoles(p, rand.New(rand.NewPCG(1, 1)), rooms, open)

	if !errors.Is(err, errInvalidLayout) {
		t.Fatalf("assignRoles() error = %v, want errInvalidLayout", err)
	}
}

// FS-KE075 §B.12 over generated floors, with the median taken as the mean of
// the two middle values for an even count, so the check does not lean on the
// generator's own (upper) median.
func TestGenerateDungeon_Roles_FarDistinctAndTreasure(t *testing.T) {
	for seed := uint64(0); seed < 200; seed++ {
		l := generateDungeon(t, seed)
		r := l.Roles
		start := l.Rooms[r.Start].Rect
		if start.W < 5 || start.H < 5 {
			t.Fatalf("seed %d: start room %dx%d, want at least 5x5", seed, start.W, start.H)
		}
		var ds []int
		for i, room := range l.Rooms {
			if i != r.Start {
				ds = append(ds, room.Distance)
			}
		}
		sort.Ints(ds)
		median := float64(ds[len(ds)/2])
		if len(ds)%2 == 0 {
			median = float64(ds[len(ds)/2-1]+ds[len(ds)/2]) / 2
		}
		fixed := []int{r.Switch, r.EscapeDoor, r.Stairs}
		for _, room := range fixed {
			if float64(l.Rooms[room].Distance) < median {
				t.Fatalf("seed %d: role room %d at %d cells, median %.1f", seed, room, l.Rooms[room].Distance, median)
			}
		}
		all := append(append([]int{r.Start}, fixed...), r.Treasure...)
		sorted := slices.Clone(all)
		sort.Ints(sorted)
		if len(slices.Compact(sorted)) != len(all) {
			t.Fatalf("seed %d: roles share a room: %+v", seed, r)
		}
		if n := len(r.Treasure); n < 3 || n > 4 {
			t.Fatalf("seed %d: %d treasure rooms, want 3..4", seed, n)
		}
	}
}
