package game

import (
	"log/slog"
	"math"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

// populationRand is the randomness a population draws on. Tests inject a seeded
// source; a session uses the goroutine-safe global one.
type populationRand interface {
	Float64() float64
	IntN(n int) int
}

/**
* populateMonsters fills the floor just built with its monsters (FS-77AB6
* §Requirements 21–22). It runs as the last step of building a floor, once the
* roster stands on it, so the party's level and every delver's position are
* known.
*
* Everything is rolled fresh: the floor's pool (FS-C8VM7 §C), count, mix,
* levels, elites, the demon and placement. A monster that finds no valid spot is skipped and logged, never
* overlapped or forced.
*
* No floor rolls the demon, Vorsk (FS-3103M §A R2). The top floor's boss comes
* on top of the standard count (§Requirements 24) where the demon stood: a
* champion, a variant the floor's pool left out (FS-C8VM7 §D R26-R27).
*
* The blood demon comes after the demon, on its own roll at the floor's odds,
* never guaranteed, never in the demon's dungeon room (FS-VHGE7 §A R5–10).
*
* A Master Spire's top floor holds Daa'gon where the demon would stand, and no
* blood demon rolls beside it (FS-M8CSE §E R24). Its floors below are any run's.
*
* A dungeon floor is populated by room and role instead (populateDungeon,
* FS-KE075 §C), its demon in the farthest room.
*
* The hub is never populated, and neither is a run with nobody in it.
*
* expected is the matched party not seated yet (FS-K2HKP R18): they count
* toward the party's level, and the spots kept for them are kept clear like
* any delver's, so an arrival is not seated next to a monster. nil on every
* floor but the first.
**/
func (s *Session) populateMonsters(floor int, topFloor bool, expected []types.CharacterInPlay) {
	if s.worldType != types.WorldTypeRun {
		return
	}

	entities := s.EntityManager.GetAllEntities()

	roster := delversOf(entities)
	// FS-K2HKP R18: a run whose whole party is still connecting is not empty
	if len(roster) == 0 && len(expected) == 0 {
		slog.Debug("Floor left unpopulated: no delvers placed", "sessionID", s.ID, "floor", floor)
		// an empty floor has no pool; the last floor's is not its
		s.setFloorPool(floorPool{})
		return
	}

	// FS-K2HKP R18: levelled to the whole matched party, the expected included
	level := max(partyLevel(roster), expectedPartyLevel(expected))
	area := spawnArea{
		width:   s.mapWidth,
		height:  s.mapHeight,
		keepOut: mapKeepOut(entities),
		// FS-K2HKP R18: the spots kept for arrivals are kept clear too
		delvers: append(inPlayPositions(roster), s.arrivalSlotPositions()...),
	}
	// FS-C8VM7 §C R19: the floor's standard monsters come only from its pool
	pool := s.floorPoolFor(level, floor)
	s.setFloorPool(pool)

	// a dungeon floor's monsters are distributed by room and role, its demon
	// in the farthest room (FS-KE075 §C R18–20)
	if s.dungeon != nil {
		s.populateDungeon(s.dungeon, &area, pool, level, floor)
		demonRoom := -1
		if demon, rolled := rollDemon(s.spawnRand, pool, level, floor, topFloor); rolled {
			demonRoom, _ = s.placeDungeonDemon(s.dungeon, &area, demon, floor, demonOddsOf(topFloor))
		}
		if isMasterSpireTop(floor, topFloor) {
			return
		}
		// FS-VHGE7 §A R8, R10: after the demon, never in its room
		if blood, rolled := rollBloodDemon(s.spawnRand, level, floor); rolled {
			s.placeDungeonBloodDemon(s.dungeon, &area, blood, floor, demonRoom)
		}
		return
	}

	monsters := rollMonsters(s.spawnRand, pool, level, floor)
	pool.capDarkWarriors(s.spawnRand, configsOf(monsters))
	for _, monster := range monsters {
		x, y, ok := area.place(s.spawnRand)
		if !ok {
			slog.Warn("Monster skipped: no valid spawn point",
				"sessionID", s.ID,
				"floor", floor,
				"archetype", monster.Archetype,
				"attempts", MonsterPlacementAttempts,
			)
			continue
		}

		monster.X, monster.Y = x, y
		CreateMonsterEntity(s.EntityManager, monster)
		area.placed = append(area.placed, point{x, y})
	}

	if demon, rolled := rollDemon(s.spawnRand, pool, level, floor, topFloor); rolled {
		s.placeDemon(&area, demon, floor, topFloor)
	}
	if isMasterSpireTop(floor, topFloor) {
		return
	}
	// FS-VHGE7 §A R8–9: after the demon, so its draws come first; never
	// guaranteed, so no relaxed retry
	if blood, rolled := rollBloodDemon(s.spawnRand, level, floor); rolled {
		s.placeDemon(&area, blood, floor, false)
	}
}

/**
* placeDemon stands a boss, the demon or the blood demon, at the valid spot
* farthest from the delvers among a bounded sample. A guaranteed demon (the top
* floor) that finds no spot clear of the delvers gets one more sample with the
* delver exclusion relaxed; if even that fails it is skipped loudly, never
* silently. A boss that is not guaranteed is skipped with a warning.
* FS-77AB6 §Edge States "Placement exhausted"; FS-VHGE7 §A R9.
**/
func (s *Session) placeDemon(area *spawnArea, demon MonsterConfig, floor int, guaranteed bool) {
	x, y, ok := area.placeFarthest(s.spawnRand, area.valid)
	if !ok && guaranteed {
		slog.Warn("Demon placement relaxed: no spot clear of the delvers",
			"sessionID", s.ID,
			"floor", floor,
			"archetype", demon.Archetype,
			"samples", DemonPlacementSamples,
		)
		x, y, ok = area.placeFarthest(s.spawnRand, area.open)
	}

	if !ok {
		if guaranteed {
			slog.Error("Guaranteed demon skipped: no valid spawn point even relaxed",
				"sessionID", s.ID, "floor", floor, "archetype", demon.Archetype, "samples", DemonPlacementSamples)
		} else {
			slog.Warn("Demon skipped: no valid spawn point",
				"sessionID", s.ID, "floor", floor, "archetype", demon.Archetype, "samples", DemonPlacementSamples)
		}
		return
	}

	demon.X, demon.Y = x, y
	CreateMonsterEntity(s.EntityManager, demon)
	area.placed = append(area.placed, point{x, y})
}

// rollDemon decides this floor's boss in the demon's place: on the top floor
// always, a champion (FS-C8VM7 §D R26); below the top, none, for no floor
// rolls Vorsk (FS-3103M §A R2). There is never more than one. A Master Spire's
// top floor has Daa'gon in its place (FS-M8CSE §E R24).
func rollDemon(rng populationRand, pool floorPool, partyLevel, floor int, topFloor bool) (MonsterConfig, bool) {
	if isMasterSpireTop(floor, topFloor) {
		return MonsterConfig{
			Archetype: components.MonsterArchetypeDaagon,
			Level:     daagonLevel(partyLevel, floor),
			Boss:      true,
		}, true
	}
	if topFloor {
		return rollChampion(rng, pool, partyLevel, floor), true
	}
	return MonsterConfig{}, false
}

// isMasterSpireTop is whether this floor is the top of a Master Spire. Only the
// top floor of a run is its height, so the floor's number says which run it is.
func isMasterSpireTop(floor int, topFloor bool) bool {
	return topFloor && floor == MasterSpireHeight
}

// rollBloodDemon decides whether this floor has a blood demon: its own draw
// against the floor's chance, never guaranteed, never more than one
// (FS-VHGE7 §A R4–6).
func rollBloodDemon(rng populationRand, partyLevel, floor int) (MonsterConfig, bool) {
	if rng.Float64() >= bloodDemonChance(floor) {
		return MonsterConfig{}, false
	}

	return MonsterConfig{
		Archetype: components.MonsterArchetypeBloodDemon,
		Level:     bloodDemonLevel(partyLevel, floor),
		Boss:      true,
	}, true
}

/**
* floorPoolFor is the pool a floor's standard monsters come from: drawn at the
* tier of its base level (FS-C8VM7 §C R19-R20). The one place a floor comes by
* its pool, so a fixed plan can stand in for the draw.
**/
func (s *Session) floorPoolFor(partyLevel, floor int) floorPool {
	return drawFloorPool(s.spawnRand, tierOf(floorBaseLevel(partyLevel, floor)))
}

// setFloorPool makes pool the current floor's, for its floor map.
func (s *Session) setFloorPool(pool floorPool) {
	s.mu.Lock()
	s.floorPool = pool
	s.mu.Unlock()
}

// rollMonsters decides a floor's standard monsters: how many, which archetype
// each is, its level, and whether it is an elite. Where they stand is decided
// afterwards.
func rollMonsters(rng populationRand, pool floorPool, partyLevel, floor int) []MonsterConfig {
	count := MonsterCountMin + rng.IntN(MonsterCountMax-MonsterCountMin+1)

	monsters := make([]MonsterConfig, 0, count)
	for range count {
		monsters = append(monsters, rollMonster(rng, pool, partyLevel, floor))
	}

	return monsters
}

// rollMonster is one standard monster: its variant from the floor's pool and
// its look (rollArchetype), then its level and elite roll (rollAs).
func rollMonster(rng populationRand, pool floorPool, partyLevel, floor int) MonsterConfig {
	return rollAs(rng, rollArchetype(rng, pool, floor), partyLevel, floor, eliteChance(floor))
}

// rollArchetype is a rolled monster's variant from the floor's pool, a brute
// at the floor's brute share, else a fodder, then its look (FS-C8VM7 §C R21,
// §A R8). Only a Spire population reaches it: a field rolls its own place's
// creatures.
func rollArchetype(rng populationRand, pool floorPool, floor int) components.MonsterArchetype {
	return pool.rolled(rng, floor).rollLook(rng)
}

// configsOf points at each of monsters, for a pass that changes them in place.
func configsOf(monsters []MonsterConfig) []*MonsterConfig {
	out := make([]*MonsterConfig, len(monsters))
	for i := range monsters {
		out[i] = &monsters[i]
	}
	return out
}

// rollAs is a monster of archetype at its level's spread, promoted to an elite
// with a drawn prefix at chance elite (1 promotes always: Float64 is below 1).
func rollAs(rng populationRand, archetype components.MonsterArchetype, partyLevel, floor int, elite float64) MonsterConfig {
	spread := rng.IntN(2*MonsterLevelSpread+1) - MonsterLevelSpread
	monster := MonsterConfig{
		Archetype: archetype,
		Level:     monsterLevel(partyLevel, floor, spread),
	}

	if rng.Float64() < elite {
		prefix := ElitePrefixes[rng.IntN(len(ElitePrefixes))]
		monster.Elite = true
		monster.Name = prefix + " " + monsterSheets[archetype].Name
	}

	return monster
}

// monsterLevel is a standard monster's level: the party's, plus the floor's
// offset, plus its spread, never below 1.
func monsterLevel(partyLevel, floor, spread int) int {
	return max(partyLevel+MonsterLevelPerFloor*(floor-1)+spread, 1)
}

// partyLevel is the highest level among the run's delvers.
func partyLevel(roster []*ecs.Entity) int {
	level := 1
	for _, delver := range roster {
		level = max(level, delverLevel(delver))
	}
	return level
}

// expectedPartyLevel is the highest level among the matched players not seated
// yet, each at the level they will be seated at (FS-K2HKP R18). 1 when there
// are none, as partyLevel is for an empty roster.
func expectedPartyLevel(expected []types.CharacterInPlay) int {
	level := 1
	for _, character := range expected {
		level = max(level, seatLevel(character.Level))
	}
	return level
}

// delverLevel is the one place a delver's level is read for monster scaling:
// the Stats level, which the seat sets from the character in play
// (FS-BDA7X §Requirements 18).
func delverLevel(delver *ecs.Entity) int {
	sc, ok := delver.GetComponent(ecs.ComponentTypeStats)
	if !ok {
		return 1
	}
	return max(sc.(*components.StatsComponent).Level, 1)
}

// delversOf is every delver entity in the run.
func delversOf(entities []*ecs.Entity) []*ecs.Entity {
	var roster []*ecs.Entity
	for _, entity := range entities {
		if entity.HasComponent(ecs.ComponentTypePlayer) {
			roster = append(roster, entity)
		}
	}
	return roster
}

// inPlayPositions is where every delver standing on this floor is, by the same
// rule the party is gathered by (livingParty).
func inPlayPositions(roster []*ecs.Entity) []point {
	var at []point
	for _, transform := range livingParty(roster) {
		at = append(at, point{transform.X, transform.Y})
	}
	return at
}

/**
* mapKeepOut is every area of the floor a monster's body may not overlap: each
* building's whole footprint (its walls, door and the floor they enclose), every
* door, container, switch, escape door and the stairs. A wall of no building, a
* dungeon floor's shell, is kept out by its own rect: grouped under the nil
* house, a dungeon's walls would cover its whole floor.
**/
func mapKeepOut(entities []*ecs.Entity) []PlaceArea {
	var keepOut []PlaceArea
	buildings := map[uuid.UUID]PlaceArea{}

	for _, entity := range entities {
		tc, ok := entity.GetComponent(ecs.ComponentTypeTransform)
		if !ok {
			continue
		}
		at := tc.(*components.TransformComponent)

		if wc, isWall := entity.GetComponent(ecs.ComponentTypeWall); isWall {
			wall := wc.(*components.WallComponent)
			area := PlaceArea{X: at.X, Y: at.Y, W: wall.Width, H: wall.Height}
			if wall.HouseID == uuid.Nil {
				keepOut = append(keepOut, area)
				continue
			}
			if footprint, seen := buildings[wall.HouseID]; seen {
				area = footprint.union(area)
			}
			buildings[wall.HouseID] = area
			continue
		}

		if dc, isDoor := entity.GetComponent(ecs.ComponentTypeDoor); isDoor {
			door := dc.(*components.DoorComponent)
			keepOut = append(keepOut, PlaceArea{X: at.X, Y: at.Y, W: door.Width, H: door.Height})
			continue
		}

		if entity.HasComponent(ecs.ComponentTypeStairs) {
			keepOut = append(keepOut, centredArea(at.X, at.Y, constants.StairsWidthRadius, constants.StairsHeightRadius))
			continue
		}

		// containers, switches and escape doors stand centred on their position
		if entity.HasComponent(ecs.ComponentTypeContainer) ||
			entity.HasComponent(ecs.ComponentTypeSwitch) ||
			entity.HasComponent(ecs.ComponentTypeEscapeDoor) {
			keepOut = append(keepOut, PlaceArea{
				X: at.X - constants.ContainerWidthRadius,
				Y: at.Y - constants.ContainerHeightRadius,
				W: 2 * constants.ContainerWidthRadius,
				H: 2 * constants.ContainerHeightRadius,
			})
		}
	}

	for _, footprint := range buildings {
		keepOut = append(keepOut, footprint)
	}

	return keepOut
}

// union is the smallest area covering both.
func (a PlaceArea) union(b PlaceArea) PlaceArea {
	left, top := math.Min(a.X, b.X), math.Min(a.Y, b.Y)
	right, bottom := math.Max(a.X+a.W, b.X+b.W), math.Max(a.Y+a.H, b.Y+b.H)
	return PlaceArea{X: left, Y: top, W: right - left, H: bottom - top}
}

// overlapsBody reports whether a body of radius r centred at (x, y), taken as
// the square MovementSystem collides, overlaps the area.
func (a PlaceArea) overlapsBody(x, y, r float64) bool {
	return x-r < a.X+a.W && x+r > a.X && y-r < a.Y+a.H && y+r > a.Y
}

type point struct{ x, y float64 }

// spawnArea is the floor as population sees it: its size, what a monster may
// not stand on, who it must keep away from, and the monsters already placed.
type spawnArea struct {
	width, height float64
	keepOut       []PlaceArea
	delvers       []point
	placed        []point
}

// candidate is a point to try anywhere on the map, a body's radius in from its
// edge. A dungeon floor draws from a region's cells instead (placeOnRegion).
func (a *spawnArea) candidate(rng populationRand) (x, y float64) {
	r := constants.PlayerRadius
	return r + rng.Float64()*(a.width-2*r), r + rng.Float64()*(a.height-2*r)
}

// place tries random positions until one is valid, a bounded number of times.
func (a *spawnArea) place(rng populationRand) (x, y float64, ok bool) {
	for range MonsterPlacementAttempts {
		x, y = a.candidate(rng)
		if a.valid(x, y) {
			return x, y, true
		}
	}

	return 0, 0, false
}

/**
* placeFarthest samples a bounded number of random positions and keeps the one
* farthest from its nearest delver among those that fit.
**/
func (a *spawnArea) placeFarthest(rng populationRand, fits func(x, y float64) bool) (x, y float64, ok bool) {
	best := -1.0

	for range DemonPlacementSamples {
		cx, cy := a.candidate(rng)
		if !fits(cx, cy) {
			continue
		}
		if d := a.nearestDelver(cx, cy); d > best {
			best, x, y, ok = d, cx, cy, true
		}
	}

	return x, y, ok
}

// valid is open ground that also keeps clear of every delver.
func (a *spawnArea) valid(x, y float64) bool {
	return a.open(x, y) && a.nearestDelver(x, y) >= MonsterDelverExclusion
}

// open is ground a body may stand on: in no keep-out, on no placed monster.
func (a *spawnArea) open(x, y float64) bool {
	for _, area := range a.keepOut {
		if area.overlapsBody(x, y, constants.PlayerRadius) {
			return false
		}
	}
	for _, m := range a.placed {
		if math.Hypot(x-m.x, y-m.y) < MonsterSpacing {
			return false
		}
	}
	return true
}

// nearestDelver is the distance to the closest delver, +Inf with none.
func (a *spawnArea) nearestDelver(x, y float64) float64 {
	nearest := math.Inf(1)
	for _, d := range a.delvers {
		nearest = math.Min(nearest, math.Hypot(x-d.x, y-d.y))
	}
	return nearest
}
