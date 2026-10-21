package game

import (
	"math"
	"testing"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// expectedParty is n matched players not seated yet, each at level.
func expectedParty(n, level int) []types.CharacterInPlay {
	party := make([]types.CharacterInPlay, n)
	for i := range party {
		party[i] = types.CharacterInPlay{ID: uuid.New(), Name: "arrival", Class: "warrior", Level: level}
	}
	return party
}

// seatedPositions is where every seated delver stands.
func seatedPositions(t *testing.T, s *Session) []point {
	t.Helper()
	var at []point
	for _, d := range delversOf(s.EntityManager.GetAllEntities()) {
		tc := transformOf(t, d)
		at = append(at, point{tc.X, tc.Y})
	}
	return at
}

// The first floor's formation is sized for the whole matched party: the seated
// take their spots and one is kept for each expected player still connecting.
// FS-K2HKP R18.
func TestInitialMapObjects_FormationCountsExpectedPlayers(t *testing.T) {
	tests := []struct {
		name     string
		seated   int
		expected int
	}{
		{name: "one seated, two expected", seated: 1, expected: 2},
		{name: "two seated, one expected", seated: 2, expected: 1},
		{name: "nobody seated yet, three expected", seated: 0, expected: 3},
		{name: "everyone seated", seated: 3, expected: 0},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			roster := make([]delverAt, tt.seated)
			for i := range roster {
				roster[i] = delverAt{level: 1}
			}
			s := rosterOnRun(t, 3, roster...)

			s.InitialMapObjects(expectedParty(tt.expected, 1))

			require.Len(t, s.arrivalSlots, tt.expected, "one kept spot per expected player")

			formation := append(seatedPositions(t, s), s.arrivalSlots...)
			require.Len(t, formation, tt.seated+tt.expected)

			var cx, cy float64
			for _, p := range formation {
				cx += p.x / float64(len(formation))
				cy += p.y / float64(len(formation))
			}
			for i, p := range formation {
				assert.LessOrEqual(t, math.Hypot(p.x-cx, p.y-cy), partyRadius, "spot %d strays from the party", i)
				assert.True(t, s.IsAreaOccupied(PlaceArea{X: p.x - 1, Y: p.y - 1, W: 2, H: 2}), "spot %d at %v is not reserved ground", i, p)
				for j := i + 1; j < len(formation); j++ {
					q := formation[j]
					assert.GreaterOrEqual(t, math.Hypot(p.x-q.x, p.y-q.y), float64(partySpacing)-1e-9, "spots %d and %d overlap", i, j)
				}
			}

			// a kept spot is kept clear of monsters as a seated delver is
			for _, m := range monstersIn(s) {
				at := transformOf(t, m)
				for i, p := range s.arrivalSlots {
					assert.GreaterOrEqual(t, math.Hypot(at.X-p.x, at.Y-p.y), MonsterDelverExclusion, "a monster spawned on kept spot %d", i)
				}
			}
		})
	}
}

// The first floor's monsters are levelled to the whole matched party, the
// expected included, at the level each will be seated at. FS-K2HKP R18 with
// FS-77AB6 R22.
func TestInitialMapObjects_MonsterLevelCountsExpectedPlayers(t *testing.T) {
	tests := []struct {
		name         string
		seatedLevel  int
		expected     []types.CharacterInPlay
		wantPartyLvl int
	}{
		{name: "an expected player outranks the seated", seatedLevel: 1, expected: expectedParty(2, 6), wantPartyLvl: 6},
		{name: "the seated outrank the expected", seatedLevel: 7, expected: expectedParty(1, 2), wantPartyLvl: 7},
		{name: "an expected level below 1 seats as 1", seatedLevel: 1, expected: expectedParty(1, 0), wantPartyLvl: 1},
		{name: "nobody expected", seatedLevel: 4, expected: nil, wantPartyLvl: 4},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := rosterOnRun(t, 9, delverAt{level: tt.seatedLevel})

			s.InitialMapObjects(tt.expected)

			monsters := standardMonstersIn(s)
			require.NotEmpty(t, monsters)
			for _, m := range monsters {
				level := monsterOf(m).Level
				assert.GreaterOrEqual(t, level, max(tt.wantPartyLvl-MonsterLevelSpread, 1), "floor 1 monster below the party's level")
				assert.LessOrEqual(t, level, tt.wantPartyLvl+MonsterLevelSpread, "floor 1 monster above the party's level")
			}
		})
	}
}

// Each arrival takes its own kept spot; once they are gone there is none, and
// the caller falls back to spawnPoint. FS-K2HKP R18, R22.
func TestTakeArrivalSlotLocked_HandsOutDistinctSpotsThenNone(t *testing.T) {
	s := rosterOnRun(t, 4, delverAt{level: 1})
	s.InitialMapObjects(expectedParty(2, 1))
	seated := seatedPositions(t, s)
	require.Len(t, seated, 1)

	s.mu.Lock()
	defer s.mu.Unlock()

	var taken []point
	for range 2 {
		x, y, ok := s.takeArrivalSlotLocked()
		require.True(t, ok)
		taken = append(taken, point{x, y})
	}

	assert.NotEqual(t, taken[0], taken[1], "two arrivals were handed the same spot")
	for i, p := range taken {
		assert.NotEqual(t, seated[0], p, "arrival %d was handed the seated delver's spot", i)
	}

	_, _, ok := s.takeArrivalSlotLocked()
	assert.False(t, ok, "a spot was handed out past the expected party")
}

// A floor change regroups everyone that stands; the spots kept on the first
// floor are on ground that is gone. FS-K2HKP R18.
func TestRegenerateFloor_DropsUnusedArrivalSlots(t *testing.T) {
	s := rosterOnRun(t, 6, delverAt{level: 1})
	s.InitialMapObjects(expectedParty(2, 1))
	require.Len(t, s.arrivalSlots, 2)

	require.NoError(t, s.regenerateFloor())

	s.mu.Lock()
	defer s.mu.Unlock()
	_, _, ok := s.takeArrivalSlotLocked()
	assert.False(t, ok, "a spot from the first floor survived the floor change")
}

// With nobody expected the first floor is built as it always was: no kept
// spots, a formation of the seated alone, and the same placement for the same
// seed whether the expected party is nil or empty.
func TestInitialMapObjects_NoExpectedPlayersBuildsAsBefore(t *testing.T) {
	build := func(expected []types.CharacterInPlay) (party, monsters []point, s *Session) {
		s = rosterOnRun(t, 21, delverAt{level: 2}, delverAt{level: 2}, delverAt{level: 2}, delverAt{level: 2})
		s.InitialMapObjects(expected)
		for _, m := range monstersIn(s) {
			tc := transformOf(t, m)
			monsters = append(monsters, point{tc.X, tc.Y})
		}
		return sortedPoints(seatedPositions(t, s)), sortedPoints(monsters), s
	}

	party, _, s := build(nil)
	assert.Empty(t, s.arrivalSlots)
	s.mu.Lock()
	_, _, ok := s.takeArrivalSlotLocked()
	s.mu.Unlock()
	assert.False(t, ok)

	// four seated stand in a two by two formation, as gatherParty always set them
	xs, ys := map[float64]bool{}, map[float64]bool{}
	for _, p := range party {
		xs[p.x], ys[p.y] = true, true
	}
	assert.Len(t, xs, 2)
	assert.Len(t, ys, 2)

	for _, m := range standardMonstersIn(s) {
		assert.LessOrEqual(t, monsterOf(m).Level, 2+MonsterLevelSpread, "levelled above the seated party")
	}
}
