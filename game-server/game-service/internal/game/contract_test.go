package game

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// contractRun is a run of height 5 on floor 2 for delvers, with no encounter,
// merchant or respite on it, every delver in the start room.
func contractRun(t *testing.T, seed uint64, delvers int) (*Session, []uuid.UUID, []*ecs.Entity) {
	t.Helper()
	s, ids := dungeonRun(t, seed, delvers, 0, withTuning(func(t *floorTuning) {
		t.encounterFloorChance, t.forcedEncounterKind = 0, ""
		t.merchantFloorChance, t.fountainFloorChance, t.hallowedAltarRunChance = 0, 0, 0
	}))
	s.sender = &recordingSender{}
	currentFloor(t, s).Count = 5
	require.NoError(t, s.regenerateFloor())
	require.NotNil(t, s.dungeon, "seed %d: floor 2 is a dungeon floor", seed)
	// the floor's own monsters kept off, so only the mark and its call fight
	clearMonsters(s)
	var bodies []*ecs.Entity
	for _, id := range ids {
		b := delverEntity(t, s, id)
		farFrom(t, s, b)
		bodies = append(bodies, b)
	}
	return s, ids, bodies
}

// FS-4EC7Z §E R16, Edge States "Two contracts": a contract is once a delve;
// a second is refused contract_taken, by the taker or anyone else.
func TestTakeContract_Twice_RefusedContractTaken(t *testing.T) {
	s, ids, _ := contractRun(t, 1, 2)
	require.NoError(t, s.TakeContract(ids[0]))

	assert.ErrorIs(t, s.TakeContract(ids[0]), ErrContractTaken)
	assert.ErrorIs(t, s.TakeContract(ids[1]), ErrContractTaken)
	assert.Len(t, contractMarks(s), 1, "one mark")
}

// contractMarks is the floor's contract marks.
func contractMarks(s *Session) []*ecs.Entity {
	var out []*ecs.Entity
	for _, e := range entitiesWith(s, ecs.ComponentTypeEnemy) {
		if monsterOf(e).Archetype == components.MonsterArchetypeContractMark {
			out = append(out, e)
		}
	}
	return out
}

// FS-4EC7Z §E R16: a taker out of play, dead or escaped, is refused, and so
// is a contract on the top floor, a floor without stairs; nothing is taken,
// so a later contract in play stands.
func TestTakeContract_Refusals_NothingTaken(t *testing.T) {
	t.Run("taker dead", func(t *testing.T) {
		s, ids, bodies := contractRun(t, 2, 2)
		kill(t, bodies[0])
		tick(s)
		assert.ErrorIs(t, s.TakeContract(ids[0]), ErrDelverOutOfPlay)
		assert.Empty(t, contractMarks(s))
		assert.NoError(t, s.TakeContract(ids[1]), "not taken by the refusal")
	})
	t.Run("taker escaped", func(t *testing.T) {
		s, ids, bodies := contractRun(t, 2, 1)
		markEscaped(t, bodies[0])
		assert.ErrorIs(t, s.TakeContract(ids[0]), ErrDelverOutOfPlay)
	})
	t.Run("not seated", func(t *testing.T) {
		s, _, _ := contractRun(t, 2, 1)
		assert.ErrorIs(t, s.TakeContract(uuid.New()), ErrDelverOutOfPlay)
	})
	t.Run("the top floor", func(t *testing.T) {
		s, ids, _ := contractRun(t, 2, 1)
		currentFloor(t, s).Count = 2
		assert.ErrorIs(t, s.TakeContract(ids[0]), ErrContractNoStairs)
		assert.Empty(t, contractMarks(s))
		_, taken := s.contract()
		assert.False(t, taken)
	})
	t.Run("no run-level entity", func(t *testing.T) {
		s, ids, _ := contractRun(t, 2, 1)
		runLevel, ok := runLevelEntity(s.EntityManager.GetAllEntities())
		require.True(t, ok)
		s.EntityManager.RemoveEntity(runLevel.ID)
		err := s.TakeContract(ids[0])
		assert.ErrorIs(t, err, ErrNoFloors, "a world with no floors, not a floor short of rooms")
		assert.NotErrorIs(t, err, ErrNoMarkRoom)
		assert.Empty(t, contractMarks(s))
	})
}

// theMark is the floor's one contract mark.
func theMark(t *testing.T, s *Session) *ecs.Entity {
	t.Helper()
	marks := contractMarks(s)
	require.Len(t, marks, 1)
	return marks[0]
}

// FS-4EC7Z §E R17, §F R24: over a seed sweep the mark stands in a room at
// least the median walk from the taker, never the start, the stairs, a hidden
// or a respite room, at least MonsterDelverExclusion from every delver; a
// contract_mark in one of its two looks with that look's server name, the
// boss plate, at the floor's champion level.
func TestTakeContract_TheMarksRoomSpawnAndLook(t *testing.T) {
	looks := map[string]bool{}
	for seed := uint64(1); seed <= 16; seed++ {
		s, ids, bodies := contractRun(t, seed, 2)
		// the second delver stands elsewhere, so the exclusion is from both
		other := s.dungeon.roomCentre(s.dungeon.roomsFarthestFirst()[0])
		transformOf(t, bodies[1]).X, transformOf(t, bodies[1]).Y = other.x, other.y
		taker := transformOf(t, bodies[0])
		field := s.walkField(taker.X, taker.Y)
		require.NoError(t, s.TakeContract(ids[0]), "seed %d", seed)

		mark := theMark(t, s)
		at := transformOf(t, mark)
		d := s.dungeon
		room := d.roomAt(at.X, at.Y)
		require.GreaterOrEqual(t, room, 0, "seed %d: in a room", seed)
		var walks []int
		for r := range d.layout.Rooms {
			if w := d.roomWalk(field, r); w >= 0 {
				walks = append(walks, w)
			}
		}
		assert.GreaterOrEqual(t, float64(d.roomWalk(field, room)), medianOf(walks), "seed %d: at least the median walk", seed)
		assert.True(t, d.markRoomOpen(room), "seed %d: not start, stairs, hidden or respite", seed)
		for _, b := range bodies {
			body := transformOf(t, b)
			assert.GreaterOrEqual(t, math.Hypot(body.X-at.X, body.Y-at.Y), MonsterDelverExclusion, "seed %d", seed)
		}

		monster := monsterOf(mark)
		assert.Contains(t, MarkLooks, monster.Look)
		assert.Equal(t, MarkNames[monster.Look], monster.Name)
		assert.True(t, monster.Boss, "the boss plate")
		assert.False(t, monster.Elite)
		depth := currentFloor(t, s).Depth
		assert.Equal(t, demonLevel(s.floorPartyLevel(depth), depth), monster.Level, "the floor's champion level")
		looks[monster.Look] = true
	}
	assert.Len(t, looks, len(MarkLooks), "both looks drawn")
}

// FS-4EC7Z §E R18: the mark's health is a champion's at its level × (1 +
// 0.5 × (living delvers − 1)), the dead not counted.
func TestTakeContract_HealthScaledByLivingDelvers(t *testing.T) {
	for _, tc := range []struct {
		delvers, dead int
		factor        float64
	}{{1, 0, 1}, {2, 0, 1.5}, {4, 0, 2.5}, {4, 2, 1.5}} {
		s, ids, bodies := contractRun(t, 5, tc.delvers)
		for _, b := range bodies[len(bodies)-tc.dead:] {
			kill(t, b)
		}
		tick(s)
		require.NoError(t, s.TakeContract(ids[0]))
		mark := theMark(t, s)
		level := monsterOf(mark).Level
		champion := monsterSheets[components.MonsterArchetypeContractMark].statsAt(level).champion(level).HP
		health := npcHealth(mark)
		assert.Equal(t, int(math.Round(float64(champion)*tc.factor)), health.MaxHealth, "%d delvers, %d dead", tc.delvers, tc.dead)
		assert.Equal(t, health.MaxHealth, health.CurrentHealth, "at full health")
	}
}

// markedRun is a contract taken on floor 2 by the first of delvers, its mark
// found.
func markedRun(t *testing.T, seed uint64, delvers int) (*Session, []uuid.UUID, []*ecs.Entity, *ecs.Entity) {
	t.Helper()
	s, ids, bodies := contractRun(t, seed, delvers)
	require.NoError(t, s.TakeContract(ids[0]))
	return s, ids, bodies, theMark(t, s)
}

// sturdy gives a delver health enough to stand a mark's blows a while.
func sturdy(t *testing.T, delver *ecs.Entity) {
	t.Helper()
	hurt(t, delver, 100000, 100000)
}

// struckWithin ticks up to secs until a tick costs the delver health,
// reporting whether one did.
func struckWithin(t *testing.T, s *Session, delver *ecs.Entity, secs float64) bool {
	t.Helper()
	for range seconds(secs) {
		was := healthComponent(t, delver).CurrentHealth
		tick(s)
		if healthComponent(t, delver).CurrentHealth < was {
			return true
		}
	}
	return false
}

// FS-4EC7Z §E R18: each of the mark's hits that costs health poisons, as a
// gas trap does (FS-5FZ4J §D R29); a turned cutthroat's hit does not.
func TestMark_PoisonBlades_AHitThatCostsHealthPoisons(t *testing.T) {
	s, _, bodies, mark := markedRun(t, 3, 1)
	sturdy(t, bodies[0])
	standBeside(t, s, bodies[0], mark, 45)
	require.True(t, struckWithin(t, s, bodies[0], 4), "the mark struck")
	left, poisoned := systems.PoisonedFor(bodies[0])
	assert.True(t, poisoned, "its blade poisons")
	assert.InDelta(t, PoisonDuration, left, 1)

	s2, _, bodies2 := contractRun(t, 3, 1)
	sturdy(t, bodies2[0])
	at := transformOf(t, bodies2[0])
	CreateMonsterEntity(s2.EntityManager, MonsterConfig{Archetype: components.MonsterArchetypeCutthroat, Level: 1, X: at.X + 40, Y: at.Y})
	require.True(t, struckWithin(t, s2, bodies2[0], 4), "the cutthroat struck")
	_, poisoned = systems.PoisonedFor(bodies2[0])
	assert.False(t, poisoned, "a cutthroat's blade is clean")
}

// setShare sets mark's health to share of its max.
func setShare(mark *ecs.Entity, share float64) {
	health := npcHealth(mark)
	health.CurrentHealth = int(math.Floor(float64(health.MaxHealth) * share))
}

func markOf(t *testing.T, e *ecs.Entity) *components.MarkComponent {
	t.Helper()
	mc, ok := e.GetComponent(ecs.ComponentTypeMark)
	require.True(t, ok)
	return mc.(*components.MarkComponent)
}

// FS-4EC7Z §E R18: at half its health, once, the mark calls three
// `cutthroat` monsters beside it, each hunting the delver nearest it, at
// the floor's monster level; lower still, it calls no more.
func TestMark_AtHalfHealth_CallsThreeCutthroatsOnce(t *testing.T) {
	s, _, bodies, mark := markedRun(t, 4, 2)
	setShare(mark, 0.51)
	tick(s)
	assert.Empty(t, turnedCutthroats(s), "not above half")

	// the second delver nearer the mark
	near := s.dungeon.roomCentre(s.dungeon.roomAt(transformOf(t, mark).X, transformOf(t, mark).Y))
	transformOf(t, bodies[1]).X, transformOf(t, bodies[1]).Y = near.x, near.y
	setShare(mark, 0.5)
	tick(s)
	called := turnedCutthroats(s)
	require.Len(t, called, MarkCallCount)
	at := transformOf(t, mark)
	for _, c := range called {
		monster := monsterOf(c)
		ca := transformOf(t, c)
		assert.Less(t, math.Hypot(ca.X-at.X, ca.Y-at.Y), 4*s.dungeon.layout.CellSize, "beside it")
		assert.Equal(t, s.floorMonsterLevel(), monster.Level)
		assert.Contains(t, CutthroatLooks, monster.Look)
	}
	assert.True(t, markOf(t, mark).Called)
	tick(s)
	for _, c := range called {
		assert.Equal(t, bodies[1].ID, monsterOf(c).Target, "it hunts the delver nearest the mark")
	}

	setShare(mark, 0.3)
	tick(s)
	assert.Len(t, turnedCutthroats(s), MarkCallCount, "once")
}

// FS-4EC7Z §E R18: at a quarter of its health, once, the mark flees to the
// room farthest by walk from the nearest delver, answering no hit on the
// way; arrived, it heals a fifth of its max health and fights again from
// there. Lower still, it never flees again.
func TestMark_AtAQuarter_FleesToTheFarthestRoomAndHealsOnce(t *testing.T) {
	s, _, bodies, mark := markedRun(t, 6, 1)
	taker := transformOf(t, bodies[0])
	field := s.walkField(taker.X, taker.Y)
	farthest, walk := -1, -1
	for r := range s.dungeon.layout.Rooms {
		if w := s.dungeon.roomWalk(field, r); w > walk {
			farthest, walk = r, w
		}
	}

	setShare(mark, 0.25)
	health := npcHealth(mark)
	fledAt := health.CurrentHealth
	tick(s)
	monster := monsterOf(mark)
	require.True(t, monster.Flight.Fleeing, "it flees")
	assert.True(t, markOf(t, mark).Called, "a quarter is past half: the call came too")
	to := s.dungeon.roomAt(monster.Flight.X, monster.Flight.Y)
	assert.Equal(t, farthest, to, "to the room farthest by walk from the nearest delver")
	// the called cutthroats kept off the taker, so the contract stands
	for _, c := range turnedCutthroats(s) {
		s.EntityManager.RemoveEntity(c.ID)
	}

	arrived := false
	for range seconds(MarkFleeMaxSeconds + 1) {
		// a hit on the way is not answered
		monster.LastAttacker = bodies[0].ID
		tick(s)
		if !monster.Flight.Fleeing {
			arrived = true
			break
		}
		assert.Equal(t, uuid.Nil, monster.Target, "it turns on no one while it flees")
	}
	require.True(t, arrived)
	at := transformOf(t, mark)
	assert.Equal(t, farthest, s.dungeon.roomAt(at.X, at.Y), "it reached the far room")
	assert.Equal(t, fledAt+int(math.Round(float64(health.MaxHealth)*MarkFleeHeal)), health.CurrentHealth, "a fifth of its max healed")
	assert.Equal(t, components.Flight{}, monster.Flight, "the flight taken up")
	assert.Equal(t, at.X, monster.HomeX, "its new home")

	setShare(mark, 0.1)
	tick(s)
	assert.False(t, monster.Flight.Fleeing, "once")
	assert.Equal(t, int(math.Floor(float64(health.MaxHealth)*0.1)), health.CurrentHealth, "and no second heal")
}

// FS-4EC7Z §E R18, Edge States: one hit past both half and a quarter fires
// both, the call first: the cutthroats stand beside where it was hit, then
// it flees.
func TestMark_OneHitPastBoth_CallsThenFlees(t *testing.T) {
	s, _, _, mark := markedRun(t, 7, 1)
	at := *transformOf(t, mark)
	setShare(mark, 0.1)
	tick(s)
	called := turnedCutthroats(s)
	require.Len(t, called, MarkCallCount, "the call")
	assert.True(t, monsterOf(mark).Flight.Fleeing, "and the flight")
	for _, c := range called {
		ca := transformOf(t, c)
		assert.Less(t, math.Hypot(ca.X-at.X, ca.Y-at.Y), 4*s.dungeon.layout.CellSize, "called where it stood when hit")
	}
}

// slayMark has the delver of id, at body, strike the mark at 1 health
// through the real combat.
func slayMark(t *testing.T, s *Session, id uuid.UUID, body, mark *ecs.Entity) {
	t.Helper()
	standBeside(t, s, body, mark, 45)
	npcHealth(mark).CurrentHealth = 1
	require.NoError(t, s.handleAttack(id, mark.ID))
	tick(s)
	require.Equal(t, 0, npcHealth(mark).CurrentHealth, "the mark died on the tick")
}

func contractOf(t *testing.T, s *Session) *components.ContractComponent {
	t.Helper()
	c, ok := s.contract()
	require.True(t, ok, "a contract was taken")
	return c
}

// FS-4EC7Z §E R19: the mark killed by the taker settles the contract: the
// taker gains Contract Settled, the mark drops nothing and pays each delver
// an elite's experience, not a boss's.
func TestContract_TheTakersKill_Settles(t *testing.T) {
	s, ids, bodies, mark := markedRun(t, 8, 2)
	piles := len(dropPiles(s))
	before := experienceOf(t, s, ids[1])
	level := monsterOf(mark).Level

	slayMark(t, s, ids[0], bodies[0], mark)

	c := contractOf(t, s)
	assert.Equal(t, components.ContractSettled, c.State)
	assert.Empty(t, c.Heading, "no heading once settled")
	assert.True(t, systems.ContractSettled(bodies[0]), "the taker's Contract Settled")
	assert.False(t, systems.ContractSettled(bodies[1]), "the taker's only")
	assert.Len(t, dropPiles(s), piles, "the mark drops nothing")

	base := float64(killExperienceBase[components.MonsterArchetypeDemon])
	elite := int(math.Round(base * (1 + KillExperienceLevelGrowth*float64(level-1)) * EliteExperienceMultiplier))
	assert.Equal(t, elite, experienceOf(t, s, ids[1])-before, "an elite's experience")
}

// FS-4EC7Z §E R19: the mark killed by another party member, or by a hired
// ally (its hirer credited), settles it too, and only the taker gains the
// buff.
func TestContract_AnotherMembersOrAnAllysKill_SettlesForTheTaker(t *testing.T) {
	s, ids, bodies, mark := markedRun(t, 9, 2)
	slayMark(t, s, ids[1], bodies[1], mark)
	assert.Equal(t, components.ContractSettled, contractOf(t, s).State)
	assert.True(t, systems.ContractSettled(bodies[0]))
	assert.False(t, systems.ContractSettled(bodies[1]), "the killer is not the taker")

	s, ids, bodies, mark = markedRun(t, 9, 2)
	npcHealth(mark).CurrentHealth = 0
	s.advanceContract(0, []systems.KillRecord{{MonsterEntityID: mark.ID, KillerMemberID: ids[1], ByAlly: true}})
	assert.Equal(t, components.ContractSettled, contractOf(t, s).State, "an ally's kill")
	assert.True(t, systems.ContractSettled(bodies[0]))
}

// FS-4EC7Z §E R19: Contract Settled is kept across a climb and lost on the
// taker's death; the contract stays settled.
func TestContract_Settled_KeptAcrossFloorsLostOnDeath(t *testing.T) {
	s, ids, bodies, mark := markedRun(t, 10, 1)
	slayMark(t, s, ids[0], bodies[0], mark)
	require.True(t, systems.ContractSettled(bodies[0]))

	require.NoError(t, s.regenerateFloor())
	tick(s)
	assert.True(t, systems.ContractSettled(bodies[0]), "kept on the next floor")
	assert.Equal(t, components.ContractSettled, contractOf(t, s).State)

	kill(t, bodies[0])
	tick(s)
	assert.False(t, systems.ContractSettled(bodies[0]), "lost on death")
	assert.Equal(t, components.ContractSettled, contractOf(t, s).State)
}

// FS-4EC7Z §E R20: the party climbing with the mark alive loses the
// contract, the mark gone with its floor; so does the taker's death, the
// mark staying a monster on its floor; and a second contract is still
// refused.
func TestContract_LostOnAClimbOrTheTakersDeath(t *testing.T) {
	s, ids, _, _ := markedRun(t, 11, 1)
	require.NoError(t, s.regenerateFloor())
	tick(s)
	assert.Equal(t, components.ContractLost, contractOf(t, s).State, "lost on a climb")
	assert.Empty(t, contractOf(t, s).Heading)
	assert.ErrorIs(t, s.TakeContract(ids[0]), ErrContractTaken, "once a delve")

	s, ids, bodies, mark := markedRun(t, 11, 2)
	kill(t, bodies[0])
	tick(s)
	assert.Equal(t, components.ContractLost, contractOf(t, s).State, "lost on the taker's death")
	assert.Greater(t, npcHealth(mark).CurrentHealth, 0, "the mark stays")
	assert.Len(t, contractMarks(s), 1)

	slayMark(t, s, ids[1], bodies[1], mark)
	assert.Equal(t, components.ContractLost, contractOf(t, s).State, "a lost contract stays lost")
	assert.False(t, systems.ContractSettled(bodies[1]))
}

// FS-4EC7Z §E R18, R20: a lost contract's mark is still the mark while it
// lives: at half its health it still calls its three cutthroats.
func TestContract_Lost_TheMarkStillCallsAtHalf(t *testing.T) {
	s, _, bodies, mark := markedRun(t, 11, 2)
	kill(t, bodies[0])
	tick(s)
	require.Equal(t, components.ContractLost, contractOf(t, s).State)

	setShare(mark, 0.5)
	tick(s)
	assert.True(t, markOf(t, mark).Called)
	assert.Len(t, turnedCutthroats(s), MarkCallCount, "it calls whatever the contract's state")
}

// FS-4EC7Z §E R20, Edge States "The taker disconnects": the taker leaving
// the run loses the contract.
func TestContract_LostWhenTheTakerLeaves(t *testing.T) {
	s, ids, _, _ := markedRun(t, 12, 2)
	tick(s)
	require.Equal(t, components.ContractActive, contractOf(t, s).State, "it stands while they are seated")
	s.mu.Lock()
	s.removePlayerLocked(ids[0])
	s.mu.Unlock()
	tick(s)
	assert.Equal(t, components.ContractLost, contractOf(t, s).State)
}

// FS-4EC7Z §E R21: a direction is one of eight compass words, north the
// top of the map (-y).
func TestCompassWord_EightWords(t *testing.T) {
	for _, tc := range []struct {
		dx, dy float64
		want   string
	}{
		{1, 0, "east"}, {1, -1, "north-east"}, {0, -1, "north"}, {-1, -1, "north-west"},
		{-1, 0, "west"}, {-1, 1, "south-west"}, {0, 1, "south"}, {1, 1, "south-east"},
		{10, -3, "east"}, {10, -5, "north-east"}, {-3, 10, "south"},
	} {
		assert.Equal(t, tc.want, compassWord(tc.dx, tc.dy), "(%v, %v)", tc.dx, tc.dy)
	}
}

// FS-4EC7Z §E R21: from the take, the taker's heading names the mark's
// direction from them, refreshed every 5 s and not between: a move of the
// taker shows only at the next refresh.
func TestContract_Heading_RefreshedEveryFiveSeconds(t *testing.T) {
	s, _, bodies, mark := markedRun(t, 14, 1)
	m := transformOf(t, mark)
	taker := transformOf(t, bodies[0])
	assert.Equal(t, compassWord(m.X-taker.X, m.Y-taker.Y), contractOf(t, s).Heading, "given at the take")

	// the mark pinned, the taker moved to its east
	monsterOf(mark).AggroRadius = 0
	hold := func() {
		monsterOf(mark).Wander = components.Wandering{}
		transformOf(t, mark).X, transformOf(t, mark).Y = m.X, m.Y
	}
	east := *m
	taker.X, taker.Y = east.X+400, east.Y
	for range seconds(ContractHeadingInterval) - 2 {
		hold()
		tick(s)
		taker.X, taker.Y = east.X+400, east.Y
	}
	assert.NotEqual(t, "west", contractOf(t, s).Heading, "not refreshed before 5 s")
	for range 3 {
		hold()
		tick(s)
		taker.X, taker.Y = east.X+400, east.Y
	}
	assert.Equal(t, "west", contractOf(t, s).Heading, "refreshed at 5 s: the mark lies west")
}
