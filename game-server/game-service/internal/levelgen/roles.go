package levelgen

import (
	"fmt"
	"math/rand/v2"
	"sort"
)

// walkDistances is the 4-neighbour walk in cells from cell `from` to every
// cell over the open cells of a cols x rows grid: -1 where unreachable.
func walkDistances(cols, rows int, open []bool, from int) []int {
	dist := make([]int, len(open))
	for i := range dist {
		dist[i] = -1
	}
	dist[from] = 0
	queue := []int{from}
	for i := 0; i < len(queue); i++ {
		for _, n := range neighbours4(cols, rows, queue[i]) {
			if open[n] && dist[n] < 0 {
				dist[n] = dist[queue[i]] + 1
				queue = append(queue, n)
			}
		}
	}
	return dist
}

// roomDistances is every room's walking distance from the start room, centre
// cell to centre cell; an unreachable room is an invalid layout.
func roomDistances(cols, rows int, rooms []CellRect, open []bool, start int) ([]int, error) {
	at := func(r CellRect) int { c := r.centre(); return c.Y*cols + c.X }
	field := walkDistances(cols, rows, open, at(rooms[start]))
	dist := make([]int, len(rooms))
	for i, r := range rooms {
		if dist[i] = field[at(r)]; dist[i] < 0 {
			return nil, fmt.Errorf("%w: room %d is unreachable from the start room", errInvalidLayout, i)
		}
	}
	return dist, nil
}

// medianDistance is the upper median of the rooms' distances, the start room
// left out. "At least the median" against it holds for any median definition.
func medianDistance(dist []int, start int) int {
	ds := make([]int, 0, len(dist))
	for i, d := range dist {
		if i != start {
			ds = append(ds, d)
		}
	}
	if len(ds) == 0 {
		return 0
	}
	sort.Ints(ds)
	return ds[len(ds)/2]
}

// assignRoles gives the rooms their roles (FS-KE075 §B.12, ADR-0061 Decision
// 6) and returns each room's distance from the start room:
//
//   - start: drawn from the rooms at least StartMin on each side;
//   - switch, escape door, stairs: three different rooms drawn from those at
//     least as far from the start as the median room;
//   - treasure: TreasureRooms drawn from the rest, the farther half first.
//
// A layout that cannot take them is invalid, and the attempt is retried.
func assignRoles(p DungeonParams, rng *rand.Rand, rooms []CellRect, open []bool) (Roles, []int, error) {
	var starts []int
	for i, r := range rooms {
		if r.W >= p.StartMin && r.H >= p.StartMin {
			starts = append(starts, i)
		}
	}
	if len(starts) == 0 {
		return Roles{}, nil, fmt.Errorf("%w: no room is at least %dx%d to start in", errInvalidLayout, p.StartMin, p.StartMin)
	}
	start := starts[rng.IntN(len(starts))]
	dist, err := roomDistances(p.Cols, p.Rows, rooms, open, start)
	if err != nil {
		return Roles{}, nil, err
	}

	median := medianDistance(dist, start)
	var far, near []int
	for i, d := range dist {
		switch {
		case i == start:
		case d >= median:
			far = append(far, i)
		default:
			near = append(near, i)
		}
	}
	if len(far) < fixedRoles-1 {
		return Roles{}, nil, fmt.Errorf("%w: %d rooms at or past the median distance, need %d",
			errInvalidLayout, len(far), fixedRoles-1)
	}
	shuffle(rng, far)
	roles := Roles{Start: start, Switch: far[0], EscapeDoor: far[1], Stairs: far[2]}

	want := pickIn(rng, p.TreasureRooms)
	shuffle(rng, near)
	pool := append(far[fixedRoles-1:len(far):len(far)], near...)
	if len(pool) < want {
		return Roles{}, nil, fmt.Errorf("%w: %d rooms left for %d treasure rooms", errInvalidLayout, len(pool), want)
	}
	roles.Treasure = append([]int{}, pool[:want]...)
	sort.Ints(roles.Treasure)
	return roles, dist, nil
}

func shuffle(rng *rand.Rand, s []int) {
	rng.Shuffle(len(s), func(i, j int) { s[i], s[j] = s[j], s[i] })
}
