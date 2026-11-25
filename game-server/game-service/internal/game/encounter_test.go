package game

import (
	"cmp"
	"math"
	"math/rand/v2"
	"slices"
	"strings"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/levelgen"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// encounterRun is a seeded run of height floors for delvers, climbed to floor
// 2, every eligible floor's encounter forced to kind, no merchant, fountain or
// hallowed altar to crowd it.
func encounterRun(t *testing.T, seed uint64, delvers, height int, kind components.EncounterKind) (*Session, []uuid.UUID) {
	t.Helper()
	s, ids := dungeonRun(t, seed, delvers, 0, withTuning(func(t *floorTuning) {
		t.forcedEncounterKind = kind
		t.merchantFloorChance, t.fountainFloorChance, t.hallowedAltarRunChance = 0, 0, 0
	}))
	s.sender = &recordingSender{}
	currentFloor(t, s).Count = height
	require.NoError(t, s.regenerateFloor())
	return s, ids
}

// theEncounter is the floor's encounter entity and component; false with none.
func theEncounter(s *Session) (*ecs.Entity, *components.EncounterComponent, bool) {
	for _, e := range s.EntityManager.GetAllEntities() {
		if ec, ok := e.GetComponent(ecs.ComponentTypeEncounter); ok {
			return e, ec.(*components.EncounterComponent), true
		}
	}
	return nil, nil, false
}

// npcsOf is the floor's encounter NPC entities in a fixed order, so a test's
// npcsOf(s)[i] is the same NPC on every run at its seed: the encounter's own
// order (the order they stood), then any NPC no encounter names, by id.
// GetAllEntities' order is a map's.
func npcsOf(s *Session) []*ecs.Entity {
	var out []*ecs.Entity
	for _, e := range s.EntityManager.GetAllEntities() {
		if e.HasComponent(ecs.ComponentTypeEncounterNPC) {
			out = append(out, e)
		}
	}
	stood := map[uuid.UUID]int{}
	if _, enc, ok := theEncounter(s); ok {
		for i, id := range enc.NPCs {
			stood[id] = i
		}
	}
	rank := func(e *ecs.Entity) int {
		if i, ok := stood[e.ID]; ok {
			return i
		}
		return len(stood)
	}
	slices.SortFunc(out, func(a, b *ecs.Entity) int {
		if c := cmp.Compare(rank(a), rank(b)); c != 0 {
			return c
		}
		return strings.Compare(a.ID.String(), b.ID.String())
	})
	return out
}

func npcOf(t *testing.T, e *ecs.Entity) *components.EncounterNPCComponent {
	t.Helper()
	nc, ok := e.GetComponent(ecs.ComponentTypeEncounterNPC)
	require.True(t, ok)
	return nc.(*components.EncounterNPCComponent)
}

func npcHealth(e *ecs.Entity) *components.HealthComponent {
	hc, _ := e.GetComponent(ecs.ComponentTypeHealth)
	return hc.(*components.HealthComponent)
}

// medianDistance is the median of the floor's rooms' walk distances.
func medianDistance(d *dungeonFloor) float64 {
	var ds []int
	for _, r := range d.layout.Rooms {
		ds = append(ds, r.Distance)
	}
	slices.Sort(ds)
	n := len(ds)
	if n%2 == 1 {
		return float64(ds[n/2])
	}
	return float64(ds[n/2-1]+ds[n/2]) / 2
}

// FS-4EC7Z §A R1: about 40% of floors 2+ hold an encounter, never floor 1
// and never the top, over a seed sweep of the draw; a forced kind holds one
// on every eligible floor and on no other.
func TestEncounterFor_OddsOverASeedSweep(t *testing.T) {
	const runs = 3000
	tuning := defaultFloorTuning()
	held := 0
	for seed := uint64(1); seed <= runs; seed++ {
		rng := seededSpawns(seed)
		_, ok := encounterFor(rng, firstFloor, false, tuning)
		assert.False(t, ok, "never on floor 1")
		_, ok = encounterFor(rng, 5, true, tuning)
		assert.False(t, ok, "never on the top floor")
		if kind, ok := encounterFor(rng, 4, false, tuning); ok {
			held++
			assert.Contains(t, EncounterKinds, kind)
		}
	}
	assert.InDelta(t, EncounterFloorChance, float64(held)/runs, 0.03)

	tuning.forcedEncounterKind = components.EncounterLostPilgrims
	kind, ok := encounterFor(seededSpawns(1), 3, false, tuning)
	assert.True(t, ok)
	assert.Equal(t, components.EncounterLostPilgrims, kind)
	_, ok = encounterFor(seededSpawns(1), firstFloor, false, tuning)
	assert.False(t, ok, "forced, still never on floor 1")
	_, ok = encounterFor(seededSpawns(1), 5, true, tuning)
	assert.False(t, ok, "forced, still never on the top floor")
}

// FS-4EC7Z §A R1-R3, §B R6: one encounter a floor at most, in a room that is
// not the start, stairs, switch, escape door, a seal piece's, hidden or a
// respite's, at or past the median walk distance; three peaceful pilgrims
// stand in it and no rolled monster does. No encounter on the top floor.
func TestEncounter_RoomRulesOverASeedSweep(t *testing.T) {
	seen, far := 0, 0
	for seed := uint64(1); seed <= 25; seed++ {
		s, _ := encounterRun(t, seed, 2, 4, components.EncounterLostPilgrims)
		for depth := 2; depth <= 4; depth++ {
			if depth > 2 {
				require.NoError(t, s.regenerateFloor())
			}
			_, enc, has := theEncounter(s)
			if depth == 4 {
				assert.False(t, has, "seed %d: none on the top floor", seed)
				assert.Empty(t, npcsOf(s))
				continue
			}
			if s.dungeon == nil {
				assert.False(t, has, "seed %d floor %d: none on a floor of buildings", seed, depth)
				continue
			}
			require.True(t, has, "seed %d floor %d: forced, the floor holds one", seed, depth)
			seen++
			require.Len(t, entityIDsWith(s, ecs.ComponentTypeEncounter), 1, "one a floor")
			d := s.dungeon
			roles := d.layout.Roles
			room := enc.Room
			assert.Equal(t, components.EncounterLostPilgrims, enc.Kind)
			assert.NotEqual(t, roles.Start, room)
			assert.NotEqual(t, roles.Stairs, room)
			assert.NotEqual(t, roles.Switch, room)
			assert.NotEqual(t, roles.EscapeDoor, room)
			assert.False(t, d.isHidden(room))
			assert.False(t, d.isRespite(room))
			assert.False(t, d.sealPieceRooms()[room])
			// at or past the median walk distance, where an open room is
			pieces := d.sealPieceRooms()
			farOpen := false
			for r := range d.layout.Rooms {
				if r != room && d.respiteRoomOpen(r, pieces) && d.merchantRoomOpen(r) && float64(d.layout.Rooms[r].Distance) >= medianDistance(d) {
					farOpen = true
				}
			}
			if farOpen || float64(d.layout.Rooms[room].Distance) >= medianDistance(d) {
				assert.GreaterOrEqual(t, float64(d.layout.Rooms[room].Distance), medianDistance(d),
					"seed %d floor %d: at or past the median walk distance", seed, depth)
				far++
			}

			npcs := npcsOf(s)
			require.Len(t, npcs, PilgrimCount, "seed %d floor %d: three pilgrims", seed, depth)
			assert.Len(t, enc.NPCs, PilgrimCount)
			for _, e := range npcs {
				npc := npcOf(t, e)
				at := transformOf(t, e)
				assert.Equal(t, room, d.roomAt(at.X, at.Y), "a pilgrim stands in the encounter room")
				assert.Equal(t, components.EncounterNPCPilgrim, npc.Kind)
				assert.Equal(t, components.StancePeaceful, npc.Stance)
				assert.Equal(t, components.EncounterActionCower, npc.Action, "a pilgrim cowers from the start (§B R6)")
				assert.Contains(t, PilgrimLooks, npc.Look)
				assert.Greater(t, npcHealth(e).MaxHealth, 0)
				assert.True(t, e.HasComponent(ecs.ComponentTypeVelocity), "a body that collides")
				assert.Contains(t, enc.NPCs, e.ID)
			}
			for _, other := range s.EntityManager.GetAllEntities() {
				tc, placed := other.GetComponent(ecs.ComponentTypeTransform)
				if !placed || !other.HasComponent(ecs.ComponentTypeEnemy) {
					continue
				}
				at := tc.(*components.TransformComponent)
				assert.NotEqual(t, room, d.roomAt(at.X, at.Y), "seed %d floor %d: no rolled monster in its room", seed, depth)
			}
			// amended 2026-11-25: no trap is laid in it
			for _, trap := range entityIDsWith(s, ecs.ComponentTypeTrap) {
				e, _ := s.EntityManager.GetEntity(trap)
				tc, _ := e.GetComponent(ecs.ComponentTypeTrap)
				cell := tc.(*components.TrapComponent).Cell
				assert.NotEqual(t, d.roomRegion(room), d.region[cell.Y*d.layout.Cols+cell.X],
					"seed %d floor %d: no trap in the encounter room", seed, depth)
			}
		}
	}
	assert.Greater(t, seen, 30, "the sweep saw encounters")
	assert.Greater(t, far, seen/2, "most stand past the median")
}

// FS-4EC7Z §A R3: the encounter's NPCs die with the floor; they are never
// carried up.
func TestEncounter_GoneWithTheFloor(t *testing.T) {
	s, _ := encounterRun(t, 3, 1, 5, components.EncounterLostPilgrims)
	require.NotEmpty(t, npcsOf(s))
	old := npcsOf(s)[0].ID
	require.NoError(t, s.regenerateFloor())
	_, still := s.EntityManager.GetEntity(old)
	assert.False(t, still)
}

// standBeside puts the delver on open ground about dist px from e (within
// 10 px) and no nearer any other encounter NPC, so e is the nearest to them;
// the test fails when the floor has no such ground.
func standBeside(t *testing.T, s *Session, delver, e *ecs.Entity, dist float64) {
	t.Helper()
	at := transformOf(t, e)
	d := s.dungeon
	r := constants.PlayerRadius
	others := npcsOf(s)
	for step := 0.0; step < 360; step += 5 {
		angle := step * math.Pi / 180
		x, y := at.X+dist*math.Cos(angle), at.Y+dist*math.Sin(angle)
		region := d.regionAt(x, y)
		if region == 0 || !d.stands(centredArea(x, y, r, r), region, onDoorways) {
			continue
		}
		clear := true
		for _, o := range others {
			if o.ID == e.ID {
				continue
			}
			oa := transformOf(t, o)
			if math.Hypot(oa.X-x, oa.Y-y) < dist-10 || math.Hypot(oa.X-x, oa.Y-y) < 2*r {
				clear = false
			}
		}
		if clear {
			body := transformOf(t, delver)
			body.X, body.Y = x, y
			return
		}
	}
	t.Fatalf("no open ground %.0f px from the NPC", dist)
}

// farFrom puts the delver back in the start room, far from the encounter.
func farFrom(t *testing.T, s *Session, delver *ecs.Entity) {
	t.Helper()
	c := s.dungeon.roomCentre(s.dungeon.layout.Roles.Start)
	body := transformOf(t, delver)
	body.X, body.Y = c.x, c.y
}

// pilgrimsRun is a forced Lost Pilgrims run on floor 2 for delvers, every
// delver in the start room; false when the seed fell back to buildings.
func pilgrimsRun(t *testing.T, seed uint64, delvers int) (*Session, []*ecs.Entity) {
	t.Helper()
	s, ids := encounterRun(t, seed, delvers, 5, components.EncounterLostPilgrims)
	require.NotNil(t, s.dungeon, "seed %d: floor 2 is a dungeon floor", seed)
	var bodies []*ecs.Entity
	for _, id := range ids {
		b := delverEntity(t, s, id)
		farFrom(t, s, b)
		bodies = append(bodies, b)
	}
	return s, bodies
}

// waveOf is the pilgrims' wave state.
func waveOf(t *testing.T, s *Session) *components.PilgrimWaveComponent {
	t.Helper()
	e, _, ok := theEncounter(s)
	require.True(t, ok)
	wc, ok := e.GetComponent(ecs.ComponentTypePilgrimWave)
	require.True(t, ok)
	return wc.(*components.PilgrimWaveComponent)
}

// waveMonsters is the wave's living monster entities.
func waveMonsters(t *testing.T, s *Session) []*ecs.Entity {
	t.Helper()
	var out []*ecs.Entity
	for _, id := range waveOf(t, s).Wave {
		if e, ok := s.EntityManager.GetEntity(id); ok {
			out = append(out, e)
		}
	}
	return out
}

// seconds is how many ticks make secs.
func seconds(secs float64) int { return int(math.Ceil(secs * float64(constants.GameFrameRate))) }

// FS-4EC7Z §B R7, Edge States: nothing starts while the party keeps away;
// the first delver within 3 cells of a pilgrim starts the plea.
func TestPilgrims_ThePleaOnApproach(t *testing.T) {
	s, bodies := pilgrimsRun(t, 15, 1)
	ticks(s, seconds(PilgrimWaveDelay+1))
	assert.False(t, waveOf(t, s).Pleaded, "ignored, nothing starts")
	assert.Empty(t, waveOf(t, s).Wave)

	p := npcsOf(s)[0]
	cell := s.dungeon.layout.CellSize
	standBeside(t, s, bodies[0], p, PilgrimPleaCells*cell+20)
	tick(s)
	assert.False(t, waveOf(t, s).Pleaded, "just past 3 cells: not yet")

	standBeside(t, s, bodies[0], p, PilgrimPleaCells*cell-20)
	tick(s)
	assert.True(t, waveOf(t, s).Pleaded)
	pleaded := 0
	for _, e := range npcsOf(s) {
		npc := npcOf(t, e)
		assert.Equal(t, components.EncounterActionCower, npc.Action, "they cower")
		if npc.Line == components.LinePilgrimPlea {
			pleaded++
		}
	}
	assert.Equal(t, 1, pleaded, "the approached pilgrim says the plea")
}

// FS-4EC7Z §A R4, §B R7: a talk to a pilgrim in reach is answered by its line
// on the state, the plea, and starts the plea; a talk out of reach is
// refused.
func TestPilgrims_TalkSetsTheLineAndStartsThePlea(t *testing.T) {
	s, bodies := pilgrimsRun(t, 5, 1)
	ids := delverIDs(s)
	p := npcsOf(s)[0]

	assert.ErrorIs(t, s.handleInteract(ids[0], p.ID), ErrOutOfRange)
	assert.False(t, waveOf(t, s).Pleaded)

	tick(s)
	standBeside(t, s, bodies[0], p, 45)
	require.NoError(t, s.handleInteract(ids[0], p.ID))
	npc := npcOf(t, p)
	assert.Equal(t, components.LinePilgrimPlea, npc.Line)
	assert.InDelta(t, npc.Age, npc.LineAt, 1e-9, "said now, on its clock")
	assert.True(t, waveOf(t, s).Pleaded)
}

// FS-4EC7Z §A R3-R4: an interact on a dead encounter NPC is play, not a
// fault: refused quietly, starting nothing.
func TestEncounterNPC_InteractOnTheDead_IsAQuietRefusal(t *testing.T) {
	s, bodies := pilgrimsRun(t, 5, 1)
	ids := delverIDs(s)
	p := npcsOf(s)[0]
	standBeside(t, s, bodies[0], p, 45)
	npcHealth(p).CurrentHealth = 0
	err := s.handleInteract(ids[0], p.ID)
	assert.ErrorIs(t, err, ErrEncounterNPCDead)
	assert.True(t, interactRefusedQuietly(err), "a quiet refusal")
	assert.False(t, waveOf(t, s).Pleaded)
}

// delverIDs is the run's delvers' member ids, in roster order.
func delverIDs(s *Session) []uuid.UUID {
	var ids []uuid.UUID
	for member := range s.playerIDToEntitiesID {
		ids = append(ids, member)
	}
	return ids
}

// FS-4EC7Z §B R7: 5 s after the plea the wave comes, 2 + 2 x living delvers
// of the floor's pool, fodder and a brute from three delvers, from two spots
// in the corridors outside the room, each hunting the nearest pilgrim or
// delver.
func TestPilgrims_TheWave(t *testing.T) {
	for _, delvers := range []int{1, 2, 3} {
		s, bodies := pilgrimsRun(t, 12, delvers)
		_, enc, _ := theEncounter(s)
		p := npcsOf(s)[0]
		standBeside(t, s, bodies[0], p, 100)
		tick(s)
		require.True(t, waveOf(t, s).Pleaded)
		for _, b := range bodies {
			farFrom(t, s, b)
		}

		ticks(s, seconds(PilgrimWaveDelay)-2)
		assert.Empty(t, waveOf(t, s).Wave, "%d delvers: not before 5 s", delvers)
		ticks(s, 3)
		wave := waveMonsters(t, s)
		require.Len(t, wave, PilgrimWaveBase+PilgrimWavePerDelver*delvers, "%d delvers: the wave's size", delvers)

		brutes := 0
		spots := map[components.Cell]bool{}
		for _, m := range wave {
			mc, _ := m.GetComponent(ecs.ComponentTypeEnemy)
			monster := mc.(*components.MonsterComponent)
			if poolRoleOf(s, monster.Archetype) == roleBrute {
				brutes++
			}
			at := transformOf(t, m)
			assert.NotEqual(t, enc.Room, s.dungeon.roomAt(at.X, at.Y), "outside the room")
			assert.Equal(t, -1, s.dungeon.roomAt(at.X, at.Y), "in a corridor")
			spots[s.dungeon.cellOf(point{at.X, at.Y})] = true
			// it is set on a pilgrim, the nearest body to it, taken up on
			// its next think
			assert.Contains(t, enc.NPCs, monster.LastAttacker, "%d delvers: the pilgrims are nearer than the far delvers", delvers)
		}
		wantBrutes := 0
		if delvers >= PilgrimWaveBruteFrom {
			wantBrutes = 1
		}
		assert.Equal(t, wantBrutes, brutes, "%d delvers: brutes", delvers)
		assert.Len(t, spots, len(wave), "no two on one cell")
		used, openings := openingsUsed(t, s, enc.Room, wave)
		assert.Equal(t, min(openings, 2), used, "%d delvers: from two sides when the room has two", delvers)

		tick(s)
		for _, m := range wave {
			mc, _ := m.GetComponent(ecs.ComponentTypeEnemy)
			assert.Contains(t, enc.NPCs, mc.(*components.MonsterComponent).Target, "%d delvers: hunting a pilgrim", delvers)
		}
	}
}

// FS-4EC7Z §B R7, §A R5: the wave's spots skip corridor cells within
// MonsterDelverExclusion of any delver, as every spawn does; with none of
// those left, the wave still comes, on the cells farthest from them.
func TestPilgrims_TheWaveSpawnsClearOfTheDelvers(t *testing.T) {
	s, _ := pilgrimsRun(t, 6, 1)
	_, enc, _ := theEncounter(s)
	d := s.dungeon
	openings := d.roomOpenings(enc.Room)
	require.NotEmpty(t, openings)
	mouth, barred := openings[0], d.barrierCells()
	open := func(int) float64 { return math.Inf(1) }
	walk := d.walkOut(enc.Room, mouth, 1000, barred, map[int]bool{}, open)
	require.GreaterOrEqual(t, len(walk), 4, "seed 6: a corridor of 4 cells or more")
	index := func(c components.Cell) int { return c.Y*d.layout.Cols + c.X }
	rank := map[int]int{}
	for r, c := range walk {
		rank[index(c)] = r
	}

	t.Run("the cells near a delver are skipped", func(t *testing.T) {
		crowded := map[int]bool{index(walk[0]): true, index(walk[1]): true}
		clearance := func(i int) float64 {
			if crowded[i] {
				return MonsterDelverExclusion - 1
			}
			return MonsterDelverExclusion
		}
		got := d.walkOut(enc.Room, mouth, 2, barred, map[int]bool{}, clearance)
		require.Len(t, got, 2)
		for _, c := range got {
			assert.False(t, crowded[index(c)], "a cell within the exclusion is passed over")
		}
	})
	t.Run("none clear: the farthest", func(t *testing.T) {
		clearance := func(i int) float64 { return float64(rank[i]) }
		got := d.walkOut(enc.Room, mouth, 2, barred, map[int]bool{}, clearance)
		assert.ElementsMatch(t, walk[len(walk)-2:], got, "the two farthest from the delvers")
	})
	t.Run("through waveSpots, delvers in every corridor", func(t *testing.T) {
		var delvers []point
		for i, region := range d.region {
			if region != 0 && d.layout.Regions[region-1].Kind == levelgen.RegionCorridor {
				delvers = append(delvers, d.cellCentre(components.Cell{X: i % d.layout.Cols, Y: i / d.layout.Cols}))
			}
		}
		n := PilgrimWaveBase + PilgrimWavePerDelver*3
		assert.Len(t, d.waveSpots(rand.New(rand.NewPCG(1, 2)), enc.Room, n, delvers), n, "the wave still comes")
	})
}

// poolRoleOf is the role of archetype on the roster.
func poolRoleOf(_ *Session, archetype components.MonsterArchetype) monsterRole {
	entry, _ := variantOf(archetype)
	if entry.Family == nil {
		return ""
	}
	return entry.Family.Role
}

// openingsUsed is how many of the room's openings the wave stands outside:
// each monster counted at the opening nearest to it.
func openingsUsed(t *testing.T, s *Session, room int, wave []*ecs.Entity) (used, openings int) {
	t.Helper()
	all := s.dungeon.roomOpenings(room)
	seen := map[int]bool{}
	for _, m := range wave {
		at := transformOf(t, m)
		best, bestDist := -1, math.Inf(1)
		for i, mouth := range all {
			for _, c := range mouth {
				centre := s.dungeon.cellCentre(c)
				if dist := math.Hypot(centre.x-at.X, centre.y-at.Y); dist < bestDist {
					best, bestDist = i, dist
				}
			}
		}
		seen[best] = true
	}
	return len(seen), len(all)
}

// killWave takes every wave monster to 0.
func killWave(t *testing.T, s *Session) {
	t.Helper()
	for _, m := range waveMonsters(t, s) {
		npcHealth(m).CurrentHealth = 0
	}
}

// pleadAndWave starts the plea and lets the wave come.
func pleadAndWave(t *testing.T, s *Session, bodies []*ecs.Entity) {
	t.Helper()
	standBeside(t, s, bodies[0], npcsOf(s)[0], 100)
	tick(s)
	farFrom(t, s, bodies[0])
	ticks(s, seconds(PilgrimWaveDelay)+1)
	require.NotEmpty(t, waveOf(t, s).Wave)
}

// FS-4EC7Z §B R8: the wave cleared with a pilgrim alive, the thanks and a
// better chest beside the nearest living pilgrim, shut, unguarded; the
// pilgrims stay peaceful where they stand.
func TestPilgrims_TheRewardWhenOneLives(t *testing.T) {
	s, bodies := pilgrimsRun(t, 7, 1)
	pleadAndWave(t, s, bodies)
	npcs := npcsOf(s)
	// two of the three fall
	npcHealth(npcs[0]).CurrentHealth, npcHealth(npcs[1]).CurrentHealth = 0, 0
	survivor := npcs[2]
	where := *transformOf(t, survivor)
	before := betterChests(s)
	killWave(t, s)
	tick(s)

	assert.True(t, waveOf(t, s).Done)
	assert.Equal(t, components.LinePilgrimThanks, npcOf(t, survivor).Line)
	assert.Equal(t, components.StancePeaceful, npcOf(t, survivor).Stance)
	at := transformOf(t, survivor)
	assert.Equal(t, where.X, at.X, "it stays where it is")

	var chests []*ecs.Entity
	for _, e := range betterChests(s) {
		if !slices.Contains(before, e) {
			chests = append(chests, e)
		}
	}
	require.Len(t, chests, 1, "one better chest more")
	chest := chests[0]
	c := transformOf(t, chest)
	assert.Less(t, math.Hypot(c.X-at.X, c.Y-at.Y), 100.0, "beside the living pilgrim")
	assert.False(t, chest.HasComponent(ecs.ComponentTypeGuarded), "unguarded")
	oc, ok := chest.GetComponent(ecs.ComponentTypeOpenable)
	require.True(t, ok)
	assert.False(t, oc.(*components.OpenableComponent).IsOpen, "shut")

	// talking now is answered by the thanks
	standBeside(t, s, bodies[0], survivor, 45)
	ticks(s, 10)
	require.NoError(t, s.handleInteract(delverIDs(s)[0], survivor.ID))
	assert.Equal(t, components.LinePilgrimThanks, npcOf(t, survivor).Line)
}

// FS-4EC7Z §B R8: every pilgrim dead, the wave cleared gives no chest.
func TestPilgrims_NoChestWhenAllDied(t *testing.T) {
	s, bodies := pilgrimsRun(t, 8, 1)
	pleadAndWave(t, s, bodies)
	before := len(betterChests(s))
	for _, e := range npcsOf(s) {
		npcHealth(e).CurrentHealth = 0
	}
	tick(s)
	killWave(t, s)
	ticks(s, 2)
	assert.True(t, waveOf(t, s).Done)
	assert.Len(t, betterChests(s), before, "no better chest")
}

// betterChests is the floor's better chests.
func betterChests(s *Session) []*ecs.Entity {
	var out []*ecs.Entity
	for _, e := range s.EntityManager.GetAllEntities() {
		if cc, ok := e.GetComponent(ecs.ComponentTypeContainer); ok && cc.(*components.ContainerComponent).Better {
			out = append(out, e)
		}
	}
	return out
}

// FS-4EC7Z Edge States: a pilgrim dead before the wave, the wave still comes
// for the rest; every pilgrim dead before it, no wave at all.
func TestPilgrims_DeathsBeforeTheWave(t *testing.T) {
	t.Run("one dead, the wave comes", func(t *testing.T) {
		s, bodies := pilgrimsRun(t, 9, 1)
		standBeside(t, s, bodies[0], npcsOf(s)[0], 100)
		tick(s)
		farFrom(t, s, bodies[0])
		npcHealth(npcsOf(s)[1]).CurrentHealth = 0
		ticks(s, seconds(PilgrimWaveDelay)+1)
		assert.NotEmpty(t, waveOf(t, s).Wave)
	})
	t.Run("all dead, no wave", func(t *testing.T) {
		s, bodies := pilgrimsRun(t, 9, 1)
		standBeside(t, s, bodies[0], npcsOf(s)[0], 100)
		tick(s)
		farFrom(t, s, bodies[0])
		for _, e := range npcsOf(s) {
			npcHealth(e).CurrentHealth = 0
		}
		ticks(s, seconds(PilgrimWaveDelay)+1)
		assert.Empty(t, waveOf(t, s).Wave)
		assert.True(t, waveOf(t, s).Done)
	})
}

// FS-4EC7Z §A R3: a delver's swing at a pilgrim on a real floor, through the
// session's tick, leaves it whole; it is never a delver in play.
func TestPilgrims_ADelversSwingLeavesThemWhole(t *testing.T) {
	s, bodies := pilgrimsRun(t, 10, 1)
	p := npcsOf(s)[0]
	standBeside(t, s, bodies[0], p, 40)
	intents, _ := bodies[0].GetComponent(ecs.ComponentTypeAttackIntent)
	intents.(*components.AttackIntentComponent).Pending = append(intents.(*components.AttackIntentComponent).Pending,
		components.AttackIntent{Kind: components.AttackTargeted, TargetEntityID: p.ID})
	tick(s)
	assert.Equal(t, npcHealth(p).MaxHealth, npcHealth(p).CurrentHealth)
	assert.False(t, systems.InPlay(p))
}

// FS-KE075 §Change: Room variety, Edge States: a corridor too short for the
// wave leads its walk on through the ground beyond to the next corridor; it
// still takes only corridor cells, none in the encounter's room.
func TestPilgrims_TheWaveWalksOnPastAShortCorridor(t *testing.T) {
	const k = 8
	found := 0
	for seed := uint64(1); seed <= 40 && found == 0; seed++ {
		s, _ := pilgrimsRun(t, seed, 1)
		d := s.dungeon
		_, enc, _ := theEncounter(s)
		barred := d.barrierCells()
		for _, mouth := range d.roomOpenings(enc.Room) {
			// the corridor cells the mouth reaches over corridor cells alone
			seen, queue := map[int]bool{}, []int{}
			for _, c := range mouth {
				i := c.Y*d.layout.Cols + c.X
				seen[i], queue = true, append(queue, i)
			}
			for q := 0; q < len(queue); q++ {
				x, y := queue[q]%d.layout.Cols, queue[q]/d.layout.Cols
				for _, n := range [4][2]int{{x + 1, y}, {x - 1, y}, {x, y + 1}, {x, y - 1}} {
					if i, ok := d.corridorCell(n[0], n[1], barred); ok && !seen[i] {
						seen[i], queue = true, append(queue, i)
					}
				}
			}
			if len(seen) >= k {
				continue
			}
			found++
			got := d.walkOut(enc.Room, mouth, k, barred, map[int]bool{}, func(int) float64 { return math.Inf(1) })
			require.Len(t, got, k, "seed %d: the walk goes on to fill the wave", seed)
			beyond := 0
			for _, c := range got {
				i := c.Y*d.layout.Cols + c.X
				_, corridor := d.corridorCell(c.X, c.Y, barred)
				assert.True(t, corridor, "seed %d: %v is a corridor cell", seed, c)
				assert.NotEqual(t, d.roomRegion(enc.Room), d.region[i], "seed %d: never in the encounter's room", seed)
				if !seen[i] {
					beyond++
				}
			}
			assert.Positive(t, beyond, "seed %d: some of the wave stands past the short corridor", seed)
		}
	}
	require.Positive(t, found, "a seed gives an opening whose corridor is shorter than the wave")
}
