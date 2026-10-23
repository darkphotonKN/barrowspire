package game

import (
	"log/slog"
	"math"
	"slices"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
)

// partySpacing is the distance between neighbouring delvers in the party's
// formation: a body's width and a small gap, so no two overlap.
const partySpacing = 2*constants.PlayerRadius + 10

// partyPlacementAttempts is how many random spots the party tries before the
// placement falls back to scanning the floor.
const partyPlacementAttempts = 100

/**
* gatherParty sets the floor's party down together: one random spawn point on
* open ground, every living, non-escaped delver in a tight formation around it.
* There is no party system yet, so everyone in the run is the party.
*
* It runs on every floor, the first included, after the floor's layout and
* before its monsters, so the monsters spawn clear of where the party stands.
* The spot keeps clear of every occupied area of the floor, as the stairs do,
* and like the stairs it never fails: random spots first, then a scan of the
* floor for the first free one, then the middle of a full floor. The spot is
* drawn from the session's spawn source, so a seeded run places its party, and
* the monsters kept clear of it, the same way every time. Once the party
* stands, its formation is taken ground, so nothing placed after it lands on a
* delver.
*
* expected is how many matched players are not seated yet (FS-K2HKP R18). The
* formation is sized for the seated and the expected together; the seated take
* the first spots, and the rest are kept as arrival slots for the expected to
* take as they are seated (takeArrivalSlotLocked). Only the first floor has
* any expected; on every other floor this is 0 and the formation is exactly
* the seated party's.
**/
func (s *Session) gatherParty(expected int) {
	if s.worldType != types.WorldTypeRun {
		return
	}

	// FS-K2HKP R18: spots an earlier floor kept for arrivals are on ground that
	// is gone; this floor keeps its own, or none
	s.mu.Lock()
	s.arrivalSlots = nil
	s.mu.Unlock()

	party := livingParty(s.EntityManager.GetAllEntities())

	// FS-K2HKP R18: the formation is sized for the whole matched party, so a
	// handoff player arriving later stands with the rest, not at a random spot
	size := len(party) + expected
	if size == 0 {
		return
	}

	cols := int(math.Ceil(math.Sqrt(float64(size))))
	rows := (size + cols - 1) / cols
	area := s.partyArea(float64(cols)*partySpacing, float64(rows)*partySpacing)

	slots := make([]point, size)
	for i := range slots {
		slots[i] = point{
			x: area.X + partySpacing/2 + float64(i%cols)*partySpacing,
			y: area.Y + partySpacing/2 + float64(i/cols)*partySpacing,
		}
	}

	for i, transform := range party {
		transform.X, transform.Y = slots[i].x, slots[i].y
	}

	s.objectOccupiedPlaceAreas = append(s.objectOccupiedPlaceAreas, area)

	// FS-K2HKP R18: what the seated did not take waits for the handoff players
	if expected > 0 {
		s.mu.Lock()
		s.arrivalSlots = slots[len(party):]
		s.mu.Unlock()
	}
}

/**
* takeArrivalSlotLocked is where a handoff player being seated stands: the
* next free spot in the first floor's formation, which it takes, so the next
* arrival gets another (FS-K2HKP R18, R22). ok is false when none is left,
* after a floor change or when every kept spot is taken, and the caller falls
* back to spawnPoint.
*
* Callers hold the world's lock. The seat checks the member is expected and
* creates their body under it, and the spot is taken in that same step, so two
* arrivals seated at once cannot be handed the same spot.
**/
func (s *Session) takeArrivalSlotLocked() (x, y float64, ok bool) {
	if len(s.arrivalSlots) == 0 {
		return 0, 0, false
	}

	slot := s.arrivalSlots[0]
	s.arrivalSlots = s.arrivalSlots[1:]

	return slot.x, slot.y, true
}

// arrivalSlotPositions is a copy of the spots still kept for arrivals, for the
// monsters to keep clear of as they do of the seated (FS-K2HKP R18).
func (s *Session) arrivalSlotPositions() []point {
	s.mu.Lock()
	defer s.mu.Unlock()

	return slices.Clone(s.arrivalSlots)
}

// partyArea finds the w by h area the party's formation stands in.
func (s *Session) partyArea(w, h float64) PlaceArea {
	for range partyPlacementAttempts {
		area := PlaceArea{X: s.spawnRand.Float64() * (s.mapWidth - w), Y: s.spawnRand.Float64() * (s.mapHeight - h), W: w, H: h}
		if !s.IsAreaOccupied(area) {
			return area
		}
	}

	for y := 0.0; y+h <= s.mapHeight; y += partySpacing / 2 {
		for x := 0.0; x+w <= s.mapWidth; x += partySpacing / 2 {
			area := PlaceArea{X: x, Y: y, W: w, H: h}
			if !s.IsAreaOccupied(area) {
				slog.Warn("Party placed by scan: random placement exhausted", "sessionID", s.ID)
				return area
			}
		}
	}

	slog.Error("Party forced into the middle of the floor: no free spot", "sessionID", s.ID)
	return PlaceArea{X: (s.mapWidth - w) / 2, Y: (s.mapHeight - h) / 2, W: w, H: h}
}

// livingParty is where every delver who stands on this floor is: not escaped,
// not left behind, not fallen. It is the one rule for who is on the floor, for
// the party's formation and the monsters' keep-clear alike.
func livingParty(entities []*ecs.Entity) []*components.TransformComponent {
	var party []*components.TransformComponent

	for _, entity := range entities {
		if !systems.InPlay(entity) {
			continue
		}
		if tc, ok := entity.GetComponent(ecs.ComponentTypeTransform); ok {
			party = append(party, tc.(*components.TransformComponent))
		}
	}

	return party
}
