package game

import (
	"slices"
	"strings"
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

// Floor 1 holds 30–45 monsters besides a demon, none in the start room and
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

// Every hall that is not the start or a treasure room holds one troll and 1–3
// ghouls, each within 160 px of the troll. On floor 1 one of those ghouls is a
// Bone Archer, rolled for level and elite as the ghoul it replaces.
// FS-KE075 §C R18; FS-B4SG9 §B R16, §Edge States "Elite hall archer".
func TestDungeonPopulation_EveryHallHoldsATrollPack(t *testing.T) {
	halls, eliteArchers := 0, 0
	for seed := uint64(1); seed <= floor1Builds; seed++ {
		s, _ := dungeonRun(t, seed, 4, 0)
		d := s.dungeon
		monsters := floor1Monsters(t, s)

		for room := range d.layout.Rooms {
			if !eligibleHall(d, room) {
				continue
			}
			halls++
			var trolls, ghouls, archers []point
			for _, m := range monsters {
				if m.room != room || m.monster.Boss {
					continue
				}
				switch m.monster.Archetype {
				case components.MonsterArchetypeTroll:
					trolls = append(trolls, m.at)
				case components.MonsterArchetypeGhoul:
					ghouls = append(ghouls, m.at)
				case components.MonsterArchetypeBoneArcher:
					archers = append(archers, m.at)
					if m.monster.Elite {
						eliteArchers++
						assert.True(t, strings.HasSuffix(m.monster.Name, " Bone Archer"), "seed %d room %d: %q", seed, room, m.monster.Name)
					}
				default:
					assert.Failf(t, "a hall pack is a troll, a Bone Archer and ghouls", "seed %d room %d: %s", seed, room, m.monster.Archetype)
				}
			}
			require.Len(t, trolls, 1, "seed %d room %d: a hall holds one troll", seed, room)
			assert.Len(t, archers, HallPackBoneArchers, "seed %d room %d: a floor-1 hall pack holds one Bone Archer", seed, room)
			// the archer takes a ghoul's place: the pack's size is unchanged
			assert.GreaterOrEqual(t, len(ghouls)+len(archers), HallPackGhoulsMin, "seed %d room %d", seed, room)
			assert.LessOrEqual(t, len(ghouls)+len(archers), HallPackGhoulsMax, "seed %d room %d", seed, room)
			for _, g := range append(ghouls, archers...) {
				assert.LessOrEqual(t, dist(g.x, g.y, trolls[0].x, trolls[0].y), HallPackRadius,
					"seed %d room %d: a ghoul strayed from its troll", seed, room)
			}
		}
	}
	require.NotZero(t, halls, "the builds hold halls to check")
	assert.NotZero(t, eliteArchers, "a hall's archer is promoted at the floor's elite chance")
}

// windowsOnly is keep-outs over the whole map but two square windows of side
// w, on one row from top, their left edges at left and right: only a body
// centred in a window may stand. Each holds one monster (its diagonal is under
// MonsterSpacing), and any point of one is within HallPackRadius of any point
// of the other.
func windowsOnly(width, height, left, right, top, w float64) []PlaceArea {
	r := constants.PlayerRadius
	return []PlaceArea{
		{X: -r, Y: -r, W: left, H: height + 2*r},                             // left of the first
		{X: left + w + r, Y: -r, W: right - left - w - 2*r, H: height + 2*r}, // between them
		{X: right + w + r, Y: -r, W: width, H: height + 2*r},                 // right of the second
		{X: -r, Y: -r, W: width + 2*r, H: top},                               // above
		{X: -r, Y: top + w + r, W: width + 2*r, H: height},                   // below
	}
}

// A hall pack that fits only its troll and one other member keeps the Bone
// Archer: the archer is the first of the pack's ghouls, on every dungeon floor.
// FS-B4SG9 §B R14, R16.
func TestHallPack_AShortPackKeepsItsArcher(t *testing.T) {
	tests := []struct {
		name  string
		depth int
		want  components.MonsterArchetype
	}{
		{"floor 1 keeps its archer", firstFloor, components.MonsterArchetypeBoneArcher},
		{"floor 2 keeps its archer", firstFloor + 1, components.MonsterArchetypeBoneArcher},
		{"the top floor keeps its archer", MasterSpireHeight, components.MonsterArchetypeBoneArcher},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			short, trollOnly := 0, 0
			for seed := uint64(1); seed <= 60; seed++ {
				s, _ := dungeonRun(t, seed, 1, 0)
				d := s.dungeon
				hall := -1
				for room := range d.layout.Rooms {
					if eligibleHall(d, room) {
						hall = room
						break
					}
				}
				if hall == -1 {
					continue
				}
				c := d.roomCentre(hall)
				const w = 40.0
				area := spawnArea{
					width: s.mapWidth, height: s.mapHeight,
					keepOut: windowsOnly(s.mapWidth, s.mapHeight, c.x-70, c.x+30, c.y-w/2, w),
				}
				p := &dungeonPopulation{session: s.ID, floor: d, area: &area, rng: seededSpawns(seed), level: 1, depth: tt.depth}

				p.hallPack(hall)

				require.NotEmpty(t, p.spawns, "seed %d: the troll stands", seed)
				require.LessOrEqual(t, len(p.spawns), 2, "seed %d: the windows hold two", seed)
				assert.Equal(t, components.MonsterArchetypeTroll, p.spawns[0].monster.Archetype, "seed %d", seed)
				if len(p.spawns) == 1 {
					trollOnly++
					continue
				}
				short++
				assert.Equal(t, tt.want, p.spawns[1].monster.Archetype, "seed %d: the member a short pack keeps", seed)
				assert.Equal(t, spawnHallPack, p.spawns[1].role, "seed %d", seed)
			}
			require.NotZero(t, short, "the seeds hold short packs to check")
			t.Logf("short packs %d, troll alone %d", short, trollOnly)
		})
	}
}

// ordinaryRoom is whether room holds rolled singles: not the start, a
// treasure room or a hall that holds a pack, and not a corridor (-1).
func ordinaryRoom(d *dungeonFloor, room int) bool {
	return room != -1 && room != d.layout.Roles.Start && !slices.Contains(d.layout.Roles.Treasure, room) && !eligibleHall(d, room)
}

// On floor 1, about 1 in 4 of the ordinary rooms' ghoul rolls, top-ups
// included, are Bone Archers; the troll share and the Barrow Thrall and Spire
// Wraith shares are untouched. FS-B4SG9 §B R15.
func TestDungeonPopulation_Floor1RoomGhoulsAreBoneArchersAtTheirShare(t *testing.T) {
	counts := map[components.MonsterArchetype]int{}
	all := 0
	for seed := uint64(1); seed <= floor1Builds; seed++ {
		s, _ := dungeonRun(t, seed, 4, 0)
		for _, m := range floor1Monsters(t, s) {
			if m.monster.Boss || !ordinaryRoom(s.dungeon, m.room) {
				continue
			}
			counts[m.monster.Archetype]++
			all++
		}
	}

	ghoulRolls := float64(counts[components.MonsterArchetypeGhoul] + counts[components.MonsterArchetypeBoneArcher])
	nonTroll := float64(all - counts[components.MonsterArchetypeTroll])
	require.Positive(t, ghoulRolls)
	assert.InDelta(t, BoneArcherRoomShare, float64(counts[components.MonsterArchetypeBoneArcher])/ghoulRolls, 0.02, "the archers' share of ghoul rolls")
	assert.InDelta(t, trollShare(firstFloor), float64(counts[components.MonsterArchetypeTroll])/float64(all), 0.02, "the troll share")
	assert.InDelta(t, 0.70, ghoulRolls/nonTroll, 0.02, "the ghoul rolls' share")
	assert.InDelta(t, 0.20, float64(counts[components.MonsterArchetypeBarrowThrall])/nonTroll, 0.02, "the Barrow Thrall share")
	assert.InDelta(t, 0.10, float64(counts[components.MonsterArchetypeSpireWraith])/nonTroll, 0.02, "the Spire Wraith share")
	for archetype := range counts {
		assert.Contains(t, []components.MonsterArchetype{
			components.MonsterArchetypeTroll, components.MonsterArchetypeGhoul, components.MonsterArchetypeBoneArcher,
			components.MonsterArchetypeBarrowThrall, components.MonsterArchetypeSpireWraith,
		}, archetype, "nothing else stands in an ordinary room")
	}
}

// On floor 1 a Bone Archer stands only in an ordinary room or a hall's pack:
// never in a corridor, never among a treasure room's guards. FS-B4SG9 §B R17.
func TestDungeonPopulation_NoBoneArcherInACorridorOrAmongTreasureGuards(t *testing.T) {
	archers := 0
	for seed := uint64(1); seed <= floor1Builds; seed++ {
		s, _ := dungeonRun(t, seed, 4, 0)
		d := s.dungeon
		for _, m := range floor1Monsters(t, s) {
			if m.monster.Archetype != components.MonsterArchetypeBoneArcher {
				continue
			}
			archers++
			assert.NotEqual(t, -1, m.room, "seed %d: a Bone Archer in a corridor", seed)
			assert.NotContains(t, d.layout.Roles.Treasure, m.room, "seed %d: a Bone Archer guards a treasure room", seed)
			assert.False(t, m.monster.Boss, "seed %d", seed)
		}
	}
	require.NotZero(t, archers, "floor 1 holds Bone Archers to check")
}

// spireFloor is a run whose Spire is a Master Spire, so its top floor is in a
// sweep too, with depth just built, one delver of level 2 standing far from
// the start.
func spireFloor(t *testing.T, seed uint64, depth int) *Session {
	t.Helper()
	s := rosterOnRun(t, seed, delverAt{level: 2, x: 100, y: 100})
	currentFloor(t, s).Count = MasterSpireHeight
	s.buildFloor(depth, nil)
	return s
}

// Every floor above the first, the top floor included, places Bone Archers as
// floor 1 does: about 1 in 4 of the ordinary rooms' ghoul rolls, the first
// ghoul of every hall pack, none in a corridor or among a treasure room's
// guards; the floor's troll share and the Barrow Thrall and Spire Wraith
// shares are untouched. FS-B4SG9 §B R14–R17 (owner decision 2026-11-12).
func TestBuildFloor_BoneArchersOnEveryDungeonFloorAsOnFloor1(t *testing.T) {
	const seeds = 120
	counts := map[components.MonsterArchetype]int{}
	all, packs := 0, 0
	for depth := firstFloor + 1; depth <= MasterSpireHeight; depth++ {
		trolls, rolled := 0, 0
		for seed := uint64(1); seed <= seeds; seed++ {
			s := spireFloor(t, seed, depth)
			d := s.dungeon
			require.NotNil(t, d, "depth %d seed %d: a Spire floor is a dungeon", depth, seed)

			hallMembers := map[int]map[components.MonsterArchetype]int{}
			for _, m := range floor1Monsters(t, s) {
				if m.monster.Boss {
					continue
				}
				archer := m.monster.Archetype == components.MonsterArchetypeBoneArcher
				switch {
				case m.room == -1:
					assert.False(t, archer, "depth %d seed %d: a Bone Archer in a corridor", depth, seed)
				case slices.Contains(d.layout.Roles.Treasure, m.room):
					assert.False(t, archer, "depth %d seed %d: a Bone Archer guards a treasure room", depth, seed)
				case eligibleHall(d, m.room):
					if hallMembers[m.room] == nil {
						hallMembers[m.room] = map[components.MonsterArchetype]int{}
					}
					hallMembers[m.room][m.monster.Archetype]++
				default:
					counts[m.monster.Archetype]++
					all++
					rolled++
					if m.monster.Archetype == components.MonsterArchetypeTroll {
						trolls++
					}
				}
			}

			for room, members := range hallMembers {
				ghoulSlots := members[components.MonsterArchetypeGhoul] + members[components.MonsterArchetypeBoneArcher]
				if members[components.MonsterArchetypeTroll] == 0 || ghoulSlots == 0 {
					continue
				}
				packs++
				assert.Equal(t, HallPackBoneArchers, members[components.MonsterArchetypeBoneArcher],
					"depth %d seed %d room %d: a hall pack holds one Bone Archer", depth, seed, room)
				assert.LessOrEqual(t, ghoulSlots, HallPackGhoulsMax, "depth %d seed %d room %d: the pack's size is unchanged", depth, seed, room)
			}
		}
		require.Positive(t, rolled, "depth %d", depth)
		assert.InDelta(t, trollShare(depth), float64(trolls)/float64(rolled), 0.03, "depth %d: the floor's troll share", depth)
	}

	require.NotZero(t, packs, "the floors hold hall packs to check")
	ghoulRolls := float64(counts[components.MonsterArchetypeGhoul] + counts[components.MonsterArchetypeBoneArcher])
	nonTroll := float64(all - counts[components.MonsterArchetypeTroll])
	require.Positive(t, ghoulRolls)
	assert.InDelta(t, BoneArcherRoomShare, float64(counts[components.MonsterArchetypeBoneArcher])/ghoulRolls, 0.02, "the archers' share of ghoul rolls")
	assert.InDelta(t, 0.70, ghoulRolls/nonTroll, 0.02, "the ghoul rolls' share")
	assert.InDelta(t, 0.20, float64(counts[components.MonsterArchetypeBarrowThrall])/nonTroll, 0.02, "the Barrow Thrall share")
	assert.InDelta(t, 0.10, float64(counts[components.MonsterArchetypeSpireWraith])/nonTroll, 0.02, "the Spire Wraith share")
}

// A floor of buildings a failed generation leaves holds no Bone Archer, floor
// 1 or any floor above: it never reaches the dungeon population. FS-B4SG9 §B
// R14, §Edge States "A floor of buildings, any depth".
func TestBuildFloor_NoBoneArcherOnAFloorOfBuildings(t *testing.T) {
	for _, depth := range []int{firstFloor, firstFloor + 1, MasterSpireHeight} {
		for seed := uint64(1); seed <= 40; seed++ {
			s := rosterOnRun(t, seed, delverAt{level: 2, x: 100, y: 100})
			currentFloor(t, s).Count = MasterSpireHeight
			failGeneration(s)
			s.buildFloor(depth, nil)
			require.Nil(t, s.dungeon, "depth %d seed %d: the floor fell back to buildings", depth, seed)
			require.NotEmpty(t, monstersIn(s), "depth %d seed %d", depth, seed)
			for _, m := range monstersIn(s) {
				assert.NotEqual(t, components.MonsterArchetypeBoneArcher, monsterOf(m).Archetype, "fallback depth %d seed %d", depth, seed)
			}
		}
	}
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

// A treasure guard draws through the same roll as any rolled monster, so the
// tower monsters stand guard at their shares. FS-M8CSE §D R18.
func TestDungeonPopulation_TreasureGuardsRollTheSpiresMix(t *testing.T) {
	counts := map[components.MonsterArchetype]int{}
	for seed := uint64(1); seed <= 300; seed++ {
		s, _ := dungeonRun(t, seed, 4, 0)
		monsters := floor1Monsters(t, s)
		for _, room := range s.dungeon.layout.Roles.Treasure {
			for _, m := range monsters {
				if m.room == room && !m.monster.Boss {
					counts[m.monster.Archetype]++
				}
			}
		}
	}

	nonTroll := float64(counts[components.MonsterArchetypeGhoul] + counts[components.MonsterArchetypeBarrowThrall] + counts[components.MonsterArchetypeSpireWraith])
	require.Positive(t, nonTroll)
	assert.InDelta(t, 0.20, float64(counts[components.MonsterArchetypeBarrowThrall])/nonTroll, 0.05)
	assert.InDelta(t, 0.10, float64(counts[components.MonsterArchetypeSpireWraith])/nonTroll, 0.05)
}

// The corridors hold 3–5 monsters in all, never two in one segment. Fewer
// only where holding the floor's total trimmed past every ordinary room's
// monster into the corridors. FS-KE075 §C R18 (values FS-C8VM7 §I R49).
func TestDungeonPopulation_CorridorsHoldTheirCountOnePerSegment(t *testing.T) {
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
		assert.LessOrEqual(t, total, CorridorMonstersMax, "seed %d", seed)
		if total < CorridorMonstersMin {
			assert.Len(t, standardMonstersIn(s), DungeonMonstersMax, "seed %d: corridors short of their count only when the total is trimmed", seed)
			for _, m := range floor1Monsters(t, s) {
				ordinary := m.room >= 0 && m.room != d.layout.Roles.Start &&
					!slices.Contains(d.layout.Roles.Treasure, m.room) && !eligibleHall(d, m.room)
				assert.False(t, ordinary && !m.monster.Boss, "seed %d: corridors trimmed before an ordinary room", seed)
			}
		}
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
			if m.monster.Archetype == components.MonsterArchetypeDemon { // the green one: a floor may hold a blood demon too (FS-VHGE7)
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

// roomsAt is a floor of rooms at these walking distances, room 0 the start.
func roomsAt(distances ...int) *dungeonFloor {
	layout := levelgen.DungeonLayout{Roles: levelgen.Roles{Start: 0}}
	for i, distance := range distances {
		layout.Rooms = append(layout.Rooms, levelgen.Room{Region: i + 1, Distance: distance})
	}
	return &dungeonFloor{layout: layout}
}

// The blood demon searches from the second-farthest room on down, never the
// start room or the demon's: literally the second-farthest, whether or not
// the demon took the farthest. FS-VHGE7 §A R10; §Edge States "Green demon
// skipped", "Dungeon with only two rooms".
func TestBloodDemonRooms_FromTheSecondFarthestSkippingStartAndDemon(t *testing.T) {
	tests := []struct {
		name      string
		floor     *dungeonFloor
		demonRoom int
		want      []int
	}{
		{"the demon in the farthest", roomsAt(0, 10, 7, 4), 1, []int{2, 3}},
		{"the demon fell back to the second-farthest", roomsAt(0, 10, 7, 4), 2, []int{3}},
		{"no demon still starts at the second-farthest", roomsAt(0, 10, 7, 4), -1, []int{2, 3}},
		{"farthest first by distance, not by index", roomsAt(0, 4, 10, 7), 2, []int{3, 1}},
		{"only two rooms leaves the start, which is excluded", roomsAt(0, 6), 1, nil},
		{"only two rooms and no demon", roomsAt(0, 6), -1, nil},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, tt.floor.bloodDemonRooms(tt.demonRoom))
		})
	}
}

// populationArea is the spawn area of a built floor as population leaves it:
// its keep-outs, its delvers, and every monster already placed.
func populationArea(t *testing.T, s *Session) spawnArea {
	t.Helper()
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
	return area
}

// On a dungeon floor the blood demon never shares the demon's room or the
// start room, and takes the first room of its search with a valid spot.
// FS-VHGE7 §A R10; §Edge States "Both demons on one floor".
func TestPlaceDungeonBloodDemon_NeverSharesTheDemonsRoom(t *testing.T) {
	forceBloodDemon(t, 0) // the built floor brings none of its own
	for seed := uint64(1); seed <= 100; seed++ {
		s, ids := dungeonRun(t, seed, 4, 0)
		d := s.dungeon
		area := populationArea(t, s)

		demonRoom, placed := s.placeDungeonDemon(d, &area, MonsterConfig{Archetype: components.MonsterArchetypeDemon, Level: 3, Boss: true}, firstFloor, demonRolled)
		require.True(t, placed, "seed %d", seed)
		s.placeDungeonBloodDemon(d, &area, MonsterConfig{Archetype: components.MonsterArchetypeBloodDemon, Level: 4, Boss: true}, firstFloor, demonRoom)

		var green, blood []floor1Monster
		for _, m := range floor1Monsters(t, s) {
			switch m.monster.Archetype {
			case components.MonsterArchetypeDemon:
				green = append(green, m)
			case components.MonsterArchetypeBloodDemon:
				blood = append(blood, m)
			}
		}
		require.NotEmpty(t, green, "seed %d", seed)
		require.Len(t, blood, 1, "seed %d: the blood demon was placed", seed)
		greenRooms := []int{}
		for _, g := range green {
			greenRooms = append(greenRooms, g.room)
		}
		assert.Contains(t, greenRooms, demonRoom, "seed %d: placeDungeonDemon reports the room it used", seed)

		at := blood[0]
		assert.NotEqual(t, d.layout.Roles.Start, at.room, "seed %d", seed)
		assert.NotEqual(t, demonRoom, at.room, "seed %d", seed)
		assert.Equal(t, d.bloodDemonRooms(demonRoom)[0], at.room, "seed %d: the first room of its search", seed)
		for _, p := range delverPoints(t, s, ids) {
			assert.GreaterOrEqual(t, dist(at.at.x, at.at.y, p.x, p.y), MonsterDelverExclusion, "seed %d", seed)
		}
	}
}

// A blood demon with no room to stand in is absent and a warning is logged,
// never an error. FS-VHGE7 §A R10; §Edge States "No spot for the blood demon".
func TestPlaceDungeonBloodDemon_NoValidRoomIsSkippedWithAWarning(t *testing.T) {
	forceBloodDemon(t, 0)
	s, _ := dungeonRun(t, 3, 4, 0)
	area := populationArea(t, s)
	// nowhere on the floor is open ground
	area.keepOut = append(area.keepOut, PlaceArea{X: 0, Y: 0, W: s.mapWidth, H: s.mapHeight})
	logs := capturedLog(t)

	s.placeDungeonBloodDemon(s.dungeon, &area, MonsterConfig{Archetype: components.MonsterArchetypeBloodDemon, Level: 4, Boss: true}, firstFloor, -1)

	for _, m := range monstersIn(s) {
		assert.NotEqual(t, components.MonsterArchetypeBloodDemon, monsterOf(m).Archetype)
	}
	assert.Contains(t, logs.String(), `"level":"WARN"`)
	assert.Contains(t, logs.String(), "blood_demon")
	assert.NotContains(t, logs.String(), `"level":"ERROR"`)
}

// A dungeon floor that rolls its blood demon stands it outside the start room
// and the demon's room, clear of every delver and of the spots kept for those
// still connecting. FS-VHGE7 §A R8, R10; §Edge States "Party still connecting".
func TestPopulateMonsters_DungeonFloorPlacesARolledBloodDemon(t *testing.T) {
	forceBloodDemon(t, 1)
	for seed := uint64(1); seed <= 30; seed++ {
		s, _ := dungeonRun(t, seed, 2, 2)
		d := s.dungeon
		keptClear := s.arrivalSlotPositions()

		var blood []floor1Monster
		demonRooms := map[int]bool{}
		for _, m := range floor1Monsters(t, s) {
			switch m.monster.Archetype {
			case components.MonsterArchetypeBloodDemon:
				blood = append(blood, m)
			case components.MonsterArchetypeDemon:
				demonRooms[m.room] = true
			}
		}
		require.Len(t, blood, 1, "seed %d", seed)
		at := blood[0]
		assert.True(t, at.monster.Boss)
		assert.False(t, at.monster.Elite)
		assert.NotEqual(t, d.layout.Roles.Start, at.room, "seed %d", seed)
		assert.False(t, demonRooms[at.room], "seed %d: the blood demon shares the demon's room", seed)
		for _, p := range keptClear {
			assert.GreaterOrEqual(t, dist(at.at.x, at.at.y, p.x, p.y), MonsterDelverExclusion, "seed %d", seed)
		}
	}
}

// The floor's population is FS-C8VM7 §I R49's tune of FS-KE075 §C: 30-45 a
// floor, hall packs of 1-3, ordinary rooms 0-2 topped up to 3, corridors 3-5;
// the treasure guards as they were.
func TestDungeonPopulation_ThinnerFloorsTune(t *testing.T) {
	assert.Equal(t, []int{30, 45}, []int{DungeonMonstersMin, DungeonMonstersMax})
	assert.Equal(t, []int{1, 3}, []int{HallPackGhoulsMin, HallPackGhoulsMax})
	assert.Equal(t, []int{0, 2, 3}, []int{RoomMonstersMin, RoomMonstersMax, RoomMonstersTopUpMax})
	assert.Equal(t, []int{3, 5}, []int{CorridorMonstersMin, CorridorMonstersMax})
	assert.Equal(t, 0.5, TreasureGuardPackShare)
	assert.Equal(t, []int{2, 3}, []int{TreasureGuardPackMin, TreasureGuardPackMax})
}

// No ordinary room holds more than a top-up allows. FS-KE075 §C R18.
func TestDungeonPopulation_OrdinaryRoomsHoldAtMostTheTopUpCap(t *testing.T) {
	for seed := uint64(1); seed <= floor1Builds; seed++ {
		s, _ := dungeonRun(t, seed, 4, 0)
		d := s.dungeon
		inRoom := map[int]int{}
		for _, m := range floor1Monsters(t, s) {
			if m.room < 0 || m.monster.Boss || m.room == d.layout.Roles.Start ||
				slices.Contains(d.layout.Roles.Treasure, m.room) || eligibleHall(d, m.room) {
				continue
			}
			inRoom[m.room]++
		}
		for room, n := range inRoom {
			assert.LessOrEqual(t, n, RoomMonstersTopUpMax, "seed %d room %d", seed, room)
		}
	}
}
