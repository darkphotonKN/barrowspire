package game

import (
	"fmt"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// trapsRun is floor 1 of a seeded run of delvers, every one in the start
// room, with no monster on it, ticked once so their gear counts.
func trapsRun(t *testing.T, seed uint64, delvers int) (*Session, []uuid.UUID) {
	t.Helper()
	s, ids := dungeonRun(t, seed, delvers, 0)
	require.NotNil(t, s.dungeon, "seed %d: a dungeon floor", seed)
	for _, m := range monstersInWorld(s.EntityManager) {
		s.EntityManager.RemoveEntity(m.ID)
	}
	tick(s)
	return s, ids
}

// trapsOf is the floor's traps.
func trapsOf(s *Session) []*ecs.Entity {
	var traps []*ecs.Entity
	for _, e := range s.EntityManager.GetAllEntities() {
		if e.HasComponent(ecs.ComponentTypeTrap) {
			traps = append(traps, e)
		}
	}
	return traps
}

// trapOf is a trap entity's trap.
func trapOf(e *ecs.Entity) *components.TrapComponent {
	tc, _ := e.GetComponent(ecs.ComponentTypeTrap)
	return tc.(*components.TrapComponent)
}

// firstTrapAs is the floor's first trap made a trap of kind.
func firstTrapAs(t *testing.T, s *Session, kind components.TrapKind) *ecs.Entity {
	t.Helper()
	traps := trapsOf(s)
	require.NotEmpty(t, traps, "the floor has traps")
	trapOf(traps[0]).Kind = kind
	if kind == components.TrapTripwire {
		traps[0].AddComponent(&components.AmbushComponent{})
	}
	return traps[0]
}

// FS-5FZ4J §D R25-R26: a delver stepping onto an armed spike plate, dart
// wall or fire jet takes the floor's trap hit at its kind's factor, through
// the combat (the same as a trap hit queued straight at a twin delver), on the
// tick.
func TestTrap_ADelverSteppingOnItTakesTheFloorsTrapHit(t *testing.T) {
	for kind, factor := range map[components.TrapKind]float64{
		components.TrapSpikePlate: TrapFactorSpikePlate,
		components.TrapDartWall:   TrapFactorDartWall,
		components.TrapFireJet:    TrapFactorFireJet,
	} {
		t.Run(string(kind), func(t *testing.T) {
			s, ids := trapsRun(t, 7, 2)
			trap := firstTrapAs(t, s, kind)
			stepper, twin := delverEntity(t, s, ids[0]), delverEntity(t, s, ids[1])
			before := currentHealth(stepper)
			require.Equal(t, before, currentHealth(twin))

			standOn(t, s, stepper, trapOf(trap).Cell)
			s.hitByTrap(uuid.New(), twin, factor)
			tick(s)

			lost := before - currentHealth(stepper)
			assert.Positive(t, lost, "the trap hit the delver on the tick")
			assert.Equal(t, before-currentHealth(twin), lost, "the floor's trap hit at %s's factor", kind)
			assert.False(t, trapOf(trap).Armed)
		})
	}
}

// FS-5FZ4J §D R25: a monster walking onto an armed trap fires nothing and
// detects nothing.
func TestTrap_AMonsterFiresNothing(t *testing.T) {
	s, _ := trapsRun(t, 7, 1)
	trap := firstTrapAs(t, s, components.TrapSpikePlate)
	at := s.dungeon.cellCentre(trapOf(trap).Cell)
	monster := CreateMonsterEntity(s.EntityManager, MonsterConfig{X: at.x, Y: at.y, Archetype: standardFodder, Level: 1})
	health := currentHealth(monster)

	tick(s)

	assert.True(t, trapOf(trap).Armed)
	assert.False(t, detected(trap))
	assert.Equal(t, health, currentHealth(monster))
}

// FS-5FZ4J §D R27, R25: a tripwire deals no damage; stepped on, it wakes one
// ambush hunting the delver who tripped it, and is spent: stepping on it again
// wakes nothing.
func TestTrap_TripwireWakesAnAmbushOnce(t *testing.T) {
	s, ids := trapsRun(t, 7, 1)
	trap := firstTrapAs(t, s, components.TrapTripwire)
	delver := delverEntity(t, s, ids[0])
	health := currentHealth(delver)
	before := monstersInWorld(s.EntityManager)

	standOn(t, s, delver, trapOf(trap).Cell)
	tick(s)

	pack := newMonsters(s, before)
	require.GreaterOrEqual(t, len(pack), AmbushSizeMin)
	require.LessOrEqual(t, len(pack), AmbushSizeMax)
	for _, m := range pack {
		assert.Equal(t, delver.ID, monsterOf(m).LastAttacker, "it hunts the tripper")
	}
	assert.Equal(t, health, currentHealth(delver), "a tripwire deals no damage")
	assert.True(t, trapOf(trap).Spent)

	awake := monstersInWorld(s.EntityManager)
	start := s.dungeon.roomCentre(s.dungeon.layout.Roles.Start)
	at := transformOf(t, delver)
	at.X, at.Y = start.x, start.y
	tick(s)
	standOn(t, s, delver, trapOf(trap).Cell)
	tick(s)
	assert.Empty(t, newMonsters(s, awake), "a tripwire fires once")
}

// healthComponentOf is e's health.
func healthComponentOf(e *ecs.Entity) *components.HealthComponent {
	hc, _ := e.GetComponent(ecs.ComponentTypeHealth)
	return hc.(*components.HealthComponent)
}

// poisonedFor is the delver's poison left, 0 when not poisoned.
func poisonedFor(delver *ecs.Entity) float64 {
	left, _ := systems.PoisonedFor(delver)
	return left
}

// beside stands e one cell east of cell's centre.
func beside(t *testing.T, s *Session, e *ecs.Entity, cell components.Cell) {
	t.Helper()
	standOn(t, s, e, components.Cell{X: cell.X + 1, Y: cell.Y})
}

// FS-5FZ4J §D R28-R29: a delver coming into a gas vent's cloud is poisoned on
// that tick, for 60 s, and loses 1% of their max health a second.
func TestTrap_GasVentPoisonsADelverInItsCloud(t *testing.T) {
	s, ids := trapsRun(t, 7, 1)
	vent := firstTrapAs(t, s, components.TrapGasVent)
	delver := delverEntity(t, s, ids[0])

	beside(t, s, delver, trapOf(vent).Cell)
	tick(s)
	assert.InDelta(t, PoisonDuration, poisonedFor(delver), 2.0/30, "poisoned on entering the cloud")
	assert.True(t, trapOf(vent).Puffed)

	start := s.dungeon.roomCentre(s.dungeon.layout.Roles.Start)
	at := transformOf(t, delver)
	at.X, at.Y = start.x, start.y
	health := currentHealth(delver)
	ticks(s, 10*30)
	max := healthComponentOf(delver).MaxHealth
	assert.InDelta(t, health-max/10, currentHealth(delver), 1, "1%% of %d a second for 10 s", max)
}

// FS-5FZ4J §D R29, R31: poison is lethal: a delver it brings to 0 is
// eliminated as by any hit, and their poison ends with them.
func TestPoison_IsLethal(t *testing.T) {
	s, ids := trapsRun(t, 7, 2)
	delver := delverEntity(t, s, ids[0])
	healthComponentOf(delver).CurrentHealth = 1
	systems.Poison(delver, PoisonDuration)

	ticks(s, 10*30)

	assert.True(t, healthComponentOf(delver).IsEliminated, "poison killed them")
	assert.False(t, delver.HasComponent(ecs.ComponentTypePoison))
}

// FS-5FZ4J §D R29, Edge States: poison carries across a floor change with the
// body, its time kept to the tick.
func TestPoison_CarriesAcrossAFloorChange(t *testing.T) {
	s, ids := trapsRun(t, 7, 1)
	delver := delverEntity(t, s, ids[0])
	systems.Poison(delver, PoisonDuration)
	ticks(s, 30)
	left := poisonedFor(delver)

	require.NoError(t, s.regenerateFloor())

	assert.Equal(t, 2, currentFloor(t, s).Depth)
	assert.Equal(t, left, poisonedFor(delver), "kept to the tick")
}

// FS-5FZ4J §D R29: poison ticks are not hits: a poisoned delver's timed open
// counts through to its end while the poison takes their health. A trap's
// hit on the tick of the reach cancels one (§D R26, FS-MQYEX R7).
func TestTimedOpen_PoisonBreaksNone_ATrapHitDoes(t *testing.T) {
	t.Run("poison", func(t *testing.T) {
		s, ids := trapsRun(t, 7, 1)
		delver := delverEntity(t, s, ids[0])
		at := transformOf(t, delver)
		chest := s.AddContainer(at.X+5, at.Y, components.ContainerKindChest)
		systems.Poison(delver, PoisonDuration)
		health := currentHealth(delver)

		require.NoError(t, s.handleInteract(ids[0], chest))
		ticks(s, 30)

		assert.Less(t, currentHealth(delver), health, "the poison took health")
		assert.NotNil(t, timedOpenOf(delver), "and broke nothing")
	})
	t.Run("trap", func(t *testing.T) {
		s, ids := trapsRun(t, 7, 1)
		trap := firstTrapAs(t, s, components.TrapSpikePlate)
		delver := delverEntity(t, s, ids[0])
		standOn(t, s, delver, trapOf(trap).Cell)
		at := transformOf(t, delver)
		chest := s.AddContainer(at.X+5, at.Y, components.ContainerKindChest)

		require.NoError(t, s.handleInteract(ids[0], chest))
		require.NotNil(t, timedOpenOf(delver))
		tick(s)

		assert.False(t, trapOf(trap).Armed, "the plate fired")
		assert.Nil(t, timedOpenOf(delver), "its hit cancelled the timed open")
	})
}

// FS-5FZ4J §D R23: min(3 + floor(depth / 2), 8) traps a floor.
func TestTrapCount_ByFloor(t *testing.T) {
	for depth, want := range map[int]int{1: 3, 2: 4, 3: 4, 4: 5, 9: 7, 10: 8, 14: 8} {
		assert.Equal(t, want, trapCount(depth), "floor %d", depth)
	}
}

/**
* assertTrapRules checks every trap of the floor s stands on against FS-5FZ4J
* §D R23-R24: want of them, on walkable cells, each at its cell's centre,
* armed and undetected; none in the start room or within 2 cells of it or of
* a delver's start spot, on a doorway, a barrier's cell, a seal piece's cell, a
* hidden room or a held area; 3 cells apart; at least half off the walk from
* the start to the gate.
**/
func assertTrapRules(t *testing.T, s *Session, want int, what string) {
	t.Helper()
	d := s.dungeon
	traps := trapsOf(s)
	require.Len(t, traps, want, "%s: the floor's traps", what)

	starts := []components.Cell{}
	for _, e := range s.EntityManager.GetAllEntities() {
		if e.HasComponent(ecs.ComponentTypePlayer) {
			at := transformOf(t, e)
			starts = append(starts, d.cellOf(point{at.X, at.Y}))
		}
	}
	for _, slot := range s.arrivalSlotPositions() {
		starts = append(starts, d.cellOf(slot))
	}
	barred := map[components.Cell]bool{}
	pieces := map[components.Cell]bool{}
	for _, e := range s.EntityManager.GetAllEntities() {
		if bc, ok := e.GetComponent(ecs.ComponentTypeBarrier); ok {
			for _, c := range bc.(*components.BarrierComponent).Cells {
				barred[c] = true
			}
		}
		if pc, ok := e.GetComponent(ecs.ComponentTypeSealPiece); ok {
			pieces[pc.(*components.SealPieceComponent).Cell] = true
		}
	}
	hidden := map[int]bool{}
	for _, h := range d.layout.Hidden {
		hidden[d.roomRegion(h.Room)] = true
	}
	start := d.layout.Rooms[d.layout.Roles.Start].Rect
	path := d.gateWalkRegions()
	var cells []components.Cell
	off := 0
	for _, e := range traps {
		trap := trapOf(e)
		c := trap.Cell
		i := c.Y*d.layout.Cols + c.X
		region := d.region[i]
		at := transformOf(t, e)
		centre := d.cellCentre(c)
		assert.Equal(t, centre, point{at.X, at.Y}, "%s: at its cell's centre", what)
		assert.True(t, trap.Armed, what)
		dc, _ := e.GetComponent(ecs.ComponentTypeDetectable)
		assert.False(t, dc.(*components.DetectableComponent).Detected, "%s: undetected", what)
		assert.NotZero(t, region, "%s: walkable", what)
		assert.NotEqual(t, d.roomRegion(d.layout.Roles.Start), region, "%s: not in the start room", what)
		assert.False(t, c.X >= start.X-2 && c.X < start.X+start.W+2 && c.Y >= start.Y-2 && c.Y < start.Y+start.H+2, "%s: %v within 2 cells of the start room", what, c)
		for _, sc := range starts {
			assert.Greater(t, cellsApart(c, sc), 2, "%s: within 2 cells of a start spot", what)
		}
		assert.False(t, d.doorway[i], "%s: on a doorway", what)
		assert.False(t, barred[c], "%s: on a barrier", what)
		assert.False(t, pieces[c], "%s: on a seal piece", what)
		assert.False(t, hidden[region], "%s: in a hidden room", what)
		size := d.layout.CellSize
		cellArea := PlaceArea{X: float64(c.X) * size, Y: float64(c.Y) * size, W: size, H: size}
		assert.False(t, s.IsAreaOccupied(cellArea), "%s: on a fixture, container, tome, altar or plates room", what)
		for _, o := range cells {
			assert.GreaterOrEqual(t, cellsApart(c, o), 3, "%s: 3 cells apart", what)
		}
		cells = append(cells, c)
		if !path[region] {
			off++
		}
	}
	assert.GreaterOrEqual(t, off, (want+1)/2, "%s: at least half off the walk to the gate", what)
}

// FS-5FZ4J §D R23: floor 1 of a seed sweep, under each seal kind built, lays
// its 3 traps by the cell rules.
func TestTraps_Floor1_PlacementRulesOverASeedSweep(t *testing.T) {
	for _, kind := range []components.SealKind{components.SealLeverOrder, components.SealWeightedPlates, components.SealHiddenKey} {
		forceSeal(t, kind)
		for seed := uint64(1); seed <= 60; seed++ {
			s, _ := dungeonRun(t, seed, 2, 1)
			require.NotNil(t, s.dungeon, "seed %d", seed)
			assertTrapRules(t, s, trapCount(1), fmt.Sprintf("%s seed %d", kind, seed))
		}
	}
}

// FS-5FZ4J §D R23: floor 10 lays 8 by the same rules; a floor change builds
// new traps (§D R31).
func TestTraps_Floor10_EightByTheRules(t *testing.T) {
	for seed := uint64(1); seed <= 12; seed++ {
		s, _ := dungeonRun(t, seed, 1, 0)
		floor := currentFloor(t, s)
		floor.Count = 12
		old := trapsOf(s)
		floor.Depth = 9
		require.NoError(t, s.regenerateFloor())
		require.NotNil(t, s.dungeon, "seed %d", seed)
		require.Equal(t, 10, floor.Depth)
		for _, e := range old {
			_, stands := s.EntityManager.GetEntity(e.ID)
			assert.False(t, stands, "seed %d: the last floor's traps went with it", seed)
		}
		assertTrapRules(t, s, trapCount(10), fmt.Sprintf("floor 10 seed %d", seed))
	}
}

// trapsIn is the traps a frame lists, by entity id.
func trapsIn(state *types.ClientGameState) map[uuid.UUID]*types.TrapState {
	traps := map[uuid.UUID]*types.TrapState{}
	for _, trap := range state.Traps {
		traps[trap.EntityID] = trap
	}
	return traps
}

// FS-5FZ4J §D R30, §I R46: an undetected trap is in no member's state; from
// the tick a delver comes within 2 cells of it, it is in every member's,
// armed, unrevealed, on its cell, and stays when they walk off. One that fires
// unseen is detected by firing, and is listed unarmed.
func TestTraps_Wire_DetectedOnlyAndToEveryMember(t *testing.T) {
	s, ids := trapsRun(t, 7, 2)
	traps := trapsOf(s)
	require.GreaterOrEqual(t, len(traps), 2)
	seen, fired := traps[0], traps[1]
	trapOf(seen).Kind = components.TrapSpikePlate
	trapOf(fired).Kind = components.TrapSpikePlate
	for _, id := range ids {
		assert.Empty(t, runState(t, s, id).Traps, "undetected: in no state")
	}
	assert.NotContains(t, frameOf(t, s, types.WorldTypeRun, ids[0]), "traps", "none detected: the key is absent")

	walker := delverEntity(t, s, ids[0])
	c := trapOf(seen).Cell
	standOn(t, s, walker, components.Cell{X: c.X + 3, Y: c.Y})
	tick(s)
	assert.NotContains(t, trapsIn(runState(t, s, ids[1])), seen.ID, "3 cells off: unseen")
	standOn(t, s, walker, components.Cell{X: c.X + 2, Y: c.Y})
	tick(s)
	for _, id := range ids {
		listed := trapsIn(runState(t, s, id))
		require.Contains(t, listed, seen.ID, "2 cells off: in every member's state")
		got := listed[seen.ID]
		assert.Equal(t, string(components.TrapSpikePlate), got.Kind)
		assert.Equal(t, types.CellState{X: c.X, Y: c.Y}, got.Cell)
		assert.True(t, got.Armed)
		assert.False(t, got.Revealed)
		assert.Nil(t, got.PuffedAt, "a puff is a gas vent's")
	}

	// the other is fired with nobody near it first: the firing detects it
	require.NotContains(t, trapsIn(runState(t, s, ids[1])), fired.ID, "not seen before it fires")
	standOn(t, s, walker, trapOf(fired).Cell)
	tick(s)
	listed := trapsIn(runState(t, s, ids[1]))
	require.Contains(t, listed, fired.ID, "a fired trap is detected")
	assert.False(t, listed[fired.ID].Armed, "fired: unarmed while it waits to re-arm")
	assert.Contains(t, listed, seen.ID, "detected for the floor's life")
}

// FS-5FZ4J §I R46, R48: a gas vent is listed armed, with puffed_at its last
// puff's time once it has puffed, rising with each puff.
func TestTraps_Wire_GasVentPuffedAt(t *testing.T) {
	s, ids := trapsRun(t, 7, 1)
	vent := firstTrapAs(t, s, components.TrapGasVent)
	delver := delverEntity(t, s, ids[0])

	beside(t, s, delver, trapOf(vent).Cell)
	tick(s)
	got := trapsIn(runState(t, s, ids[0]))[vent.ID]
	require.NotNil(t, got)
	assert.True(t, got.Armed)
	require.NotNil(t, got.PuffedAt)
	first := *got.PuffedAt

	ticks(s, int(GasVentPuffEvery*30)+1)
	got = trapsIn(runState(t, s, ids[0]))[vent.ID]
	require.NotNil(t, got.PuffedAt)
	assert.InDelta(t, first+GasVentPuffEvery, *got.PuffedAt, 1.0/30+1e-9, "the next puff 6 s on")
}

// FS-5FZ4J §I R47: a poisoned delver's poisoned_for, the seconds left, rides
// the public player state, so a teammate sees it; absent when not poisoned.
func TestRunState_PoisonedForOnThePublicPlayerState(t *testing.T) {
	s, ids := trapsRun(t, 7, 2)
	poisoned := delverEntity(t, s, ids[0])
	for _, other := range runState(t, s, ids[1]).OtherPlayers {
		assert.Zero(t, other.PoisonedFor, "not poisoned: absent")
	}

	systems.Poison(poisoned, PoisonDuration)
	tick(s)

	own := runState(t, s, ids[0]).CurrentPlayer
	assert.InDelta(t, PoisonDuration-1.0/30, own.PoisonedFor, 1e-6)
	others := runState(t, s, ids[1]).OtherPlayers
	require.Len(t, others, 1)
	assert.InDelta(t, PoisonDuration-1.0/30, others[0].PoisonedFor, 1e-6, "a teammate sees it")

	frame := frameOf(t, s, types.WorldTypeRun, ids[1])
	assert.NotContains(t, frame["current_player"], "poisoned_for", "absent when not poisoned")
}
