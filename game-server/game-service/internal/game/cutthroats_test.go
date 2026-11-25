package game

import (
	"cmp"
	"math"
	"slices"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// cutthroatsRun is a forced Cutthroats run on floor 2 for delvers, every
// delver in the start room, the parley's draw falling hostile at hostile (1
// or 0 forces it).
func cutthroatsRun(t *testing.T, seed uint64, delvers int, hostile float64) (*Session, []uuid.UUID, []*ecs.Entity) {
	t.Helper()
	s, ids := encounterRun(t, seed, delvers, 5, components.EncounterCutthroats)
	require.NotNil(t, s.dungeon, "seed %d: floor 2 is a dungeon floor", seed)
	s.tuning.cutthroatHostileChance = hostile
	var bodies []*ecs.Entity
	for _, id := range ids {
		b := delverEntity(t, s, id)
		farFrom(t, s, b)
		bodies = append(bodies, b)
	}
	return s, ids, bodies
}

// cutthroatsOf is the floor's Cutthroats state.
func cutthroatsOf(t *testing.T, s *Session) *components.CutthroatsComponent {
	t.Helper()
	e, _, ok := theEncounter(s)
	require.True(t, ok)
	cc, ok := e.GetComponent(ecs.ComponentTypeCutthroats)
	require.True(t, ok)
	return cc.(*components.CutthroatsComponent)
}

// turnedCutthroats is the floor's cutthroat monsters.
func turnedCutthroats(s *Session) []*ecs.Entity {
	var out []*ecs.Entity
	for _, e := range entitiesWith(s, ecs.ComponentTypeEnemy) {
		if monsterOf(e).Archetype == components.MonsterArchetypeCutthroat {
			out = append(out, e)
		}
	}
	return out
}

// talkTo stands body beside npc and has the delver talk to it.
func talkTo(t *testing.T, s *Session, id uuid.UUID, body, npc *ecs.Entity) {
	t.Helper()
	standBeside(t, s, body, npc, 45)
	tick(s)
	require.NoError(t, s.handleInteract(id, npc.ID))
}

// FS-4EC7Z §D R14: the draw forced hostile, 3 s after the first talk every
// Cutthroat is a `cutthroat` monster where it stood, in its look, at the
// floor's monster level, a standard one, hunting the delver who talked even
// with another delver nearer.
func TestCutthroats_HostileDraw_TheyTurnOnTheTalker(t *testing.T) {
	s, ids, bodies := cutthroatsRun(t, 3, 2, 1)
	npcs := npcsOf(s)
	require.Len(t, npcs, CutthroatCount)
	type stood struct {
		x, y float64
		look string
	}
	var before []stood
	for _, e := range npcs {
		at := transformOf(t, e)
		before = append(before, stood{at.X, at.Y, npcOf(t, e).Look})
	}
	level := s.floorMonsterLevel()

	talkTo(t, s, ids[0], bodies[0], npcs[0])
	standBeside(t, s, bodies[1], npcs[2], 45)
	assert.Equal(t, components.LineCutthroatGreet, npcOf(t, npcs[0]).Line, "the greeting first")
	ticks(s, seconds(CutthroatParleyDelay)-2)
	assert.Empty(t, turnedCutthroats(s), "not before 3 s")

	// the draw, the turn line, then the turn on the next tick
	ticks(s, 4)
	assert.Empty(t, npcsOf(s), "no Cutthroat stands as an NPC")
	turned := turnedCutthroats(s)
	require.Len(t, turned, CutthroatCount)
	for i, m := range turned {
		monster := monsterOf(m)
		at := transformOf(t, m)
		assert.Equal(t, level, monster.Level, "the floor's monster level")
		assert.False(t, monster.Elite, "a standard monster")
		assert.Contains(t, before, stood{at.X, at.Y, monster.Look}, "monster %d stands where a Cutthroat stood, in its look", i)
	}
	tick(s)
	for _, m := range turned {
		assert.Equal(t, bodies[0].ID, monsterOf(m).Target, "it hunts the talker")
	}
	assert.Equal(t, components.FateHostile, cutthroatsOf(t, s).Fate)
}

// FS-4EC7Z §D R14: the hostile draw's turn line is said by the Cutthroat
// talked to while they still stand as NPCs, so it reaches the wire; they
// turn on the next tick.
func TestCutthroats_HostileDraw_TheTurnLineFirst(t *testing.T) {
	s, ids, bodies := cutthroatsRun(t, 4, 1, 1)
	npcs := npcsOf(s)
	talkTo(t, s, ids[0], bodies[0], npcs[1])
	for range seconds(CutthroatParleyDelay) + 2 {
		if cutthroatsOf(t, s).Fate != components.FateUndrawn {
			break
		}
		tick(s)
	}
	require.Equal(t, components.FateTurning, cutthroatsOf(t, s).Fate)
	require.Len(t, npcsOf(s), CutthroatCount, "still NPCs on the draw's tick")
	assert.Equal(t, components.LineCutthroatTurn, npcOf(t, npcs[1]).Line, "the one talked to turns first")
	assert.Empty(t, turnedCutthroats(s))

	tick(s)
	assert.Len(t, turnedCutthroats(s), CutthroatCount)
}

// secretDoors is the floor's secret door entities.
func secretDoors(s *Session) []*ecs.Entity {
	var out []*ecs.Entity
	for _, e := range entitiesWith(s, ecs.ComponentTypeBarrier) {
		if isSecretDoor(e) {
			out = append(out, e)
		}
	}
	return out
}

func detectableOf(t *testing.T, e *ecs.Entity) *components.DetectableComponent {
	t.Helper()
	dc, ok := e.GetComponent(ecs.ComponentTypeDetectable)
	require.True(t, ok)
	return dc.(*components.DetectableComponent)
}

// doorsByNearness is doors from the one nearest any of npcs to the farthest,
// measured to their cells.
func doorsByNearness(t *testing.T, doors, npcs []*ecs.Entity) []*ecs.Entity {
	t.Helper()
	nearness := func(door *ecs.Entity) float64 {
		best := math.Inf(1)
		for _, spot := range detectableOf(t, door).Spots {
			for _, n := range npcs {
				at := transformOf(t, n)
				best = math.Min(best, math.Hypot(spot.X-at.X, spot.Y-at.Y))
			}
		}
		return best
	}
	sorted := slices.Clone(doors)
	slices.SortFunc(sorted, func(a, b *ecs.Entity) int { return cmp.Compare(nearness(a), nearness(b)) })
	return sorted
}

// parley talks to a Cutthroat and ticks past the draw; it returns the one
// talked to.
func parley(t *testing.T, s *Session, id uuid.UUID, body *ecs.Entity) *ecs.Entity {
	t.Helper()
	speaker := npcsOf(s)[0]
	talkTo(t, s, id, body, speaker)
	ticks(s, seconds(CutthroatParleyDelay)+2)
	return speaker
}

// FS-4EC7Z §D R14, §F R28: the draw forced peaceful, the Cutthroat talked to
// gives the tip, and the floor's unopened secret door nearest them is
// detected and revealed; the other is not revealed. They stay peaceful NPCs.
func TestCutthroats_PeacefulDraw_TheNearestSecretDoorIsRevealed(t *testing.T) {
	s, ids, bodies := cutthroatsRun(t, 20, 1, 0)
	doors := secretDoors(s)
	require.Len(t, doors, 2, "seed 20's floor 2 holds two secret doors")
	byNear := doorsByNearness(t, doors, npcsOf(s))
	for _, d := range doors {
		require.False(t, detectableOf(t, d).Revealed)
	}

	speaker := parley(t, s, ids[0], bodies[0])
	assert.Equal(t, components.FatePeaceful, cutthroatsOf(t, s).Fate)
	assert.Equal(t, components.LineCutthroatTip, npcOf(t, speaker).Line)
	assert.True(t, detectableOf(t, byNear[0]).Detected, "the nearest is detected")
	assert.True(t, detectableOf(t, byNear[0]).Revealed, "and revealed")
	assert.False(t, detectableOf(t, byNear[1]).Revealed, "the farther is not")
	assert.Empty(t, turnedCutthroats(s))
	for _, e := range npcsOf(s) {
		assert.Equal(t, components.StancePeaceful, npcOf(t, e).Stance)
	}
}

// FS-4EC7Z §D R14: an opened secret door is never the one revealed: the
// nearest unopened one is.
func TestCutthroats_PeacefulDraw_PassesAnOpenedDoor(t *testing.T) {
	s, ids, bodies := cutthroatsRun(t, 20, 1, 0)
	byNear := doorsByNearness(t, secretDoors(s), npcsOf(s))
	s.openSecretDoor(byNear[0])

	parley(t, s, ids[0], bodies[0])
	assert.False(t, detectableOf(t, byNear[0]).Revealed, "open, it is passed over")
	assert.True(t, detectableOf(t, byNear[1]).Revealed)
	assert.True(t, detectableOf(t, byNear[1]).Detected)
}

// FS-4EC7Z §D R14, §F R26 (amended 2026-11-25): with no unopened secret door
// on the floor, the tip is lore: `cutthroat_lore` said, nothing revealed, and
// lore again on a later talk.
func TestCutthroats_PeacefulDraw_NoDoor_TheTipIsLore(t *testing.T) {
	s, ids, bodies := cutthroatsRun(t, 10, 1, 0)
	require.Empty(t, secretDoors(s), "seed 10's floor 2 holds no secret door")

	speaker := parley(t, s, ids[0], bodies[0])
	assert.Equal(t, components.FatePeaceful, cutthroatsOf(t, s).Fate)
	assert.Equal(t, components.LineCutthroatLore, npcOf(t, speaker).Line)
	assert.Empty(t, turnedCutthroats(s))

	// another Cutthroat than the speaker: npcsOf's order is the map's, and
	// changes call to call
	var other *ecs.Entity
	for _, e := range npcsOf(s) {
		if e.ID != speaker.ID {
			other = e
			break
		}
	}
	require.NotNil(t, other)
	talkTo(t, s, ids[0], bodies[0], other)
	assert.Equal(t, components.LineCutthroatLore, npcOf(t, other).Line, "lore again")
}

// FS-4EC7Z §D R14, §A R4: a talk while the draw is due greets again and does
// not restart it; once it fell peaceful, a talk gives the tip again.
func TestCutthroats_TalkingAgain(t *testing.T) {
	s, ids, bodies := cutthroatsRun(t, 5, 1, 0)
	npcs := npcsOf(s)
	talkTo(t, s, ids[0], bodies[0], npcs[0])
	ticks(s, seconds(1))
	due := cutthroatsOf(t, s).DrawIn
	talkTo(t, s, ids[0], bodies[0], npcs[1])
	assert.Equal(t, components.LineCutthroatGreet, npcOf(t, npcs[1]).Line)
	assert.Less(t, cutthroatsOf(t, s).DrawIn, due, "the draw is not put back")

	ticks(s, seconds(CutthroatParleyDelay))
	require.Equal(t, components.FatePeaceful, cutthroatsOf(t, s).Fate)
	given := npcOf(t, npcs[0]).Line
	require.Contains(t, []components.EncounterLine{components.LineCutthroatTip, components.LineCutthroatLore}, given)
	talkTo(t, s, ids[0], bodies[0], npcs[2])
	assert.Equal(t, given, npcOf(t, npcs[2]).Line, "the tip the draw gave, again")
}

// FS-4EC7Z §D R14: the draw is one draw at 50% from the world's spawn
// source: over a seed sweep at the default chance, about half the parleys
// fall hostile.
func TestCutthroats_TheDrawIsHalfAndHalf(t *testing.T) {
	const runs = 40
	hostile := 0
	for seed := uint64(1); seed <= runs; seed++ {
		s, ids, bodies := cutthroatsRun(t, seed, 1, defaultFloorTuning().cutthroatHostileChance)
		parley(t, s, ids[0], bodies[0])
		switch fate := cutthroatsOf(t, s).Fate; fate {
		case components.FateHostile:
			hostile++
		default:
			assert.Equal(t, components.FatePeaceful, fate, "seed %d: drawn once it is due", seed)
		}
	}
	assert.InDelta(t, CutthroatHostileChance, float64(hostile)/runs, 0.2)
}

// assertHiredBy holds that the floor's Cutthroats are all hirer's allies,
// each having acknowledged the hire.
func assertHiredBy(t *testing.T, s *Session, hirer uuid.UUID) {
	t.Helper()
	npcs := npcsOf(s)
	require.Len(t, npcs, CutthroatCount)
	for _, e := range npcs {
		npc := npcOf(t, e)
		assert.Equal(t, components.StanceAlly, npc.Stance)
		assert.Equal(t, hirer, npc.HirerID)
		assert.Equal(t, components.LineAllyAck, npc.Line, "each acknowledges")
	}
	assert.True(t, cutthroatsOf(t, s).Hired)
}

// FS-4EC7Z §D R15: hiring before the 3 s draw makes the Cutthroats the
// hirer's allies and cancels the draw: forced hostile, they never turn.
func TestHire_BeforeTheDraw_CancelsIt(t *testing.T) {
	s, ids, bodies := cutthroatsRun(t, 6, 1, 1)
	npcs := npcsOf(s)
	talkTo(t, s, ids[0], bodies[0], npcs[0])
	ticks(s, seconds(1))

	require.NoError(t, s.Hire(npcs[2].ID, ids[0]))
	assertHiredBy(t, s, ids[0])
	keepHirerStill(t, s, bodies[0], seconds(CutthroatParleyDelay)+2)
	assert.Empty(t, turnedCutthroats(s), "the draw never comes")
	assert.Equal(t, components.FateUndrawn, cutthroatsOf(t, s).Fate)
	assert.Equal(t, CutthroatCount, s.livingAllies())
}

// FS-4EC7Z §D R15: Cutthroats are willing before any talk and after a
// peaceful draw.
func TestHire_WillingBeforeAParleyAndAfterAPeacefulDraw(t *testing.T) {
	s, ids, _ := cutthroatsRun(t, 7, 1, 0)
	require.NoError(t, s.Hire(npcsOf(s)[0].ID, ids[0]))
	assertHiredBy(t, s, ids[0])

	s, ids, bodies := cutthroatsRun(t, 8, 1, 0)
	parley(t, s, ids[0], bodies[0])
	require.Equal(t, components.FatePeaceful, cutthroatsOf(t, s).Fate)
	require.NoError(t, s.Hire(npcsOf(s)[1].ID, ids[0]))
	assertHiredBy(t, s, ids[0])
}

// FS-4EC7Z §D R15, §F R27: a group already allied is refused
// already_hired, freed Captives as hired Cutthroats; any other group, or a
// turned one, not_willing; an unknown id is not found.
func TestHire_Refusals(t *testing.T) {
	t.Run("already hired", func(t *testing.T) {
		s, ids, _ := cutthroatsRun(t, 9, 2, 0)
		require.NoError(t, s.Hire(npcsOf(s)[0].ID, ids[0]))
		assert.ErrorIs(t, s.Hire(npcsOf(s)[1].ID, ids[1]), ErrAlreadyHired)
		assertHiredBy(t, s, ids[0])
	})
	t.Run("freed captives are already allied", func(t *testing.T) {
		s, ids, _ := captivesRun(t, 3, 1)
		require.NoError(t, s.OpenCage(theCage(t, s).ID, ids[0]))
		assert.ErrorIs(t, s.Hire(npcsOf(s)[0].ID, ids[0]), ErrAlreadyHired)
	})
	t.Run("caged captives", func(t *testing.T) {
		s, ids, _ := captivesRun(t, 4, 1)
		assert.ErrorIs(t, s.Hire(npcsOf(s)[0].ID, ids[0]), ErrNotWilling)
		assert.Equal(t, components.StanceCaged, npcOf(t, npcsOf(s)[0]).Stance)
	})
	t.Run("pilgrims", func(t *testing.T) {
		s, _ := pilgrimsRun(t, 4, 1)
		assert.ErrorIs(t, s.Hire(npcsOf(s)[0].ID, delverIDs(s)[0]), ErrNotWilling)
		assert.Zero(t, s.livingAllies())
	})
	t.Run("turning and turned hostile", func(t *testing.T) {
		s, ids, bodies := cutthroatsRun(t, 10, 1, 1)
		npc := npcsOf(s)[0]
		talkTo(t, s, ids[0], bodies[0], npc)
		for range seconds(CutthroatParleyDelay) + 2 {
			if cutthroatsOf(t, s).Fate == components.FateTurning {
				break
			}
			tick(s)
		}
		require.Equal(t, components.FateTurning, cutthroatsOf(t, s).Fate)
		assert.ErrorIs(t, s.Hire(npc.ID, ids[0]), ErrNotWilling, "the turn line said")

		tick(s)
		turned := turnedCutthroats(s)
		require.NotEmpty(t, turned)
		assert.ErrorIs(t, s.Hire(turned[0].ID, ids[0]), ErrNotWilling, "a monster now")
		assert.ErrorIs(t, s.Hire(npc.ID, ids[0]), ErrEntityNotFound, "the NPC it was is gone")
		assert.Zero(t, s.livingAllies())
	})
	t.Run("unknown id", func(t *testing.T) {
		s, ids, _ := cutthroatsRun(t, 11, 1, 0)
		assert.ErrorIs(t, s.Hire(uuid.New(), ids[0]), ErrEntityNotFound)
	})
}

// FS-4EC7Z §C R10, §D R15: a hire that would take the party past 3 allies is
// refused whole, too_many_allies, and the group stays peaceful and unhired.
func TestHire_PastTheAllyCap_RefusedWhole(t *testing.T) {
	s, ids, _ := cutthroatsRun(t, 12, 1, 0)
	other := CreateEncounterNPCEntity(s.EntityManager, EncounterNPCConfig{Kind: components.EncounterNPCCaptive, Stance: components.StancePeaceful, Health: 100})
	require.NoError(t, s.makeAllies([]*ecs.Entity{other}, ids[0]))

	// a Cutthroat of the encounter's own, not the captive allied above
	_, enc, _ := theEncounter(s)
	assert.ErrorIs(t, s.Hire(enc.NPCs[0], ids[0]), ErrTooManyAllies)
	assert.False(t, cutthroatsOf(t, s).Hired)
	for _, e := range npcsOf(s) {
		if e.ID == other.ID {
			continue
		}
		assert.Equal(t, components.StancePeaceful, npcOf(t, e).Stance)
	}
	assert.Equal(t, 1, s.livingAllies())
}

// FS-4EC7Z §A R1-R3, §D R14: the Cutthroats are an encounter kind; three
// peaceful Cutthroats stand in the encounter room, in their looks, each with a
// hired Cutthroat's health at the floor's monster level.
func TestCutthroats_ThreePeacefulInTheRoom(t *testing.T) {
	assert.Contains(t, EncounterKinds, components.EncounterCutthroats)
	for seed := uint64(1); seed <= 10; seed++ {
		s, _, _ := cutthroatsRun(t, seed, 1, 0)
		_, enc, ok := theEncounter(s)
		require.True(t, ok, "seed %d: forced, the floor holds one", seed)
		assert.Equal(t, components.EncounterCutthroats, enc.Kind)
		health := allyHealth(components.EncounterNPCCutthroat, s.floorMonsterLevel())
		npcs := npcsOf(s)
		require.Len(t, npcs, CutthroatCount)
		for _, e := range npcs {
			npc := npcOf(t, e)
			at := transformOf(t, e)
			assert.Equal(t, components.EncounterNPCCutthroat, npc.Kind)
			assert.Equal(t, components.StancePeaceful, npc.Stance)
			assert.Contains(t, CutthroatLooks, npc.Look)
			assert.Equal(t, enc.Room, s.dungeon.roomAt(at.X, at.Y), "seed %d: in the encounter room", seed)
			assert.Equal(t, health, npcHealth(e).MaxHealth)
		}
		assert.False(t, cutthroatsOf(t, s).Parleyed, "nothing starts before a talk")
	}
}

// FS-4EC7Z §D R14, §F R24: the `cutthroat` archetype has its own sheet,
// spawns with its look, gives standard experience and drops as standard
// fodder does.
func TestCutthroatArchetype_SheetExperienceAndDrops(t *testing.T) {
	sheet, ok := monsterSheets[components.MonsterArchetypeCutthroat]
	require.True(t, ok)
	assert.Equal(t, "Cutthroat", sheet.Name)
	assert.Equal(t, GhoulMonsterDrop, MonsterDrops[components.MonsterArchetypeCutthroat])
	assert.Positive(t, killExperienceBase[components.MonsterArchetypeCutthroat])

	m := CreateMonsterEntity(ecs.NewEntityManager(), MonsterConfig{Archetype: components.MonsterArchetypeCutthroat, Level: 4, Look: "cutthroat_b", X: 10, Y: 20})
	monster := monsterOf(m)
	assert.Equal(t, "cutthroat_b", monster.Look)
	assert.Equal(t, "Cutthroat", monster.Name)
	assert.Equal(t, sheet.statsAt(4), statsOf(t, m))
}

// FS-4EC7Z §D R14: a Cutthroat hurt before the turn is as hurt a monster.
func TestCutthroats_TheTurnKeepsTheirWounds(t *testing.T) {
	s, ids, bodies := cutthroatsRun(t, 13, 1, 1)
	for _, e := range npcsOf(s) {
		h := npcHealth(e)
		h.CurrentHealth = h.MaxHealth / 2
	}
	parley(t, s, ids[0], bodies[0])
	turned := turnedCutthroats(s)
	require.Len(t, turned, CutthroatCount)
	for _, m := range turned {
		h := npcHealth(m)
		assert.InDelta(t, h.MaxHealth/2, h.CurrentHealth, 1)
	}
}
