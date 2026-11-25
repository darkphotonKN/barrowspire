package game

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// captivesRun is a forced Captives run on floor 2 for delvers, every delver
// in the start room.
func captivesRun(t *testing.T, seed uint64, delvers int) (*Session, []uuid.UUID, []*ecs.Entity) {
	t.Helper()
	s, ids := encounterRun(t, seed, delvers, 5, components.EncounterCaptives)
	require.NotNil(t, s.dungeon, "seed %d: floor 2 is a dungeon floor", seed)
	var bodies []*ecs.Entity
	for _, id := range ids {
		b := delverEntity(t, s, id)
		farFrom(t, s, b)
		bodies = append(bodies, b)
	}
	return s, ids, bodies
}

// captivesOf is the floor's Captives state.
func captivesOf(t *testing.T, s *Session) *components.CaptivesComponent {
	t.Helper()
	e, _, ok := theEncounter(s)
	require.True(t, ok)
	cc, ok := e.GetComponent(ecs.ComponentTypeCaptives)
	require.True(t, ok)
	return cc.(*components.CaptivesComponent)
}

// theCage is the floor's cage entity.
func theCage(t *testing.T, s *Session) *ecs.Entity {
	t.Helper()
	cages := entitiesWith(s, ecs.ComponentTypeCage)
	require.Len(t, cages, 1)
	return cages[0]
}

func cageOf(t *testing.T, e *ecs.Entity) *components.CageComponent {
	t.Helper()
	cc, ok := e.GetComponent(ecs.ComponentTypeCage)
	require.True(t, ok)
	return cc.(*components.CageComponent)
}

// standAtFixture puts body on e's spot, near enough to interact with it.
func standAtFixture(t *testing.T, body, e *ecs.Entity) {
	t.Helper()
	at := transformOf(t, e)
	b := transformOf(t, body)
	b.X, b.Y = at.X, at.Y+30
}

// keyOnTheGround makes sure the floor's cage key lies: an elite carrying it
// is killed and the tick drops it. It returns the key's entity.
func keyOnTheGround(t *testing.T, s *Session) *ecs.Entity {
	t.Helper()
	if carrier := captivesOf(t, s).Carrier; carrier != uuid.Nil {
		e, ok := s.EntityManager.GetEntity(carrier)
		require.True(t, ok)
		npcHealth(e).CurrentHealth = 0
		tick(s)
	}
	keys := entitiesWith(s, ecs.ComponentTypeCageKey)
	require.Len(t, keys, 1)
	return keys[0]
}

// FS-4EC7Z §D R13: two caged captives stand inside a cage in the encounter
// room; the cage key lies in another room (not the start, stairs, a hidden
// room or a respite's) or rides on one live elite among the floor's
// monsters, each about half the floors over a seed sweep.
func TestCaptives_TheCageAndWhereItsKeyIs(t *testing.T) {
	inRoom, onElite := 0, 0
	for seed := uint64(1); seed <= 30; seed++ {
		s, _ := encounterRun(t, seed, 1, 5, components.EncounterCaptives)
		if s.dungeon == nil {
			continue
		}
		_, enc, has := theEncounter(s)
		require.True(t, has, "seed %d: forced, the floor holds one", seed)
		assert.Equal(t, components.EncounterCaptives, enc.Kind)
		d := s.dungeon
		cage := theCage(t, s)
		at := transformOf(t, cage)
		assert.Equal(t, enc.Room, d.roomAt(at.X, at.Y), "seed %d: the cage stands in the encounter room", seed)
		assert.False(t, cageOf(t, cage).Open, "locked")

		npcs := npcsOf(s)
		require.Len(t, npcs, CaptiveCount)
		for _, e := range npcs {
			npc := npcOf(t, e)
			assert.Equal(t, components.EncounterNPCCaptive, npc.Kind)
			assert.Equal(t, components.StanceCaged, npc.Stance)
			assert.Contains(t, CaptiveLooks, npc.Look)
			c := transformOf(t, e)
			assert.LessOrEqual(t, math.Abs(c.X-at.X), CageHalfSize, "inside the cage")
			assert.LessOrEqual(t, math.Abs(c.Y-at.Y), CageHalfSize)
			assert.Equal(t, systems.BodyCaptive, systems.BodyKindOf(e))
		}

		captives := captivesOf(t, s)
		keys := entitiesWith(s, ecs.ComponentTypeCageKey)
		if captives.Carrier != uuid.Nil {
			onElite++
			assert.Empty(t, keys, "seed %d: carried, it does not lie", seed)
			carrier, ok := s.EntityManager.GetEntity(captives.Carrier)
			require.True(t, ok)
			mc, _ := carrier.GetComponent(ecs.ComponentTypeEnemy)
			monster := mc.(*components.MonsterComponent)
			assert.True(t, monster.Elite, "seed %d: an elite carries it", seed)
			assert.False(t, monster.Boss)
			continue
		}
		inRoom++
		require.Len(t, keys, 1, "seed %d: the key lies", seed)
		k := transformOf(t, keys[0])
		room := d.roomAt(k.X, k.Y)
		require.GreaterOrEqual(t, room, 0, "seed %d: in a room", seed)
		roles := d.layout.Roles
		assert.NotEqual(t, enc.Room, room, "another room")
		assert.NotEqual(t, roles.Start, room)
		assert.NotEqual(t, roles.Stairs, room)
		assert.False(t, d.isHidden(room))
		assert.False(t, d.isRespite(room))
	}
	assert.Greater(t, inRoom, 4, "the key lies in a room on some floors")
	assert.Greater(t, onElite, 4, "an elite carries it on others")
}

// FS-4EC7Z §D R13: an elite carrying the key drops it, as a key fixture,
// where it dies.
func TestCaptives_AnEliteDropsTheKeyWhereItDies(t *testing.T) {
	for seed := uint64(1); seed <= 30; seed++ {
		s, _, _ := captivesRun(t, seed, 1)
		carrier := captivesOf(t, s).Carrier
		if carrier == uuid.Nil {
			continue
		}
		e, _ := s.EntityManager.GetEntity(carrier)
		where := *transformOf(t, e)
		npcHealth(e).CurrentHealth = 0
		tick(s)
		keys := entitiesWith(s, ecs.ComponentTypeCageKey)
		require.Len(t, keys, 1, "dropped")
		k := transformOf(t, keys[0])
		assert.InDelta(t, where.X, k.X, 1)
		assert.InDelta(t, where.Y, k.Y, 1)
		assert.Equal(t, uuid.Nil, captivesOf(t, s).Carrier)
		return
	}
	t.Fatal("no seed put the key on an elite")
}

// FS-4EC7Z §D R13, §F R27: a locked cage without the key is refused
// cage_locked; the key taken (party state, it leaves the floor), the cage
// opens on an interact and the captives become the opener's allies, saying
// their freed line.
func TestCaptives_TheKeyOpensTheCage_TheCaptivesAreTheOpenersAllies(t *testing.T) {
	s, ids, bodies := captivesRun(t, 3, 2)
	sender := s.sender.(*recordingSender)
	cage := theCage(t, s)

	standAtFixture(t, bodies[1], cage)
	tick(s)
	require.NoError(t, s.handleInteract(ids[1], cage.ID))
	assert.Equal(t, RefusalCageLocked, lastReply(t, sender, ids[1])["reason"])
	assert.False(t, cageOf(t, cage).Open)

	key := keyOnTheGround(t, s)
	standAtFixture(t, bodies[0], key)
	ticks(s, 10)
	require.NoError(t, s.handleInteract(ids[0], key.ID))
	_, still := s.EntityManager.GetEntity(key.ID)
	assert.False(t, still, "taken, it leaves the floor")
	assert.True(t, captivesOf(t, s).KeyCarried, "the party carries it")

	// any delver of the party opens it with the key: the second one here
	ticks(s, 10)
	require.NoError(t, s.handleInteract(ids[1], cage.ID))
	assert.True(t, cageOf(t, cage).Open)
	assert.True(t, captivesOf(t, s).Open)
	for _, e := range npcsOf(s) {
		npc := npcOf(t, e)
		assert.Equal(t, components.StanceAlly, npc.Stance)
		assert.Equal(t, ids[1], npc.HirerID, "the opener's allies")
		assert.Equal(t, components.LineCaptiveFreed, npc.Line)
		assert.Equal(t, systems.BodyAlly, systems.BodyKindOf(e))
		assert.True(t, e.HasComponent(ecs.ComponentTypeVelocity), "free, it walks")
	}
}

// FS-4EC7Z §D R13 (FS-X2CMM's Pick the Lock): the open-cage entry point opens
// the cage without its key and frees the captives as the opener's allies; a
// second call on the open cage is refused.
func TestOpenCage_OpensWithoutTheKey(t *testing.T) {
	s, ids, _ := captivesRun(t, 4, 1)
	cage := theCage(t, s)
	require.False(t, captivesOf(t, s).KeyCarried)

	require.NoError(t, s.OpenCage(cage.ID, ids[0]))
	assert.True(t, cageOf(t, cage).Open)
	for _, e := range npcsOf(s) {
		assert.Equal(t, components.StanceAlly, npcOf(t, e).Stance)
		assert.Equal(t, ids[0], npcOf(t, e).HirerID)
	}
	assert.ErrorIs(t, s.OpenCage(cage.ID, ids[0]), ErrCageOpen)
	assert.ErrorIs(t, s.OpenCage(uuid.New(), ids[0]), ErrEntityNotFound)
}

// FS-4EC7Z §C R10, §F R27: a freeing that would take the party past 3
// allies is refused whole, too_many_allies, and the cage stays shut.
func TestCaptives_PastTheAllyCap_TheFreeingIsRefusedWhole(t *testing.T) {
	s, ids, bodies := captivesRun(t, 5, 1)
	sender := s.sender.(*recordingSender)
	cage := theCage(t, s)
	// two allies already: two more would be four
	for range AllyCap - 1 {
		npc := CreateEncounterNPCEntity(s.EntityManager, EncounterNPCConfig{Kind: components.EncounterNPCCaptive, Stance: components.StancePeaceful, Health: 100})
		require.NoError(t, s.makeAllies([]*ecs.Entity{npc}, ids[0]))
	}

	assert.ErrorIs(t, s.OpenCage(cage.ID, ids[0]), ErrTooManyAllies)
	assert.False(t, cageOf(t, cage).Open)
	_, enc, _ := theEncounter(s)
	for _, id := range enc.NPCs {
		e, _ := s.EntityManager.GetEntity(id)
		assert.Equal(t, components.StanceCaged, npcOf(t, e).Stance, "none freed")
	}

	captivesOf(t, s).KeyCarried = true
	standAtFixture(t, bodies[0], cage)
	tick(s)
	require.NoError(t, s.handleInteract(ids[0], cage.ID))
	assert.Equal(t, RefusalTooManyAllies, lastReply(t, sender, ids[0])["reason"])
	assert.False(t, cageOf(t, cage).Open)
}

// FS-4EC7Z §C R10: the cap counts allies across groups: three are made, a
// fourth is refused.
func TestMakeAllies_TheCapOfThree(t *testing.T) {
	s, ids, _ := captivesRun(t, 6, 1)
	captive := func() *ecs.Entity {
		return CreateEncounterNPCEntity(s.EntityManager, EncounterNPCConfig{Kind: components.EncounterNPCCaptive, Stance: components.StancePeaceful, Health: 100})
	}
	require.NoError(t, s.makeAllies([]*ecs.Entity{captive(), captive()}, ids[0]))
	require.NoError(t, s.makeAllies([]*ecs.Entity{captive()}, ids[0]))
	fourth := captive()
	assert.ErrorIs(t, s.makeAllies([]*ecs.Entity{fourth}, ids[0]), ErrTooManyAllies)
	assert.Equal(t, components.StancePeaceful, npcOf(t, fourth).Stance)
	assert.Equal(t, AllyCap, s.livingAllies())
}

// FS-4EC7Z §A R4: talking to a caged captive answers with its plea; to an
// ally, its acknowledgement; neither starts anything.
func TestCaptives_TalkingToThem(t *testing.T) {
	s, ids, bodies := captivesRun(t, 7, 1)
	npc := npcsOf(s)[0]
	standBeside(t, s, bodies[0], npc, 45)
	tick(s)
	require.NoError(t, s.handleInteract(ids[0], npc.ID))
	assert.Equal(t, components.LineCaptivePlea, npcOf(t, npc).Line)

	require.NoError(t, s.OpenCage(theCage(t, s).ID, ids[0]))
	standBeside(t, s, bodies[0], npc, 45)
	ticks(s, 10)
	require.NoError(t, s.handleInteract(ids[0], npc.ID))
	assert.Equal(t, components.LineAllyAck, npcOf(t, npc).Line)
}

// FS-4EC7Z §C R9, R12: on the run's tick a freed captive walks to its hirer;
// when the party climbs, it stays behind, gone with the floor.
func TestAllies_FollowOnTheTick_StayBehindOnAClimb(t *testing.T) {
	s, ids, bodies := captivesRun(t, 8, 1)
	require.NoError(t, s.OpenCage(theCage(t, s).ID, ids[0]))
	allies := npcsOf(s)
	require.Len(t, allies, CaptiveCount)

	// the hirer stands far off in the start room, the floor cleared of
	// monsters the allies would stop to fight: they walk there, by path, and
	// keep within 4 cells of them
	for _, m := range entitiesWith(s, ecs.ComponentTypeEnemy) {
		s.EntityManager.RemoveEntity(m.ID)
	}
	cell := s.dungeon.layout.CellSize
	hirer := transformOf(t, bodies[0])
	keepHirerStill(t, s, bodies[0], seconds(60/constants.PaceScale))
	for _, a := range allies {
		at := transformOf(t, a)
		assert.LessOrEqual(t, math.Hypot(at.X-hirer.X, at.Y-hirer.Y), AllyFollowFarCells*cell+constants.PlayerRadius, "it came to its hirer")
	}

	require.NoError(t, s.regenerateFloor())
	for _, a := range allies {
		_, still := s.EntityManager.GetEntity(a.ID)
		assert.False(t, still, "it never climbs")
	}
	assert.Zero(t, s.livingAllies())
}

// keepHirerStill ticks the run n times with the delver held where they stand,
// and full of health, whatever comes at them.
func keepHirerStill(t *testing.T, s *Session, body *ecs.Entity, n int) {
	t.Helper()
	where := *transformOf(t, body)
	for range n {
		tick(s)
		at := transformOf(t, body)
		at.X, at.Y = where.X, where.Y
		npcHealth(body).CurrentHealth = npcHealth(body).MaxHealth
	}
}
