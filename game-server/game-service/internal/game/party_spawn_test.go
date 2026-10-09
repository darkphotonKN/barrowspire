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

// partyRadius is how far from the party's spawn point a grouped delver may stand.
const partyRadius = 100.0

// seatedRun builds a run in the server's order: the roster is seated, then the
// first floor is built around it.
func seatedRun(t *testing.T, delvers int) (*Session, []uuid.UUID) {
	t.Helper()

	s := newSession(&mockSessionCloser{}, nil, &mockStateSerializer{}, ecs.NewEntityManager(), &mockEventEmitter{}, &countingItemsClient{}, RunBounds())
	s.InitialSystems()

	ids := make([]uuid.UUID, delvers)
	for i := range ids {
		ids[i] = uuid.New()
		s.AddPlayer(ids[i], types.CharacterInPlay{Name: "Delver", Class: "warrior"}, "")
	}
	s.InitialMapObjects()

	return s, ids
}

// assertGrouped checks the delvers stand together around one point: each
// within partyRadius of the group's centre, no two bodies overlapping, every
// body inside the floor and clear of its walls, buildings and objects, and
// every monster spawned clear of them all.
func assertGrouped(t *testing.T, s *Session, playerIDs []uuid.UUID) {
	t.Helper()
	r := constants.PlayerRadius

	at := make([]components.TransformComponent, len(playerIDs))
	var cx, cy float64
	for i, id := range playerIDs {
		at[i] = *transformOf(t, delverEntity(t, s, id))
		cx += at[i].X / float64(len(at))
		cy += at[i].Y / float64(len(at))
	}

	entities := s.EntityManager.GetAllEntities()
	keepOut := mapKeepOut(entities)

	for i, p := range at {
		assert.LessOrEqual(t, math.Hypot(p.X-cx, p.Y-cy), partyRadius, "delver %d strays from the party", i)
		assert.True(t, p.X >= r && p.X <= s.mapWidth-r && p.Y >= r && p.Y <= s.mapHeight-r, "delver %d is off the floor at %v", i, p)

		for _, area := range keepOut {
			assert.False(t, area.overlapsBody(p.X, p.Y, r), "delver %d at %v stands in %+v", i, p, area)
		}

		for j := i + 1; j < len(at); j++ {
			q := at[j]
			overlap := math.Abs(p.X-q.X) < 2*r && math.Abs(p.Y-q.Y) < 2*r
			assert.False(t, overlap, "delvers %d and %d overlap at %v and %v", i, j, p, q)
		}
	}

	for _, e := range entities {
		if !e.HasComponent(ecs.ComponentTypeEnemy) {
			continue
		}
		m := transformOf(t, e)
		for i, p := range at {
			assert.GreaterOrEqual(t, math.Hypot(m.X-p.X, m.Y-p.Y), MonsterDelverExclusion, "a monster spawned on delver %d", i)
		}
	}
}

// A run begins with its party together: one random spawn point on open ground,
// everyone set down around it.
func TestFirstFloor_SpawnsThePartyTogether(t *testing.T) {
	for range 25 {
		s, ids := seatedRun(t, 4)
		assertGrouped(t, s, ids)
	}
}

// Every climb sets the living down together again, around a new point; the
// dead stay behind and the escaped are untouched.
func TestClimb_RegroupsTheLivingParty(t *testing.T) {
	for range 25 {
		s, ids := seatedRun(t, 5)
		living, fallen, escaped := ids[:3], ids[3], ids[4]

		hc, _ := delverEntity(t, s, fallen).GetComponent(ecs.ComponentTypeHealth)
		hc.(*components.HealthComponent).CurrentHealth = 0
		hc.(*components.HealthComponent).IsEliminated = true
		pc, _ := delverEntity(t, s, escaped).GetComponent(ecs.ComponentTypePlayer)
		pc.(*components.PlayerComponent).Escape = true
		escapedAt := *transformOf(t, delverEntity(t, s, escaped))

		// scatter the living, as play would
		for i, id := range living {
			*transformOf(t, delverEntity(t, s, id)) = components.TransformComponent{X: 100 + float64(i)*600, Y: 100 + float64(i)*300}
		}
		before := *transformOf(t, delverEntity(t, s, living[0]))

		require.NoError(t, s.regenerateFloor())
		assertGrouped(t, s, living)
		assert.Equal(t, escapedAt, *transformOf(t, delverEntity(t, s, escaped)), "the escaped are not placed")

		// and again on the top floor, at a fresh point
		require.NoError(t, s.regenerateFloor())
		assertGrouped(t, s, living)
		assert.NotEqual(t, before, *transformOf(t, delverEntity(t, s, living[0])))
	}
}

// Placing the party never fails: when no random spot is open it scans the
// floor, and onto a full floor it goes regardless, still inside the map and
// with no two delvers overlapping.
func TestGatherParty_PlacementExhausted_StillPlaces(t *testing.T) {
	const holeW, holeH = 200.0, 200.0
	hole := PlaceArea{X: constants.MapWidth - holeW, Y: constants.MapHeight - holeH, W: holeW, H: holeH}

	tests := []struct {
		name     string
		occupied []PlaceArea
		inHole   bool
	}{
		{
			name: "only a corner of the floor is free",
			occupied: []PlaceArea{
				{X: 0, Y: 0, W: constants.MapWidth, H: constants.MapHeight - holeH},
				{X: 0, Y: constants.MapHeight - holeH, W: constants.MapWidth - holeW, H: holeH},
			},
			inHole: true,
		},
		{
			name:     "the whole floor is taken",
			occupied: []PlaceArea{{X: 0, Y: 0, W: constants.MapWidth, H: constants.MapHeight}},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s, ids := seatedRun(t, 4)
			s.objectOccupiedPlaceAreas = tt.occupied

			s.gatherParty()

			r := constants.PlayerRadius
			for i, id := range ids {
				p := *transformOf(t, delverEntity(t, s, id))
				assert.True(t, p.X >= r && p.X <= s.mapWidth-r && p.Y >= r && p.Y <= s.mapHeight-r, "delver %d is off the floor at %v", i, p)
				if tt.inHole {
					assert.True(t, hole.overlapsBody(p.X, p.Y, r) && p.X-r >= hole.X && p.Y-r >= hole.Y, "delver %d at %v is outside the free corner", i, p)
				}
				for j := i + 1; j < len(ids); j++ {
					q := *transformOf(t, delverEntity(t, s, ids[j]))
					assert.False(t, math.Abs(p.X-q.X) < 2*r && math.Abs(p.Y-q.Y) < 2*r, "delvers %d and %d overlap", i, j)
				}
			}
		})
	}
}
