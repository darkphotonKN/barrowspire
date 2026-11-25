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

// barredAt is a barred room for room i of a row of rooms: the corridor cell
// west of its doorway.
func barredAt(rooms []CellRect, i int) BarredRoom {
	return BarredRoom{Room: i, Barrier: CellRect{X: rooms[i].X - 1, Y: 3, W: 1, H: 1}}
}

func TestAssignRoles_FarRoomsAndTreasure(t *testing.T) {
	p, rooms, open := rowOfRooms(12)
	barrable := []BarredRoom{barredAt(rooms, 9), barredAt(rooms, 11)}

	for _, escape := range []bool{false, true} {
		p.EscapeDoor = escape
		for seed := uint64(0); seed < 50; seed++ {
			got, err := assignRoles(p, rand.New(rand.NewPCG(seed, seed)), rooms, open, 0, barrable)
			if err != nil {
				t.Fatalf("escape %v seed %d: assignRoles() error = %v", escape, seed, err)
			}
			roles, dist := got.Roles, got.dist

			if roles.Stairs != 11 || got.stairs.Room != 11 {
				t.Fatalf("escape %v seed %d: stairs = %d, want room 11, the farthest dead end", escape, seed, roles.Stairs)
			}
			used := []int{roles.Start, roles.Stairs}
			if escape {
				// Rooms 1..11 by distance: the median (upper, index 5 of 11) is
				// room 6, and room 6 is the free far room farthest from room 11.
				if roles.EscapeDoor != 6 {
					t.Fatalf("seed %d: escape door = %d, want room 6, the far room farthest from the stairs", seed, roles.EscapeDoor)
				}
				if roles.Switch < 7 || roles.Switch > 10 {
					t.Fatalf("seed %d: switch = %d, want a far room 7..10", seed, roles.Switch)
				}
				used = append(used, roles.Switch, roles.EscapeDoor)
			} else if roles.Switch != noRoom || roles.EscapeDoor != noRoom {
				t.Fatalf("seed %d: floor 1 has switch %d and escape door %d, want none", seed, roles.Switch, roles.EscapeDoor)
			}
			used = append(used, roles.Treasure...)
			sorted := slices.Clone(used)
			sort.Ints(sorted)
			if len(slices.Compact(sorted)) != len(used) {
				t.Fatalf("escape %v seed %d: roles share a room: %+v", escape, seed, roles)
			}
			if n := len(roles.Treasure); n < 3 || n > 4 {
				t.Fatalf("escape %v seed %d: %d treasure rooms, want 3..4", escape, seed, n)
			}
			// The farther half first: at least three of the treasure rooms are far.
			far := 0
			for _, r := range roles.Treasure {
				if dist[r] >= dist[6] {
					far++
				}
			}
			if far < 3 {
				t.Fatalf("escape %v seed %d: %d of the treasure rooms are far, want the far rooms left first: %+v", escape, seed, far, roles)
			}
		}
	}
}

func TestAssignRoles_HiddenRooms_DrawnFromTheOtherDeadEnds(t *testing.T) {
	p, rooms, open := rowOfRooms(12)
	p.EscapeDoor, p.HiddenRooms = true, 1
	barrable := []BarredRoom{barredAt(rooms, 3), barredAt(rooms, 11)}

	got, err := assignRoles(p, rand.New(rand.NewPCG(1, 1)), rooms, open, 0, barrable)

	if err != nil {
		t.Fatalf("assignRoles() error = %v", err)
	}
	if len(got.hidden) != 1 || got.hidden[0].Room != 3 {
		t.Fatalf("hidden = %+v, want room 3", got.hidden)
	}
	if slices.Contains(got.Treasure, 3) || got.Switch == 3 || got.EscapeDoor == 3 {
		t.Fatalf("the hidden room holds a role: %+v", got.Roles)
	}
}

func TestDrawStart_NoRoomBigEnoughToStart_ReturnsInvalid(t *testing.T) {
	p, rooms, _ := rowOfRooms(12)
	p.StartMin = 6

	_, err := drawStart(p, rand.New(rand.NewPCG(1, 1)), rooms)

	if !errors.Is(err, errInvalidLayout) {
		t.Fatalf("drawStart() error = %v, want errInvalidLayout", err)
	}
}

func TestAssignRoles_Unplaceable_ReturnsInvalid(t *testing.T) {
	tests := []struct {
		name     string
		rooms    int
		escape   bool
		hidden   int
		barrable []int
	}{
		// Start plus four: the far half is rooms 3 and 4, the stairs take 4.
		{"too few far rooms for the escape door and switch", 5, true, 0, []int{4}},
		{"no dead end for the stairs", 12, true, 0, nil},
		{"the farthest dead end is near", 12, true, 0, []int{2}},
		{"too few dead ends for the hidden rooms", 12, true, 2, []int{9, 11}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p, rooms, open := rowOfRooms(tt.rooms)
			p.TreasureRooms = IntRange{Min: 0, Max: 0}
			p.EscapeDoor, p.HiddenRooms = tt.escape, tt.hidden
			var barrable []BarredRoom
			for _, i := range tt.barrable {
				barrable = append(barrable, barredAt(rooms, i))
			}

			_, err := assignRoles(p, rand.New(rand.NewPCG(1, 1)), rooms, open, 0, barrable)

			if !errors.Is(err, errInvalidLayout) {
				t.Fatalf("assignRoles() error = %v, want errInvalidLayout", err)
			}
		})
	}
}

func TestAssignRoles_UnreachableRoom_ReturnsInvalid(t *testing.T) {
	p, rooms, open := rowOfRooms(12)
	open[3*p.Cols+6] = false // cut the corridor cell between rooms 0 and 1

	_, err := assignRoles(p, rand.New(rand.NewPCG(1, 1)), rooms, open, 0, []BarredRoom{barredAt(rooms, 11)})

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
		fixed := []int{r.Stairs}
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
