package game

import (
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// braziersRun is floor 1 of a seeded run of delvers delvers with Braziers
// forced and no monster on it, the delvers' ids and the floor's seal.
func braziersRun(t *testing.T, seed uint64, delvers int) (*Session, []uuid.UUID, *ecs.Entity) {
	t.Helper()
	forceSeal(t, components.SealBraziers)
	s, ids := dungeonRun(t, seed, delvers, 0)
	require.NotNil(t, s.dungeon, "seed %d: a dungeon floor", seed)
	clearMonsters(s)
	seals := entitiesWith(s, ecs.ComponentTypeSeal)
	require.Len(t, seals, 1, "seed %d: one seal", seed)
	return s, ids, seals[0]
}

// clearMonsters takes every monster off the floor.
func clearMonsters(s *Session) {
	for _, m := range monstersInWorld(s.EntityManager) {
		s.EntityManager.RemoveEntity(m.ID)
	}
}

// entitiesWith is every entity of the floor carrying componentType.
func entitiesWith(s *Session, componentType ecs.ComponentType) []*ecs.Entity {
	var out []*ecs.Entity
	for _, e := range s.EntityManager.GetAllEntities() {
		if e.HasComponent(componentType) {
			out = append(out, e)
		}
	}
	return out
}

// passSeconds ticks the floor for secs seconds, the party kept standing and
// any ambush taken off so nothing but the clock moves.
func passSeconds(s *Session, secs float64) {
	for range int(secs * float64(constants.GameFrameRate)) {
		clearMonsters(s)
		keepStanding(s.EntityManager)
		tick(s)
	}
}

// FS-5FZ4J §E R34, §A R5: a Braziers seal has three braziers, each in a room
// of its own, none in the start room, the stairs room or a hidden room, each
// carrying an ambush. Checked over many seeds.
func TestBraziers_ThreeInRoomsOfTheirOwn(t *testing.T) {
	for seed := uint64(1); seed <= 25; seed++ {
		s, _, _ := braziersRun(t, seed, 1)
		braziers := piecesOfKind(s, components.SealPieceBrazier)
		require.Len(t, braziers, BrazierCount, "seed %d", seed)
		rooms := map[int]bool{}
		for _, b := range braziers {
			at := transformOf(t, b)
			room := s.dungeon.roomAt(at.X, at.Y)
			assert.NotEqual(t, s.dungeon.layout.Roles.Start, room, "seed %d: not the start room", seed)
			assert.NotEqual(t, s.dungeon.layout.Roles.Stairs, room, "seed %d: not the stairs room", seed)
			assert.False(t, s.dungeon.isHidden(room), "seed %d: not a hidden room", seed)
			rooms[room] = true
			assert.True(t, b.HasComponent(ecs.ComponentTypeAmbush), "seed %d: each wakes an ambush", seed)
			assert.False(t, pieceOf(b).Active, "seed %d: cold", seed)
		}
		assert.Len(t, rooms, BrazierCount, "seed %d: a room each", seed)
	}
}

// FS-5FZ4J §E R34, §B R10: with one delver in play at the first lighting the
// window is 90 s, so three lit 80 s apart from the first break the seal and
// open the gate.
func TestBraziers_OneDelver_ThreeLitIn80Seconds_BreakTheSeal(t *testing.T) {
	s, ids, seal := braziersRun(t, 7, 1)
	braziers := piecesOfKind(s, components.SealPieceBrazier)

	pull(t, s, ids[0], braziers[0])
	assert.True(t, pieceOf(braziers[0]).Active, "lit")
	passSeconds(s, 40)
	pull(t, s, ids[0], braziers[1])
	passSeconds(s, 40)
	require.False(t, sealComponentOf(seal).Broken, "two of three")
	pull(t, s, ids[0], braziers[2])

	assert.True(t, sealComponentOf(seal).Broken, "all three lit inside the solo window")
	assert.True(t, barrierOpen(gateOf(t, s)), "the gate opens with it")
}

// FS-5FZ4J §E R34: with two delvers in play the window is 60 s; when it ends
// with a brazier cold every brazier goes out, and the next lighting starts a
// new window in which three lit break the seal.
func TestBraziers_TwoDelvers_WindowOf60_ExpiryPutsEveryBrazierOut(t *testing.T) {
	s, ids, seal := braziersRun(t, 7, 2)
	braziers := piecesOfKind(s, components.SealPieceBrazier)

	pull(t, s, ids[0], braziers[0])
	assert.InDelta(t, BrazierWindow, sealComponentOf(seal).WindowLeft, 0.001, "the party's window")
	pull(t, s, ids[1], braziers[1])
	passSeconds(s, BrazierWindow+0.5)

	for _, b := range braziers {
		assert.False(t, pieceOf(b).Active, "the window ran out: every brazier is out")
	}
	assert.Zero(t, sealComponentOf(seal).WindowLeft, "no window runs")
	assert.False(t, sealComponentOf(seal).Broken)

	pull(t, s, ids[0], braziers[2])
	assert.InDelta(t, BrazierWindow, sealComponentOf(seal).WindowLeft, 0.001, "a new window")
	pull(t, s, ids[0], braziers[0])
	pull(t, s, ids[1], braziers[1])
	assert.True(t, sealComponentOf(seal).Broken, "three lit in the new window")
}

// FS-5FZ4J §E R34, Edge States: the window is sized by who is in play at the
// first lighting: a delver dying during it changes nothing.
func TestBraziers_WindowSizedAtTheFirstLighting(t *testing.T) {
	s, ids, seal := braziersRun(t, 7, 2)
	braziers := piecesOfKind(s, components.SealPieceBrazier)

	pull(t, s, ids[0], braziers[0])
	hc := healthComponentOf(delverEntity(t, s, ids[1]))
	hc.CurrentHealth, hc.IsEliminated = 0, true
	tick(s)

	assert.InDelta(t, BrazierWindow, sealComponentOf(seal).WindowLeft, 0.1, "still the party's 60 s")
}

// FS-5FZ4J §E R34, §B R14: a brazier's first lighting wakes its ambush on the
// lighter; lighting it again in a later window wakes none.
func TestBraziers_FirstLightingWakesAnAmbush_OnceEach(t *testing.T) {
	s, ids, _ := braziersRun(t, 7, 2)
	braziers := piecesOfKind(s, components.SealPieceBrazier)

	pull(t, s, ids[0], braziers[0])
	pack := monstersInWorld(s.EntityManager)
	require.GreaterOrEqual(t, len(pack), AmbushSizeMin, "the first lighting wakes a pack")
	lighter := delverEntity(t, s, ids[0])
	for _, m := range pack {
		assert.Equal(t, lighter.ID, monsterOf(m).LastAttacker, "hunting the lighter")
	}

	passSeconds(s, BrazierWindow+0.5)
	require.False(t, pieceOf(braziers[0]).Active, "out with the window")
	pull(t, s, ids[0], braziers[0])
	assert.Empty(t, monstersInWorld(s.EntityManager), "its one ambush is spent")
}

// FS-5FZ4J §I R46: window_ends_in rides the seal while a window runs, counting
// down, and is absent before the first lighting and once the seal breaks.
func TestBraziers_Wire_WindowEndsIn(t *testing.T) {
	s, ids, _ := braziersRun(t, 7, 1)
	braziers := piecesOfKind(s, components.SealPieceBrazier)

	before := runState(t, s, ids[0]).Seal
	require.NotNil(t, before)
	assert.Equal(t, "braziers", before.Kind)
	assert.Zero(t, before.WindowEndsIn, "no window yet")

	pull(t, s, ids[0], braziers[0])
	passSeconds(s, 10)
	running := runState(t, s, ids[0])
	assert.InDelta(t, BrazierWindowSolo-10, running.Seal.WindowEndsIn, 0.1)
	lit := 0
	for _, p := range running.SealPieces {
		if p.Kind == "brazier" && p.Active {
			lit++
		}
	}
	assert.Equal(t, 1, lit, "a lit brazier is active on the wire")

	pull(t, s, ids[0], braziers[1])
	pull(t, s, ids[0], braziers[2])
	broken := runState(t, s, ids[0]).Seal
	assert.True(t, broken.Broken)
	assert.Zero(t, broken.WindowEndsIn, "no window once broken")
}
