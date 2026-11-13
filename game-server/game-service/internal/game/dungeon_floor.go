package game

import (
	"fmt"
	"log/slog"
	"math"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/levelgen"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/navigation"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/google/uuid"
)

/**
* A dungeon floor is a run floor built from the dungeon generator: rooms joined
* by corridors on a grid of cells (FS-KE075 §B, ADR-0061). Its shell walls are
* entities from the generator's rects, its party stands in the start room, its
* switch, escape door and stairs in their own far rooms, its containers one per
* room, and every body on it is placed by drawing walkable cells of the region
* it belongs in (ADR-0061 Decision 8), never by testing "outside every
* keep-out rect", which fails where almost every point is rock.
*
* Room roles stay on the server: the floor map carries the regions, never which
* room is which (FS-KE075 §B R12).
**/

// dungeonParams is the generator's parameter set for a run floor built as a
// dungeon. Every Spire floor is one, on floor 1's set (FS-M8CSE §C R12-13); a
// floor that needs its own set is a new parameter set here (ADR-0061 Decision
// 2). A floor of buildings is now only what a failed generation leaves.
func dungeonParams(_ int) (levelgen.DungeonParams, bool) {
	return levelgen.DungeonFloor1Params, true
}

// dungeonGenerator is the dungeon generator the floor build calls. A session
// holds levelgen.GenerateDungeon; a test injects one that fails, to reach the
// fallback (FS-KE075 §B R17).
type dungeonGenerator func(p levelgen.DungeonParams, seed uint64) (levelgen.DungeonLayout, error)

// dungeonGenerations is how many seeds a dungeon floor is tried with before
// the build falls back to a floor of buildings: the drawn seed, then a fresh
// one (FS-KE075 §B R17). Each runs the generator's own retries.
const dungeonGenerations = 2

// dungeonPlacementAttempts is how many points one placement draws on a
// dungeon floor before it gives up on that region.
const dungeonPlacementAttempts = 200

// fixtureSearchStep is the lattice, in px, a fixture's room is searched on
// when its random draws all miss: finer than the least slack a fixture has in
// one cell, the stairs' 68 px footprint in an 80 px cell leaving 12 px.
const fixtureSearchStep = 10.0

// containerPadding is the ground a container, switch, escape door or stairs
// keeps clear around its footprint, as a floor of buildings keeps for its
// chest and stairs.
const containerPadding = 10.0

// dungeonContainers is how many containers a dungeon floor of rooms holds:
// clamp(round(rooms / 2), 10, 14). FS-KE075 §B R15.
func dungeonContainers(rooms int) int {
	return min(max(int(math.Round(float64(rooms)/2)), 10), 14)
}

// dungeonFloor is one dungeon floor's layout as the floor build and the
// placements read it: the generator's output, plus each cell's region and
// whether it is a doorway. It is built once per floor and never written
// after, so any goroutine may read it.
type dungeonFloor struct {
	layout levelgen.DungeonLayout
	// region is each cell's region id, row by row; 0 is rock.
	region []int
	// doorway marks a room's cells 4-adjacent to a corridor.
	doorway []bool
}

func newDungeonFloor(layout levelgen.DungeonLayout) *dungeonFloor {
	d := &dungeonFloor{
		layout:  layout,
		region:  layout.Grid(),
		doorway: make([]bool, layout.Cols*layout.Rows),
	}
	for _, room := range layout.Rooms {
		for _, c := range room.Doorways {
			d.doorway[c.Y*layout.Cols+c.X] = true
		}
	}
	return d
}

/**
* generateDungeonFloor draws the floor's seed, generates its layout and finds
* where its switch, escape door and stairs stand, trying a fresh seed if the
* first is exhausted or leaves a fixture no spot (FS-KE075 §B R14, R17). nil
* when both seeds fail: the floor is then built of buildings so the run still
* plays (ADR-0061 Decision 13, FS-M8CSE §C R15). Nothing is laid yet; a seed
* that fails leaves nothing behind.
**/
func (s *Session) generateDungeonFloor(depth int) (*dungeonFloor, dungeonFixtures) {
	params, isDungeon := dungeonParams(depth)
	if !isDungeon {
		return nil, dungeonFixtures{}
	}

	for try := range dungeonGenerations {
		// drawn from the session's spawn source, so a seeded run builds the
		// same floor every time; logged, so a floor can be reproduced (§A R9)
		seed := uint64(s.spawnRand.IntN(math.MaxInt))
		layout, err := s.generateDungeon(params, seed)
		if err != nil {
			slog.Error("Dungeon floor not generated",
				"sessionID", s.ID, "floor", depth, "seed", seed, "try", try+1, "error", err)
			continue
		}
		d := newDungeonFloor(layout)
		fixtures, err := s.placeFixtures(depth, d)
		if err != nil {
			// the next seed's floor is placed on empty ground again
			s.objectOccupiedPlaceAreas = nil
			slog.Error("Dungeon floor not laid",
				"sessionID", s.ID, "floor", depth, "seed", seed, "try", try+1, "error", err)
			continue
		}
		slog.Debug("Dungeon floor generated",
			"sessionID", s.ID, "floor", depth, "seed", seed, "attempt", layout.Attempt, "rooms", len(layout.Rooms))
		return d, fixtures
	}

	slog.Error("Dungeon floor fell back to a floor of buildings: this floor is a small one",
		"sessionID", s.ID, "floor", depth, "tries", dungeonGenerations)
	s.warnTomeRunFallback(depth)
	return nil, dungeonFixtures{}
}

// dungeonFixtures is where a dungeon floor's escape door, switch and stairs
// stand, found before anything is laid. stairs is unset on the top floor.
type dungeonFixtures struct {
	exitDoor, exitSwitch, stairs point
}

// isTopFloor is whether depth is the floor the run's Spire height names (FS-M8CSE
// §A Requirement 4). Without a run-level entity nothing is the top.
func (s *Session) isTopFloor(depth int) bool {
	floor, ok := systems.CurrentFloor(s.EntityManager.GetAllEntities())
	return ok && depth == floor.Count
}

// hasStairs is whether the floor at depth has a way up: every floor but the
// top, and floor 1 is never the top (FS-F6F88 §Requirements 7).
func (s *Session) hasStairs(depth int) bool { return !s.isTopFloor(depth) }

// placeFixtures finds the escape door's, the switch's and the stairs' spots in
// their rooms, each through the occupied-area check. An error when a room has
// none: the layout cannot be laid (FS-KE075 §B R14).
func (s *Session) placeFixtures(depth int, d *dungeonFloor) (dungeonFixtures, error) {
	roles := d.layout.Roles
	var f dungeonFixtures
	var ok bool
	if f.exitDoor, ok = s.placeFixture(d, roles.EscapeDoor, constants.ContainerWidthRadius, constants.ContainerHeightRadius); !ok {
		return f, fmt.Errorf("the escape door's room %d has no spot off its doorways", roles.EscapeDoor)
	}
	if f.exitSwitch, ok = s.placeFixture(d, roles.Switch, constants.ContainerWidthRadius, constants.ContainerHeightRadius); !ok {
		return f, fmt.Errorf("the switch's room %d has no spot off its doorways", roles.Switch)
	}
	if s.hasStairs(depth) {
		if f.stairs, ok = s.placeFixture(d, roles.Stairs, constants.StairsWidthRadius, constants.StairsHeightRadius); !ok {
			return f, fmt.Errorf("the stairs' room %d has no spot off its doorways", roles.Stairs)
		}
	}
	return f, nil
}

// layDungeon lays a dungeon floor out: its shell walls, then the switch,
// escape door and stairs where they were found, then its containers. The party
// and the monsters come after, as on every floor.
func (s *Session) layDungeon(depth int, d *dungeonFloor, fixtures dungeonFixtures) {
	// the shell walls belong to no building: a floor map carries them with no
	// house (FS-KE075 §F R31); a wall's top-left is its position, as WallState's
	for _, wall := range d.layout.Walls {
		CreateWallEntity(s.EntityManager, WallConfig{X: wall.X, Y: wall.Y, Width: wall.W, Height: wall.H}, uuid.Nil)
	}

	exitDoor := CreateEscapeDoorEntity(s.EntityManager, EscapeConfig{X: fixtures.exitDoor.x, Y: fixtures.exitDoor.y})
	switchEntity := CreateSwitchEntity(s.EntityManager, SwitchConfig{X: fixtures.exitSwitch.x, Y: fixtures.exitSwitch.y, SwitchID: 1})

	// the switch handler reads these from the message goroutine
	s.mu.Lock()
	s.exitDoorEntityID = exitDoor.ID
	s.switchEntityIDs = []uuid.UUID{switchEntity.ID}
	s.mu.Unlock()

	if s.hasStairs(depth) {
		CreateStairsEntity(s.EntityManager, StairsConfig{X: fixtures.stairs.x, Y: fixtures.stairs.y})
	}

	s.layDungeonContainers(d)

	// a tome run's tome or altar, after the containers (FS-3103M §C R8-R9)
	s.layTomeAndAltar(depth, d)
}

/**
* placeFixture finds a spot for one of the floor's fixed objects, of half-size
* (rw, rh), in room: on walkable cells of the room, off its doorways, clear of
* what is already placed, through the occupied-area check, and holds it
* (FS-KE075 §B R14). A room whose random draws all miss is searched whole; false
* when even that finds no spot, since a fixture forced onto a doorway or over
* another would break R14.
**/
func (s *Session) placeFixture(d *dungeonFloor, room int, rw, rh float64) (point, bool) {
	region := d.roomRegion(room)
	rw, rh = rw+containerPadding, rh+containerPadding
	need := footing{doorways: offDoorways, free: s.isFree}
	x, y, ok := d.spot(s.spawnRand, region, rw, rh, need)
	if !ok {
		x, y, ok = d.search(region, rw, rh, need)
	}
	if !ok {
		return point{}, false
	}
	s.objectOccupiedPlaceAreas = append(s.objectOccupiedPlaceAreas, centredArea(x, y, rw, rh))
	return point{x, y}, true
}

/**
* layDungeonContainers places the floor's containers (FS-KE075 §B R15): a
* chest in each treasure room, then one per room, a chest or at today's sack
* share a sack, in rooms drawn from those that are neither the start nor a
* treasure room, until the floor holds clamp(round(rooms / 2), 10, 14). A room
* with no free spot is passed over for the next one drawn.
**/
func (s *Session) layDungeonContainers(d *dungeonFloor) {
	roles := d.layout.Roles
	want := dungeonContainers(len(d.layout.Rooms))
	placed := 0

	for _, room := range roles.Treasure {
		if s.placeDungeonContainer(d, room, components.ContainerKindChest) {
			placed++
		}
	}

	taken := map[int]bool{roles.Start: true}
	for _, room := range roles.Treasure {
		taken[room] = true
	}
	var others []int
	for room := range d.layout.Rooms {
		if !taken[room] {
			others = append(others, room)
		}
	}
	shuffle(s.spawnRand, others)

	for _, room := range others {
		if placed >= want {
			break
		}
		if s.placeDungeonContainer(d, room, spawnedContainerKind(s.containerKindRand)) {
			placed++
		}
	}

	if placed < want {
		slog.Warn("Dungeon floor holds fewer containers than its rooms call for",
			"sessionID", s.ID, "placed", placed, "want", want)
	}
}

// placeDungeonContainer stands one container of kind in room, as placeFixture
// stands a fixture, but reports a room with no free spot instead of forcing it.
func (s *Session) placeDungeonContainer(d *dungeonFloor, room int, kind components.ContainerKind) bool {
	rw, rh := constants.ContainerWidthRadius+containerPadding, constants.ContainerHeightRadius+containerPadding
	x, y, ok := d.spot(s.spawnRand, d.roomRegion(room), rw, rh, footing{doorways: offDoorways, free: s.isFree})
	if !ok {
		slog.Warn("Container skipped: its room has no free spot", "sessionID", s.ID, "room", room)
		return false
	}
	s.AddContainer(x, y, kind)
	s.objectOccupiedPlaceAreas = append(s.objectOccupiedPlaceAreas, centredArea(x, y, rw, rh))
	return true
}

// isFree is whether area overlaps nothing the floor build has placed yet.
func (s *Session) isFree(area PlaceArea) bool { return !s.IsAreaOccupied(area) }

// shuffle puts xs in a random order drawn from rng (Fisher–Yates).
func shuffle[T any](rng populationRand, xs []T) {
	for i := len(xs) - 1; i > 0; i-- {
		j := rng.IntN(i + 1)
		xs[i], xs[j] = xs[j], xs[i]
	}
}

// roomRegion is room's region id: room i is region i+1 (levelgen.DungeonLayout).
func (d *dungeonFloor) roomRegion(room int) int { return d.layout.Rooms[room].Region }

// roomCentre is the centre of room in px.
func (d *dungeonFloor) roomCentre(room int) point {
	r, cell := d.layout.Rooms[room].Rect, d.layout.CellSize
	return point{x: (float64(r.X) + float64(r.W)/2) * cell, y: (float64(r.Y) + float64(r.H)/2) * cell}
}

// regionCells is the cell rects region id covers.
func (d *dungeonFloor) regionCells(region int) []levelgen.CellRect {
	return d.layout.Regions[region-1].Cells
}

// doorwayRule says whether a placed area may overlap a room's doorway cells.
type doorwayRule int

const (
	// onDoorways lets it: the party in its start room
	onDoorways doorwayRule = iota
	// offDoorways keeps it off them: fixtures, containers and monsters
	// (FS-KE075 §B R14, §C R20)
	offDoorways
)

// footing is what a placed area must meet beyond standing on its region: its
// doorway rule, and free, when set, accepting it.
type footing struct {
	doorways doorwayRule
	free     func(PlaceArea) bool
}

// fits is whether an area of half-size (rw, rh) centred on (x, y) stands on
// region and meets need.
func (d *dungeonFloor) fits(x, y float64, region int, rw, rh float64, need footing) bool {
	area := centredArea(x, y, rw, rh)
	return d.stands(area, region, need.doorways) && (need.free == nil || need.free(area))
}

/**
* spot draws a point in region where an area of half-size (rw, rh) centred on
* it stands and meets need, a bounded number of times. The centre is drawn
* uniformly over the region's cells: positive sampling, the point always on
* the ground it is meant for (FS-KE075 §B R16).
**/
func (d *dungeonFloor) spot(rng populationRand, region int, rw, rh float64, need footing) (x, y float64, ok bool) {
	for range dungeonPlacementAttempts {
		x, y = d.draw(rng, region)
		if d.fits(x, y, region, rw, rh, need) {
			return x, y, true
		}
	}
	return 0, 0, false
}

/**
* search walks region's cell rects, row by row on a fixtureSearchStep lattice,
* for the first point where an area of half-size (rw, rh) stands and meets
* need: the whole room looked over when its random draws all missed
* (FS-KE075 §B R14). Deterministic, and only ever a fallback.
**/
func (d *dungeonFloor) search(region int, rw, rh float64, need footing) (x, y float64, ok bool) {
	cell := d.layout.CellSize
	for _, r := range d.regionCells(region) {
		left, top := float64(r.X)*cell+rw, float64(r.Y)*cell+rh
		right, bottom := float64(r.X+r.W)*cell-rw, float64(r.Y+r.H)*cell-rh
		for row := 0; top+float64(row)*fixtureSearchStep <= bottom; row++ {
			y := top + float64(row)*fixtureSearchStep
			for col := 0; left+float64(col)*fixtureSearchStep <= right; col++ {
				if x := left + float64(col)*fixtureSearchStep; d.fits(x, y, region, rw, rh, need) {
					return x, y, true
				}
			}
		}
	}
	return 0, 0, false
}

// draw is a point drawn uniformly over region's cells.
func (d *dungeonFloor) draw(rng populationRand, region int) (x, y float64) {
	rects := d.regionCells(region)
	total := 0
	for _, r := range rects {
		total += r.W * r.H
	}
	n := rng.IntN(total)
	for _, r := range rects {
		if n < r.W*r.H {
			cx, cy := r.X+n%r.W, r.Y+n/r.W
			cell := d.layout.CellSize
			return (float64(cx) + rng.Float64()) * cell, (float64(cy) + rng.Float64()) * cell
		}
		n -= r.W * r.H
	}
	// unreachable: n is drawn below the region's cell count
	first := rects[0]
	return (float64(first.X) + 0.5) * d.layout.CellSize, (float64(first.Y) + 0.5) * d.layout.CellSize
}

/**
* stands reports whether area lies wholly on cells of region: every cell it
* overlaps is walkable and in region, and, under offDoorways, none is a doorway.
* A body centred in the area is then inset from every wall by its half-size,
* diagonal corners included (FS-KE075 §B R16).
**/
func (d *dungeonFloor) stands(area PlaceArea, region int, doorways doorwayRule) bool {
	cell := d.layout.CellSize
	c0, r0 := int(math.Floor(area.X/cell)), int(math.Floor(area.Y/cell))
	c1, r1 := int(math.Ceil((area.X+area.W)/cell))-1, int(math.Ceil((area.Y+area.H)/cell))-1
	if c0 < 0 || r0 < 0 || c1 >= d.layout.Cols || r1 >= d.layout.Rows {
		return false
	}
	for y := r0; y <= r1; y++ {
		for x := c0; x <= c1; x++ {
			c := y*d.layout.Cols + x
			if d.region[c] != region || (doorways == offDoorways && d.doorway[c]) {
				return false
			}
		}
	}
	return true
}

// navGrid is the floor's walkable cells as a navigation grid, for the monster
// AI (FS-KE075 §D R21). A new grid each call: its searches write the grid's own
// scratch, and the floor itself is read by any goroutine.
func (d *dungeonFloor) navGrid() *navigation.Grid {
	walkable := make([]bool, len(d.region))
	for c, region := range d.region {
		walkable[c] = region != 0
	}
	return navigation.NewGrid(d.layout.Cols, d.layout.Rows, d.layout.CellSize, walkable)
}

// regionAt is the region of the cell holding (x, y), 0 on rock or off the grid.
func (d *dungeonFloor) regionAt(x, y float64) int {
	cell := d.layout.CellSize
	cx, cy := int(math.Floor(x/cell)), int(math.Floor(y/cell))
	if cx < 0 || cy < 0 || cx >= d.layout.Cols || cy >= d.layout.Rows {
		return 0
	}
	return d.region[cy*d.layout.Cols+cx]
}

// roomAt is the room whose region holds (x, y), -1 in a corridor, on rock or
// off the grid.
func (d *dungeonFloor) roomAt(x, y float64) int {
	region := d.regionAt(x, y)
	for i, room := range d.layout.Rooms {
		if room.Region == region {
			return i
		}
	}
	return -1
}

// startSpot is where one body stands in the start room: on its walkable cells,
// inset from its walls by a body's radius, with nothing else checked. The
// seat's fallback for an arrival with no kept slot (spawnPoint).
func (d *dungeonFloor) startSpot(rng populationRand) (x, y float64) {
	r := constants.PlayerRadius
	start := d.layout.Roles.Start
	if x, y, ok := d.spot(rng, d.roomRegion(start), r, r, footing{doorways: onDoorways}); ok {
		return x, y
	}
	centre := d.roomCentre(start)
	return centre.x, centre.y
}

// dungeonPartyArea is the w by h area the party's formation stands in on a dungeon
// floor: wholly on the start room's cells and clear of what is placed, so
// every slot in it, inset by half a spacing, is in the start room a body's
// radius clear of its walls (FS-KE075 §B R13). A start room is at least 5x5
// cells, far more than a party needs; a room with no free spot gets the
// formation on its centre, loudly.
func (s *Session) dungeonPartyArea(d *dungeonFloor, w, h float64) PlaceArea {
	start := d.layout.Roles.Start
	if x, y, ok := d.spot(s.spawnRand, d.roomRegion(start), w/2, h/2, footing{doorways: onDoorways, free: s.isFree}); ok {
		return centredArea(x, y, w/2, h/2)
	}
	slog.Error("Party forced onto the start room's centre: no free spot", "sessionID", s.ID)
	centre := d.roomCentre(start)
	return centredArea(centre.x, centre.y, w/2, h/2)
}
