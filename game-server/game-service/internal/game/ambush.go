package game

import (
	"log/slog"
	"slices"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
)

/**
* Ambushes (FS-5FZ4J §B R14). Working a seal piece the first time, or
* tripping a tripwire, wakes an ambush: a pack of the floor's pool spawned in
* the nearest room by walk to where it was woken, hunting the delver who woke
* it. What wakes one carries an AmbushComponent, so each wakes at most one in
* its floor's life. Ambush monsters are extra to the floor's count and give
* experience and drops as its other monsters do.
**/

/**
* wakeAmbush wakes once's ambush, at at, on waker: unless it has woken one
* already, a pack of AmbushSizeMin..AmbushSizeMax of the floor's pool at its
* monster level, at most one brute and the rest fodder, in the nearest room by
* walk to at that qualifies (ambushRooms), every one at least
* MonsterDelverExclusion from every delver and hunting waker. A floor with no
* room that fits the pack spawns it in at's own room, at the spots farthest
* from the delvers.
**/
func (s *Session) wakeAmbush(once *components.AmbushComponent, at point, waker *ecs.Entity) {
	if once == nil || once.Woken {
		return
	}
	once.Woken = true
	d := s.dungeon
	if d == nil {
		return
	}

	pack := s.rollAmbush()
	entities := s.EntityManager.GetAllEntities()
	area := s.summonArea(entities)

	spots, ok := s.ambushSpots(d, &area, at, len(pack))
	if !ok {
		slog.Warn("Ambush short: no room fits its pack", "sessionID", s.ID, "rolled", len(pack), "placed", len(spots))
	}
	for i, spot := range spots {
		pack[i].X, pack[i].Y = spot.x, spot.y
		monster := CreateMonsterEntity(s.EntityManager, pack[i])
		// taken up at any distance, past the leash, as a hit from afar is
		if mc, has := monster.GetComponent(ecs.ComponentTypeEnemy); has {
			mc.(*components.MonsterComponent).LastAttacker = waker.ID
		}
	}
	slog.Debug("Ambush woken", "sessionID", s.ID, "monsters", len(spots))
}

// wakePieceAmbush wakes the ambush a piece's first work wakes, where it
// stands, on waker; a piece that wakes none, or has woken its one, wakes
// nothing.
func (s *Session) wakePieceAmbush(piece, waker *ecs.Entity) {
	ac, wakes := piece.GetComponent(ecs.ComponentTypeAmbush)
	tc, placed := piece.GetComponent(ecs.ComponentTypeTransform)
	if !wakes || !placed {
		return
	}
	at := tc.(*components.TransformComponent)
	s.wakeAmbush(ac.(*components.AmbushComponent), point{at.X, at.Y}, waker)
}

// rollAmbush is an ambush's pack: its first member rolled as any monster of
// the floor is, a brute at the floor's brute share, the rest its fodder, each
// at the floor's level and elite chance (FS-5FZ4J §B R14).
func (s *Session) rollAmbush() []MonsterConfig {
	floor := firstFloor
	if f, ok := systems.CurrentFloor(s.EntityManager.GetAllEntities()); ok {
		floor = f.Depth
	}
	s.mu.RLock()
	pool := s.floorPool
	s.mu.RUnlock()
	level := s.floorPartyLevel(floor)

	n := AmbushSizeMin + s.spawnRand.IntN(AmbushSizeMax-AmbushSizeMin+1)
	pack := []MonsterConfig{rollAs(s.spawnRand, pool.rolled(s.spawnRand, floor).rollLook(s.spawnRand), level, floor, eliteChance(floor))}
	for len(pack) < n {
		fodder, ok := pool.fodder(s.spawnRand)
		if !ok {
			break
		}
		pack = append(pack, rollAs(s.spawnRand, fodder.rollLook(s.spawnRand), level, floor, eliteChance(floor)))
	}
	return pack
}

// floorPartyLevel is the party's level as the floor's population takes it:
// the highest delver's, or the endgame test run's plan's (FS-BDRTJ R27).
func (s *Session) floorPartyLevel(floor int) int {
	if s.endgame != nil {
		return s.endgame.partyLevel(floor)
	}
	return partyLevel(delversOf(s.EntityManager.GetAllEntities()))
}

/**
* ambushSpots is where n monsters stand for an ambush woken at at: the first
* room of ambushRooms that holds all n at valid spots; else, in at's own room,
* the spots farthest from the delvers on open ground. false when even that
* holds fewer than n, with what it found.
**/
func (s *Session) ambushSpots(d *dungeonFloor, area *spawnArea, at point, n int) ([]point, bool) {
	mark := len(area.placed)
	for _, room := range d.ambushRooms(at) {
		var spots []point
		for range n {
			x, y, ok := area.placeOnRegion(s.spawnRand, d, d.roomRegion(room), area.valid)
			if !ok {
				break
			}
			spots = append(spots, point{x, y})
			area.placed = append(area.placed, point{x, y})
		}
		if len(spots) == n {
			return spots, true
		}
		area.placed = area.placed[:mark]
	}

	region := d.regionAt(at.x, at.y)
	if region == 0 {
		return nil, false
	}
	r := constants.PlayerRadius
	var spots []point
	for range n {
		best, found := -1.0, point{}
		for range DemonPlacementSamples {
			x, y := d.draw(s.spawnRand, region)
			if !d.stands(centredArea(x, y, r, r), region, offDoorways) || !area.open(x, y) {
				continue
			}
			if far := area.nearestDelver(x, y); far > best {
				best, found = far, point{x, y}
			}
		}
		if best < 0 {
			break
		}
		spots = append(spots, found)
		area.placed = append(area.placed, found)
	}
	return spots, len(spots) == n
}

/**
* ambushRooms is the rooms an ambush woken at at may spawn in, nearest first by
* walk from at's cell to each room's centre cell: never at's own room, the
* start room, the stairs room, a hidden room or a respite room (FS-5FZ4J §B
* R14, §D R21). A barrier's
* cells are walked as ground: each shuts a dead end only, and those rooms are
* left out.
**/
func (d *dungeonFloor) ambushRooms(at point) []int {
	barred := map[int]bool{d.layout.Roles.Start: true, d.layout.Roles.Stairs: true, d.roomAt(at.x, at.y): true}
	for _, hidden := range d.layout.Hidden {
		barred[hidden.Room] = true
	}
	for _, r := range d.respites {
		barred[r.room] = true
	}
	dist := d.walkFrom(d.cellOf(at))
	distance := map[int]int{}
	var rooms []int
	for room := range d.layout.Rooms {
		c := d.cellOf(d.roomCentre(room))
		walk := dist[c.Y*d.layout.Cols+c.X]
		if barred[room] || walk < 0 {
			continue
		}
		rooms = append(rooms, room)
		distance[room] = walk
	}
	slices.SortStableFunc(rooms, func(a, b int) int { return distance[a] - distance[b] })
	return rooms
}

// walkFrom is the 4-neighbour walk in cells over the floor's walkable cells
// from cell from: -1 where unreachable.
func (d *dungeonFloor) walkFrom(from components.Cell) []int {
	cols, rows := d.layout.Cols, d.layout.Rows
	dist := make([]int, len(d.region))
	for i := range dist {
		dist[i] = -1
	}
	if from.X < 0 || from.Y < 0 || from.X >= cols || from.Y >= rows || d.region[from.Y*cols+from.X] == 0 {
		return dist
	}
	start := from.Y*cols + from.X
	dist[start] = 0
	queue := []int{start}
	for i := 0; i < len(queue); i++ {
		x, y := queue[i]%cols, queue[i]/cols
		for _, n := range [4][2]int{{x + 1, y}, {x - 1, y}, {x, y + 1}, {x, y - 1}} {
			if n[0] < 0 || n[1] < 0 || n[0] >= cols || n[1] >= rows {
				continue
			}
			next := n[1]*cols + n[0]
			if d.region[next] != 0 && dist[next] < 0 {
				dist[next] = dist[queue[i]] + 1
				queue = append(queue, next)
			}
		}
	}
	return dist
}
