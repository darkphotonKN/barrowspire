package levelgen

import (
	"fmt"
	"math/rand/v2"
	"slices"
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
	field := walkDistances(cols, rows, open, centreIndex(cols, rooms[start]))
	dist := make([]int, len(rooms))
	for i, r := range rooms {
		if dist[i] = field[centreIndex(cols, r)]; dist[i] < 0 {
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

// roomRoles is what assignRoles hands back: the roles, each room's distance
// from the start room, and the barred rooms it chose.
type roomRoles struct {
	Roles
	dist   []int
	stairs BarredRoom
	hidden []BarredRoom
}

// drawStart draws the start room from the rooms at least StartMin on each side.
func drawStart(p DungeonParams, rng *rand.Rand, rooms []CellRect) (int, error) {
	var starts []int
	for i, r := range rooms {
		if r.W >= p.StartMin && r.H >= p.StartMin {
			starts = append(starts, i)
		}
	}
	if len(starts) == 0 {
		return 0, fmt.Errorf("%w: no room is at least %dx%d to start in", errInvalidLayout, p.StartMin, p.StartMin)
	}
	return starts[rng.IntN(len(starts))], nil
}

/**
* assignRoles gives the rooms their roles (FS-KE075 §B.12, ADR-0061 Decision
* 6, FS-5FZ4J §A R2, R6-R7, §F R36), start drawn already, barrable the rooms
* that could stand behind a barrier:
*
*   - stairs: the barrable room farthest from the start, which must be at
*     least as far as the median room;
*   - hidden: HiddenRooms drawn from the other barrable rooms;
*   - escape door (floors 2+): of the rooms at least as far from the start as
*     the median that are neither the start, the stairs nor hidden, the one
*     farthest by walk from the stairs room; the switch is drawn from the rest
*     of them; on floor 1 neither exists;
*   - treasure: TreasureRooms drawn from the rooms left, the farther half first.
*
* Ties go to the lower room index. A layout that cannot take them is invalid,
* and the attempt is retried.
**/
func assignRoles(p DungeonParams, rng *rand.Rand, rooms []CellRect, open []bool, start int, barrable []BarredRoom) (roomRoles, error) {
	dist, err := roomDistances(p.Cols, p.Rows, rooms, open, start)
	if err != nil {
		return roomRoles{}, err
	}
	median := medianDistance(dist, start)

	stairsAt := farthestBarred(barrable, dist)
	if stairsAt < 0 {
		return roomRoles{}, fmt.Errorf("%w: no room is a dead end for the stairs", errInvalidLayout)
	}
	out := roomRoles{
		Roles:  Roles{Start: start, Switch: noRoom, EscapeDoor: noRoom, Stairs: barrable[stairsAt].Room},
		dist:   dist,
		stairs: barrable[stairsAt],
	}
	if dist[out.Stairs] < median {
		return roomRoles{}, fmt.Errorf("%w: the farthest dead end, room %d, is %d cells from the start, under the median %d",
			errInvalidLayout, out.Stairs, dist[out.Stairs], median)
	}
	others := slices.Delete(slices.Clone(barrable), stairsAt, stairsAt+1)
	if len(others) < p.HiddenRooms {
		return roomRoles{}, fmt.Errorf("%w: %d dead ends left for %d hidden rooms", errInvalidLayout, len(others), p.HiddenRooms)
	}
	rng.Shuffle(len(others), func(i, j int) { others[i], others[j] = others[j], others[i] })
	out.hidden = others[:p.HiddenRooms]
	slices.SortFunc(out.hidden, func(a, b BarredRoom) int { return a.Room - b.Room })

	taken := map[int]bool{start: true, out.Stairs: true}
	for _, h := range out.hidden {
		taken[h.Room] = true
	}
	var far, near []int
	for i, d := range dist {
		switch {
		case taken[i]:
		case d >= median:
			far = append(far, i)
		default:
			near = append(near, i)
		}
	}
	if p.EscapeDoor {
		if len(far) < 2 {
			return roomRoles{}, fmt.Errorf("%w: %d free rooms at or past the median distance, need 2", errInvalidLayout, len(far))
		}
		at := farthestFrom(p.Cols, p.Rows, open, rooms, out.Stairs, far)
		out.EscapeDoor = far[at]
		far = slices.Delete(far, at, at+1)
		shuffle(rng, far)
		out.Switch, far = far[0], far[1:]
	} else {
		shuffle(rng, far)
	}

	want := pickIn(rng, p.TreasureRooms)
	shuffle(rng, near)
	pool := append(far, near...)
	if len(pool) < want {
		return roomRoles{}, fmt.Errorf("%w: %d rooms left for %d treasure rooms", errInvalidLayout, len(pool), want)
	}
	out.Treasure = append([]int{}, pool[:want]...)
	sort.Ints(out.Treasure)
	return out, nil
}

// farthestBarred is the index into barrable of the room farthest from the
// start, the lower room index on a tie; -1 when there is none.
func farthestBarred(barrable []BarredRoom, dist []int) int {
	best := -1
	for i, b := range barrable {
		if best < 0 || dist[b.Room] > dist[barrable[best].Room] {
			best = i
		}
	}
	return best
}

// farthestFrom is the index into candidates of the room whose centre is the
// longest walk from room from's centre, the first on a tie.
func farthestFrom(cols, rows int, open []bool, rooms []CellRect, from int, candidates []int) int {
	field := walkDistances(cols, rows, open, centreIndex(cols, rooms[from]))
	best := 0
	for i, c := range candidates {
		if field[centreIndex(cols, rooms[c])] > field[centreIndex(cols, rooms[candidates[best]])] {
			best = i
		}
	}
	return best
}

func shuffle(rng *rand.Rand, s []int) {
	rng.Shuffle(len(s), func(i, j int) { s[i], s[j] = s[j], s[i] })
}
