package game

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// FS-BDRTJ §Change: Endgame test run, R24-R30, R35. I-BDRTJ-3.

// endgameRun is an unstarted endgame test run built the way the server builds
// a run: the run-level entity, then the one delver seated at their level, then
// the first floor.
func endgameRun(t *testing.T, level int) (*Session, uuid.UUID) {
	t.Helper()

	em := ecs.NewEntityManager()
	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, em, &mockEventEmitter{}, &countingItemsClient{}, RunBounds(), withEndgameRunPlan(&endgameRunPlan))
	s.InitialSystems()
	playerID := uuid.New()
	s.AddPlayer(playerID, types.CharacterInPlay{ID: uuid.New(), Name: "Ravek", Class: "warrior", Level: level}, "")
	s.InitialMapObjects(nil)

	return s, playerID
}

// poolArchetypes is every archetype the plan's pool for floor can spawn, a
// goblin's shield look included.
func poolArchetypes(t *testing.T, floor int) map[components.MonsterArchetype]bool {
	t.Helper()

	in := map[components.MonsterArchetype]bool{}
	for _, archetype := range endgameRunPlan.pool(floor).archetypes() {
		in[archetype] = true
	}
	require.Len(t, endgameRunPlan.pool(floor).Members, FloorPoolSize, "floor %d's pool holds five", floor)
	return in
}

// The run starts on floor 6 of a height-10 Spire, and every standard monster on
// it is from floor 6's plan pool at level 26, whatever the delver's level.
// R25-R27.
func TestEndgameRun_StartsOnFloorSixOfTen_FromItsPoolAtTwentySix(t *testing.T) {
	for _, level := range []int{1, 20} {
		s, _ := endgameRun(t, level)

		floor := currentFloor(t, s)
		assert.Equal(t, 6, floor.Depth, "the first floor")
		assert.Equal(t, 10, floor.Count, "the height")

		pool := poolArchetypes(t, 6)
		standard := standardMonstersIn(s)
		require.NotEmpty(t, standard)
		for _, m := range standard {
			monster := monsterOf(m)
			assert.True(t, pool[monster.Archetype], "%s is not in floor 6's pool", monster.Archetype)
			assert.Equal(t, 26, monster.Level, "%s stands at 20 + 6, no spread", monster.Archetype)
		}
	}
}

// darkWarriorFamily is whether a monster is of the capped Dark Warrior family.
func darkWarriorFamily(m *components.MonsterComponent) bool {
	return capped(m.Archetype)
}

// Climbing goes 6 → 10. Every floor's standard monsters are from its own plan
// pool at 20 + floor, at least one of the Dark Warrior family and never more
// than the cap; no floor holds a Blood Demon; floor 10 has no stairs and holds
// Daa'gon at 35 and no champion. Over several runs, since layouts, counts and
// the draws within a pool stay random. R24-R28, R30.
func TestEndgameRun_ClimbsSixToTen_EachFloorOnItsPlan(t *testing.T) {
	for range 4 {
		s, _ := endgameRun(t, 20)

		for depth := 6; depth <= 10; depth++ {
			if depth > 6 {
				require.NoError(t, s.regenerateFloor())
			}
			floor := currentFloor(t, s)
			require.Equal(t, depth, floor.Depth)

			pool := poolArchetypes(t, depth)
			standard := standardMonstersIn(s)
			require.NotEmpty(t, standard, "floor %d", depth)
			darkWarriors := 0
			for _, m := range standard {
				monster := monsterOf(m)
				assert.True(t, pool[monster.Archetype], "floor %d: %s is not in its pool", depth, monster.Archetype)
				assert.Equal(t, 20+depth, monster.Level, "floor %d: %s", depth, monster.Archetype)
				if darkWarriorFamily(monster) {
					darkWarriors++
				}
			}
			assert.GreaterOrEqual(t, darkWarriors, 1, "floor %d holds a Dark Warrior", depth)
			assert.LessOrEqual(t, darkWarriors, min(DarkWarriorCapMax, len(standard)/DarkWarriorPer), "floor %d is within the cap", depth)

			bosses := bossesIn(s)
			assert.Empty(t, bosses[components.MonsterArchetypeBloodDemon], "floor %d: no Blood Demon", depth)
			assert.Empty(t, bosses[components.MonsterArchetypeDemon], "floor %d: Vorsk is never rolled", depth)
			stairs := len(entityIDsWith(s, ecs.ComponentTypeStairs))
			if depth < 10 {
				assert.Empty(t, bosses[championKey], "floor %d: no champion below the top", depth)
				assert.Empty(t, bosses[components.MonsterArchetypeDaagon], "floor %d", depth)
				assert.Equal(t, 1, stairs, "floor %d has its way up", depth)
				continue
			}
			assert.Empty(t, bosses[championKey], "the top holds no champion")
			require.Len(t, bosses[components.MonsterArchetypeDaagon], 1, "the top holds Daa'gon")
			assert.Equal(t, 35, monsterOf(bosses[components.MonsterArchetypeDaagon][0]).Level)
			assert.Zero(t, stairs, "the top has no stairs")
		}
	}
}

// The plan names only variants the roster has, each floor's pool keeps every
// pool's guarantees and a Dark Warrior, and every 26+ variant is on at least
// one floor. A rename on the roster fails here, never as a missing monster in
// a run. R26; Edge States "The plan names a variant FS-C8VM7 does not build".
func TestEndgamePlan_NamesTheRostersVariants_EveryTwentySixPlusOne(t *testing.T) {
	seen := map[components.MonsterArchetype]bool{}
	for floor := endgameRunPlan.FirstFloor; floor <= endgameRunPlan.Height; floor++ {
		named := endgameRunPlan.Pools[floor]
		require.Len(t, named, FloorPoolSize, "floor %d", floor)

		roles := map[monsterRole]int{}
		darkWarriors := 0
		for _, archetype := range named {
			entry, ok := variantOf(archetype)
			require.True(t, ok, "floor %d names %s, which the roster does not have", floor, archetype)
			assert.Equal(t, MaxTier, entry.Variant.Unlock, "floor %d: %s is a 26+ variant", floor, archetype)
			roles[entry.Family.Role]++
			if entry.Family.Capped {
				darkWarriors++
			}
			seen[archetype] = true
		}
		assert.GreaterOrEqual(t, roles[roleBrute], 1, "floor %d: a brute", floor)
		assert.GreaterOrEqual(t, roles[roleFodder], 2, "floor %d: two fodder", floor)
		assert.GreaterOrEqual(t, darkWarriors, 1, "floor %d: a Dark Warrior", floor)
		assert.Len(t, endgameRunPlan.pool(floor).Members, FloorPoolSize, "floor %d", floor)
	}

	for _, entry := range unlockedAt(MaxTier) {
		if entry.Variant.Unlock == MaxTier {
			assert.True(t, seen[entry.Variant.Archetype], "%s is on no floor", entry.Variant.Name)
		}
	}
}

// The plan fixes spawns only: its levels are what a plan run's pool tier
// reads, and Daa'gon's rule over the plan's party level gives 35 on floor 10.
// R27.
func TestEndgamePlan_LevelsAreTwentyPlusTheFloor(t *testing.T) {
	for floor := 6; floor <= 10; floor++ {
		assert.Equal(t, 20+floor, endgameRunPlan.monsterLevel(floor))
		assert.Equal(t, 20+floor, monsterLevel(endgameRunPlan.partyLevel(floor), floor, 0))
	}
	assert.Equal(t, 35, daagonLevel(endgameRunPlan.partyLevel(10), 10))
}

// A run built without the plan is unchanged: it starts on floor 1 and its
// height is rolled. R35.
func TestEndgameRun_ARunWithoutThePlanStartsOnFloorOne(t *testing.T) {
	s := coopRun(t)
	assert.Nil(t, s.endgame)
	assert.Equal(t, 1, currentFloor(t, s).Depth)
	assert.Equal(t, firstFloor, s.startFloor())
}

// ensureDarkWarrior recasts a brute when no Dark Warrior stands, and leaves a
// floor alone whose cap allows none. R28.
func TestEnsureDarkWarrior(t *testing.T) {
	pool := endgameRunPlan.pool(6)
	floorOf := func(n int, archetype components.MonsterArchetype) []*MonsterConfig {
		out := make([]*MonsterConfig, n)
		for i := range out {
			out[i] = &MonsterConfig{Archetype: archetype}
		}
		return out
	}

	brutes := floorOf(DarkWarriorPer, components.MonsterArchetypeBloodTroll)
	ensureDarkWarrior(seeded(), pool, 6, brutes)
	recast := 0
	for _, m := range brutes {
		if capped(m.Archetype) {
			recast++
		}
	}
	assert.Equal(t, 1, recast, "one brute becomes a Dark Warrior")

	few := floorOf(DarkWarriorPer-1, components.MonsterArchetypeBloodTroll)
	ensureDarkWarrior(seeded(), pool, 6, few)
	for _, m := range few {
		assert.False(t, capped(m.Archetype), "a floor whose cap is 0 keeps none")
	}
}

// The run's hub gate stands at (160, 720), its arrival at (300, 720), and is
// not in hubGates. Its range overlaps no other gate's, the dev test room's
// included; its arrival is outside every gate's range; and both stand clear of
// every wall, NPC and resident's quarter. R19.
func TestEndgameRunHubGate_StandsClearOfEverything(t *testing.T) {
	hub := builtHub()
	hub.AddDevTestRoomGate()
	hub.AddEndgameRunGate()

	gate := endgameRunHubGate
	assert.Equal(t, [2]float64{160, 720}, [2]float64{gate.X, gate.Y})
	x, y, ok := hub.GateArrival(components.GateDestinationDevEndgameRun)
	require.True(t, ok)
	assert.Equal(t, [2]float64{300, 720}, [2]float64{x, y})
	for _, g := range hubGates {
		assert.NotEqual(t, components.GateDestinationDevEndgameRun, g.Destination, "kept out of hubGates")
	}

	others := append(append([]hubGate{}, hubGates...), devTestRoomHubGate)
	for _, other := range others {
		assert.GreaterOrEqual(t, math.Hypot(gate.X-other.X, gate.Y-other.Y), 2*constants.GateRange,
			"its range overlaps the %s gate's", other.Destination)
	}
	for _, g := range append(others, gate) {
		assert.Greater(t, math.Hypot(gate.Arrival.X-g.X, gate.Arrival.Y-g.Y), constants.GateRange,
			"its arrival is in the %s gate's range", g.Destination)
	}

	points := map[string][2]float64{"gate": {gate.X, gate.Y}, "arrival": {gate.Arrival.X, gate.Arrival.Y}}
	for what, at := range points {
		for _, wall := range allWalls(hubWalls(t)) {
			assert.Greater(t, wall.distanceTo(at[0], at[1]), constants.PlayerRadius, "the %s touches the wall at %+v", what, wall)
		}
		for _, foot := range footprints(hubWalls(t)) {
			assert.False(t, foot.contains(at[0], at[1]), "the %s is inside the building at %+v", what, foot)
		}
		for _, npc := range npcsIn(hub) {
			assert.Greater(t, math.Hypot(npc.At.X-at[0], npc.At.Y-at[1]), constants.GateRange, "the %s is beside %s", what, npc.Name)
		}
		for _, resident := range hubResidents {
			r := resident.Region
			quarter := box{X: r.X, Y: r.Y, W: r.W, H: r.H}
			assert.Greater(t, quarter.distanceTo(at[0], at[1]), constants.GateRange, "the %s is in %s's quarter", what, resident.Name)
		}
	}
}

// Escaping the run settles it as any run: the run's end publishes what the
// delver carries out, their checked-out gear included. Nothing in the
// settlement looks at the plan. R31, R32.
func TestEndgameRun_EscapingPublishesTheDelversItems(t *testing.T) {
	s, playerID := endgameRun(t, 20)
	outbox := &capturingOutbox{}
	s.sessionCloser = &homeReturner{run: s}
	s.eventEmitter = NewService(committingTxDB(t), outbox, noWake{}, testRetry(t), nil)
	s.sender = &recordingSender{}
	s.endSessionCh = make(chan bool, 64)

	body := delverEntity(t, s, playerID)
	eq, _ := body.GetComponent(ecs.ComponentTypeEquipment)
	weaponID := eq.(*components.EquipmentComponent).WeaponSlot
	require.NotNil(t, weaponID, "the checked-out gear is worn")
	weapon := itemComponent(t, s, *weaponID)

	markEscaped(t, body)
	tick(s)
	require.Len(t, s.endSessionCh, 1, "the run has resolved")
	<-s.endSessionCh
	s.endSession()

	event := outbox.itemsExtracted(t)
	require.Len(t, event.PlayerItems, 1)
	assert.Equal(t, playerID.String(), event.PlayerItems[0].MemberId)
	require.NotNil(t, event.PlayerItems[0].Equipment.GetWeapon(), "the weapon is carried out")
	assert.Equal(t, weapon.InstanceID.String(), event.PlayerItems[0].Equipment.Weapon.InstanceId)
}

// ----- The tome and the altar (I-BDRTJ-4) -----

// endgameTomeRun is an endgame test run for one delver whose replies are
// recorded, on a seeded spawn source.
func endgameTomeRun(t *testing.T, seed uint64) (*Session, uuid.UUID) {
	t.Helper()

	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, &countingItemsClient{}, RunBounds(), withEndgameRunPlan(&endgameRunPlan))
	s.sender = &recordingSender{}
	s.spawnRand = seededSpawns(seed)
	s.InitialSystems()
	playerID := uuid.New()
	s.AddPlayer(playerID, types.CharacterInPlay{ID: uuid.New(), Name: "Ravek", Class: "warrior", Level: 20}, "")
	s.InitialMapObjects(nil)
	return s, playerID
}

// Every endgame test run is a tome run: the tome lies on floor 6 and the altar
// stands on floor 8, each placed by FS-3103M's placement, and no other floor
// holds either. FS-BDRTJ R25, R29.
func TestEndgameRun_TomeOnSixAltarOnEight_OnEverySeed(t *testing.T) {
	for seed := uint64(1); seed <= 6; seed++ {
		s, _ := endgameTomeRun(t, seed)
		plan := planOf(t, s)
		assert.Equal(t, 6, plan.TomeFloor, "seed %d", seed)
		assert.Equal(t, 8, plan.AltarFloor, "seed %d", seed)

		for depth := 6; depth <= 10; depth++ {
			if depth > 6 {
				require.NoError(t, s.regenerateFloor())
			}
			tomes := len(entityIDsWith(s, ecs.ComponentTypeTome))
			altars := len(entityIDsWith(s, ecs.ComponentTypeAltar))
			if s.dungeon == nil {
				assert.Zero(t, tomes+altars, "seed %d floor %d: a fallback floor places neither", seed, depth)
				continue
			}
			assert.Equal(t, boolInt(depth == 6), tomes, "seed %d floor %d: tomes", seed, depth)
			assert.Equal(t, boolInt(depth == 8), altars, "seed %d floor %d: altars", seed, depth)
		}
	}
}

// The plan's tome and altar keep FS-3103M's rules inside the climb: the tome
// on a floor the run builds, the altar above it, never the top. R29.
func TestEndgamePlan_TomeBelowAltarBelowTheTop(t *testing.T) {
	plan := endgameRunPlan
	assert.GreaterOrEqual(t, plan.TomeFloor, plan.FirstFloor)
	assert.Greater(t, plan.AltarFloor, plan.TomeFloor)
	assert.Less(t, plan.AltarFloor, plan.Height)
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// Taken on floor 6 and burned at the altar on floor 8, the tome summons Vorsk
// at 30: the altar floor's plan level, 28, + the demon's 2. FS-BDRTJ R27.
func TestEndgameRun_BurningTheTomeSummonsVorskAtThirty(t *testing.T) {
	s, id := endgameTomeRun(t, 3)
	tome := onlyEntity(t, s, ecs.ComponentTypeTome)
	standBy(t, s, id, tome)
	require.NoError(t, s.handleInteract(id, tome.ID))
	require.NoError(t, s.regenerateFloor())
	require.NoError(t, s.regenerateFloor())
	require.Equal(t, 8, currentFloor(t, s).Depth)

	altar := onlyEntity(t, s, ecs.ComponentTypeAltar)
	standBy(t, s, id, altar)
	before := demonsIn(s)
	require.NoError(t, s.handleInteract(id, altar.ID))

	vorsk := summoned(t, s, before)
	assert.Equal(t, 30, monsterOf(vorsk).Level)
	assert.True(t, monsterOf(vorsk).Boss)
}

// The tome not taken: the altar still stands on floor 8 and gives its lore
// line. FS-BDRTJ Edge States "Tome not picked up".
func TestEndgameRun_TomeNotTaken_TheAltarStillGivesItsLine(t *testing.T) {
	s, id := endgameTomeRun(t, 4)
	require.NoError(t, s.regenerateFloor())
	require.NoError(t, s.regenerateFloor())

	altar := onlyEntity(t, s, ecs.ComponentTypeAltar)
	standBy(t, s, id, altar)
	require.NoError(t, s.handleInteract(id, altar.ID))

	replies := repliesTo(s, id)
	require.NotEmpty(t, replies)
	assert.Equal(t, RefusalAltarWithoutTome, replies[len(replies)-1].Payload["reason"])
	assert.Empty(t, demonsIn(s), "nothing is summoned")
}
