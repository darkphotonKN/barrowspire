package game

import (
	"slices"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/levelgen"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// floor1Builds is how many floor-1 builds the population's property tests
// run (FS-KE075 §Acceptance Criteria: "Across 1,000 floor-1 builds").
const floor1Builds = 1000

// delverPoints is where each seated delver stands.
func delverPoints(t *testing.T, s *Session, ids []uuid.UUID) []point {
	t.Helper()
	var at []point
	for _, id := range ids {
		tr := transformOf(t, delverEntity(t, s, id))
		at = append(at, point{tr.X, tr.Y})
	}
	return at
}

// Floor 1 holds 45–70 monsters besides a demon, none in the start room and
// none within 350 px of a delver. FS-KE075 §C R18–19.
func TestDungeonPopulation_TotalAndStartRoom(t *testing.T) {
	for seed := uint64(1); seed <= floor1Builds; seed++ {
		s, ids := dungeonRun(t, seed, 4, 0)
		require.NotNil(t, s.dungeon, "seed %d: floor 1 is a dungeon floor", seed)
		d := s.dungeon
		delvers := delverPoints(t, s, ids)

		standard := standardMonstersIn(s)
		assert.GreaterOrEqual(t, len(standard), DungeonMonstersMin, "seed %d: too few monsters", seed)
		assert.LessOrEqual(t, len(standard), DungeonMonstersMax, "seed %d: too many monsters", seed)

		for _, m := range monstersIn(s) {
			at := transformOf(t, m)
			assert.NotEqual(t, d.layout.Roles.Start, roomOf(d, at.X, at.Y), "seed %d: a monster in the start room", seed)
			for _, p := range delvers {
				assert.GreaterOrEqual(t, dist(at.X, at.Y, p.x, p.y), MonsterDelverExclusion, "seed %d: a monster by a delver", seed)
			}
		}
	}
}

// floor1Monster is one monster of a floor-1 build, where it stands and as what.
type floor1Monster struct {
	monster *components.MonsterComponent
	at      point
	// room is the room index it stands in, -1 off every room
	room int
	// region is the region it stands in
	region int
}

// floor1Monsters is every monster of a built floor 1.
func floor1Monsters(t *testing.T, s *Session) []floor1Monster {
	t.Helper()
	var out []floor1Monster
	for _, m := range monstersIn(s) {
		tr := transformOf(t, m)
		out = append(out, floor1Monster{
			monster: monsterOf(m),
			at:      point{tr.X, tr.Y},
			room:    roomOf(s.dungeon, tr.X, tr.Y),
			region:  s.dungeon.regionAt(tr.X, tr.Y),
		})
	}
	return out
}

// eligibleHall is whether room holds a hall pack: a hall that is neither the
// start nor a treasure room.
func eligibleHall(d *dungeonFloor, room int) bool {
	return d.isHall(room) && room != d.layout.Roles.Start && !slices.Contains(d.layout.Roles.Treasure, room)
}

// Every hall that is not the start or a treasure room holds one troll and 2–4
// ghouls, each within 160 px of the troll. FS-KE075 §C R18.
func TestDungeonPopulation_EveryHallHoldsATrollPack(t *testing.T) {
	halls := 0
	for seed := uint64(1); seed <= floor1Builds; seed++ {
		s, _ := dungeonRun(t, seed, 4, 0)
		d := s.dungeon
		monsters := floor1Monsters(t, s)

		for room := range d.layout.Rooms {
			if !eligibleHall(d, room) {
				continue
			}
			halls++
			var trolls, ghouls []point
			for _, m := range monsters {
				if m.room != room || m.monster.Boss {
					continue
				}
				switch m.monster.Archetype {
				case components.MonsterArchetypeTroll:
					trolls = append(trolls, m.at)
				case components.MonsterArchetypeGhoul:
					ghouls = append(ghouls, m.at)
				}
			}
			require.Len(t, trolls, 1, "seed %d room %d: a hall holds one troll", seed, room)
			assert.GreaterOrEqual(t, len(ghouls), HallPackGhoulsMin, "seed %d room %d", seed, room)
			assert.LessOrEqual(t, len(ghouls), HallPackGhoulsMax, "seed %d room %d", seed, room)
			for _, g := range ghouls {
				assert.LessOrEqual(t, dist(g.x, g.y, trolls[0].x, trolls[0].y), HallPackRadius,
					"seed %d room %d: a ghoul strayed from its troll", seed, room)
			}
		}
	}
	require.NotZero(t, halls, "the builds hold halls to check")
}

// Every treasure room is guarded by one to three monsters, every one an
// elite; one alone or a pack of 2–3 about half the time each. FS-KE075 §C R18.
func TestDungeonPopulation_TreasureGuardsAreElite(t *testing.T) {
	alone, packs := 0, 0
	for seed := uint64(1); seed <= floor1Builds; seed++ {
		s, _ := dungeonRun(t, seed, 4, 0)
		monsters := floor1Monsters(t, s)

		for _, room := range s.dungeon.layout.Roles.Treasure {
			guards := 0
			for _, m := range monsters {
				if m.room != room || m.monster.Boss {
					continue
				}
				guards++
				assert.True(t, m.monster.Elite, "seed %d room %d: every treasure guard is elite", seed, room)
			}
			assert.GreaterOrEqual(t, guards, 1, "seed %d room %d: a treasure room is guarded", seed, room)
			assert.LessOrEqual(t, guards, TreasureGuardPackMax, "seed %d room %d", seed, room)
			if guards == 1 {
				alone++
			} else {
				packs++
			}
		}
	}
	share := float64(packs) / float64(alone+packs)
	assert.InDelta(t, TreasureGuardPackShare, share, 0.05, "a treasure room holds a pack about half the time")
}

// The corridors hold 4–8 monsters in all, never two in one segment.
// FS-KE075 §C R18.
func TestDungeonPopulation_CorridorsHoldFourToEightOnePerSegment(t *testing.T) {
	for seed := uint64(1); seed <= floor1Builds; seed++ {
		s, _ := dungeonRun(t, seed, 4, 0)
		d := s.dungeon

		segments := map[int]int{}
		for _, m := range floor1Monsters(t, s) {
			if m.region != 0 && d.layout.Regions[m.region-1].Kind == levelgen.RegionCorridor {
				segments[m.region]++
			}
		}
		total := 0
		for segment, n := range segments {
			assert.Equal(t, 1, n, "seed %d: segment %d holds more than one monster", seed, segment)
			total += n
		}
		assert.GreaterOrEqual(t, total, CorridorMonstersMin, "seed %d", seed)
		assert.LessOrEqual(t, total, CorridorMonstersMax, "seed %d", seed)
	}
}

// Every monster stands wholly on one region's walkable cells, off every
// doorway, clear of containers and interactables, and ≥ 60 px from every
// other monster. FS-KE075 §C R20.
func TestDungeonPopulation_OffDoorwaysClearAndApart(t *testing.T) {
	r := constants.PlayerRadius
	for seed := uint64(1); seed <= floor1Builds; seed++ {
		s, _ := dungeonRun(t, seed, 4, 0)
		d := s.dungeon
		keepOut := mapKeepOut(s.EntityManager.GetAllEntities())
		monsters := floor1Monsters(t, s)

		for i, m := range monsters {
			require.NotZero(t, m.region, "seed %d: monster %d stands on rock", seed, i)
			assert.True(t, d.stands(centredArea(m.at.x, m.at.y, r, r), m.region, offDoorways),
				"seed %d: monster %d is not wholly on its region off the doorways", seed, i)
			for _, area := range keepOut {
				assert.False(t, area.overlapsBody(m.at.x, m.at.y, r),
					"seed %d: monster %d overlaps %+v", seed, i, area)
			}
			for _, o := range monsters[i+1:] {
				assert.GreaterOrEqual(t, dist(m.at.x, m.at.y, o.at.x, o.at.y), MonsterSpacing, "seed %d", seed)
			}
		}
	}
}

// Every monster that is not a treasure guard keeps the floor's elite chance,
// and the rolled ones, in ordinary rooms and corridors, the floor's troll
// share. FS-KE075 §C R19.
func TestDungeonPopulation_EliteChanceAndTrollShareUnchanged(t *testing.T) {
	var standard, elites, rolled, trolls int
	for seed := uint64(1); seed <= floor1Builds; seed++ {
		s, _ := dungeonRun(t, seed, 4, 0)
		d := s.dungeon
		for _, m := range floor1Monsters(t, s) {
			if m.monster.Boss || slices.Contains(d.layout.Roles.Treasure, m.room) {
				continue
			}
			standard++
			if m.monster.Elite {
				elites++
			}
			if m.room == -1 || !eligibleHall(d, m.room) {
				rolled++
				if m.monster.Archetype == components.MonsterArchetypeTroll {
					trolls++
				}
			}
		}
	}
	assert.InDelta(t, eliteChance(firstFloor), float64(elites)/float64(standard), 0.006)
	assert.InDelta(t, trollShare(firstFloor), float64(trolls)/float64(rolled), 0.015)
}

// A demon goes in the room farthest from the start by walking distance, never
// the start room. FS-KE075 §C R19.
func TestPlaceDungeonDemon_TheFarthestRoom(t *testing.T) {
	for seed := uint64(1); seed <= 100; seed++ {
		s, _ := dungeonRun(t, seed, 4, 0)
		d := s.dungeon
		entities := s.EntityManager.GetAllEntities()
		area := spawnArea{
			width: s.mapWidth, height: s.mapHeight,
			keepOut: mapKeepOut(entities),
			delvers: inPlayPositions(delversOf(entities)),
		}
		for _, m := range monstersIn(s) {
			at := transformOf(t, m)
			area.placed = append(area.placed, point{at.X, at.Y})
		}

		s.placeDungeonDemon(d, &area, MonsterConfig{Archetype: components.MonsterArchetypeDemon, Level: 3, Boss: true}, firstFloor, demonRolled)

		var demon *floor1Monster
		for _, m := range floor1Monsters(t, s) {
			if m.monster.Boss {
				demon = &m
			}
		}
		require.NotNil(t, demon, "seed %d: the demon was placed", seed)
		require.NotEqual(t, -1, demon.room, "seed %d: the demon stands in a room", seed)
		assert.NotEqual(t, d.layout.Roles.Start, demon.room, "seed %d", seed)
		farthest := 0
		for room, rm := range d.layout.Rooms {
			if room != d.layout.Roles.Start {
				farthest = max(farthest, rm.Distance)
			}
		}
		assert.Equal(t, farthest, d.layout.Rooms[demon.room].Distance, "seed %d: the demon is in the farthest room", seed)
	}
}
