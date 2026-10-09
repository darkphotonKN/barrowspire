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
* Everything is rolled fresh: count, mix, levels, elites, the demon and
* placement. A monster that finds no valid spot is skipped and logged, never
* overlapped or forced.
*
* The demon comes on top of the standard count (§Requirements 24): always on the
* top floor, otherwise on its rare roll.
*
* The hub is never populated, and neither is a run with nobody in it.
**/
func (s *Session) populateMonsters(floor int, topFloor bool) {
	if s.worldType != types.WorldTypeRun {
		return
	}

	entities := s.EntityManager.GetAllEntities()

	roster := delversOf(entities)
	if len(roster) == 0 {
		slog.Debug("Floor left unpopulated: no delvers placed", "sessionID", s.ID, "floor", floor)
		return
	}

	level := partyLevel(roster)
	area := spawnArea{
		width:   s.mapWidth,
		height:  s.mapHeight,
		keepOut: mapKeepOut(entities),
		delvers: inPlayPositions(roster),
	}

	for _, monster := range rollMonsters(s.spawnRand, level, floor) {
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

	if demon, rolled := rollDemon(s.spawnRand, level, floor, topFloor); rolled {
		s.placeDemon(&area, demon, floor, topFloor)
	}
}

/**
* placeDemon stands the demon at the valid spot farthest from the delvers among
* a bounded sample. A guaranteed demon (the top floor) that finds no spot clear
* of the delvers gets one more sample with the delver exclusion relaxed; if even
* that fails it is skipped loudly, never silently. FS-77AB6 §Edge States
* "Placement exhausted".
**/
func (s *Session) placeDemon(area *spawnArea, demon MonsterConfig, floor int, guaranteed bool) {
	x, y, ok := area.placeFarthest(s.spawnRand, area.valid)
	if !ok && guaranteed {
		slog.Warn("Demon placement relaxed: no spot clear of the delvers",
			"sessionID", s.ID,
			"floor", floor,
			"samples", DemonPlacementSamples,
		)
		x, y, ok = area.placeFarthest(s.spawnRand, area.open)
	}

	if !ok {
		if guaranteed {
			slog.Error("Guaranteed demon skipped: no valid spawn point even relaxed",
				"sessionID", s.ID, "floor", floor, "samples", DemonPlacementSamples)
		} else {
			slog.Warn("Demon skipped: no valid spawn point",
				"sessionID", s.ID, "floor", floor, "samples", DemonPlacementSamples)
		}
		return
	}

	demon.X, demon.Y = x, y
	CreateMonsterEntity(s.EntityManager, demon)
	area.placed = append(area.placed, point{x, y})
}

// rollDemon decides whether this floor has its demon: always on the top floor,
// otherwise on its rare chance. There is never more than one.
func rollDemon(rng populationRand, partyLevel, floor int, topFloor bool) (MonsterConfig, bool) {
	if !topFloor && rng.Float64() >= DemonChance {
		return MonsterConfig{}, false
	}

	return MonsterConfig{
		Archetype: components.MonsterArchetypeDemon,
		Level:     demonLevel(partyLevel, floor),
		Boss:      true,
	}, true
}

// rollMonsters decides a floor's standard monsters: how many, which archetype
// each is, its level, and whether it is an elite. Where they stand is decided
// afterwards.
func rollMonsters(rng populationRand, partyLevel, floor int) []MonsterConfig {
	count := MonsterCountMin + rng.IntN(MonsterCountMax-MonsterCountMin+1)
	troll := trollShare(floor)
	elite := eliteChance(floor)

	monsters := make([]MonsterConfig, 0, count)
	for range count {
		archetype := components.MonsterArchetypeGhoul
		if rng.Float64() < troll {
			archetype = components.MonsterArchetypeTroll
		}

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

		monsters = append(monsters, monster)
	}

	return monsters
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

// inPlayPositions is where every delver standing on this floor is. The escaped
// and the dead left on an earlier floor are not on it.
func inPlayPositions(roster []*ecs.Entity) []point {
	var at []point
	for _, delver := range roster {
		pc, _ := delver.GetComponent(ecs.ComponentTypePlayer)
		player := pc.(*components.PlayerComponent)
		if player.Escape || player.LeftBehind {
			continue
		}

		tc, ok := delver.GetComponent(ecs.ComponentTypeTransform)
		if !ok {
			continue
		}
		transform := tc.(*components.TransformComponent)
		at = append(at, point{transform.X, transform.Y})
	}
	return at
}

/**
* mapKeepOut is every area of the floor a monster's body may not overlap: each
* building's whole footprint (its walls, door and the floor they enclose), every
* door, container, switch, escape door and the stairs.
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

// place tries random positions until one is valid, a bounded number of times.
func (a *spawnArea) place(rng populationRand) (x, y float64, ok bool) {
	r := constants.PlayerRadius

	for range MonsterPlacementAttempts {
		x = r + rng.Float64()*(a.width-2*r)
		y = r + rng.Float64()*(a.height-2*r)
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
	r := constants.PlayerRadius
	best := -1.0

	for range DemonPlacementSamples {
		cx := r + rng.Float64()*(a.width-2*r)
		cy := r + rng.Float64()*(a.height-2*r)
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
