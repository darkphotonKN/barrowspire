package game

import (
	"log/slog"
	"math"
	"math/rand/v2"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
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
* floor for the first free one, then the middle of a full floor.
**/
func (s *Session) gatherParty() {
	if s.worldType != types.WorldTypeRun {
		return
	}

	party := livingParty(s.EntityManager.GetAllEntities())
	if len(party) == 0 {
		return
	}

	cols := int(math.Ceil(math.Sqrt(float64(len(party)))))
	rows := (len(party) + cols - 1) / cols
	area := s.partyArea(float64(cols)*partySpacing, float64(rows)*partySpacing)

	for i, transform := range party {
		transform.X = area.X + partySpacing/2 + float64(i%cols)*partySpacing
		transform.Y = area.Y + partySpacing/2 + float64(i/cols)*partySpacing
	}
}

// partyArea finds the w by h area the party's formation stands in.
func (s *Session) partyArea(w, h float64) PlaceArea {
	for range partyPlacementAttempts {
		area := PlaceArea{X: rand.Float64() * (s.mapWidth - w), Y: rand.Float64() * (s.mapHeight - h), W: w, H: h}
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
// not left behind, not fallen.
func livingParty(entities []*ecs.Entity) []*components.TransformComponent {
	var party []*components.TransformComponent

	for _, entity := range entities {
		pc, isPlayer := entity.GetComponent(ecs.ComponentTypePlayer)
		if !isPlayer {
			continue
		}
		player := pc.(*components.PlayerComponent)
		if player.Escape || player.LeftBehind {
			continue
		}
		if hc, ok := entity.GetComponent(ecs.ComponentTypeHealth); ok && hc.(*components.HealthComponent).IsEliminated {
			continue
		}
		if tc, ok := entity.GetComponent(ecs.ComponentTypeTransform); ok {
			party = append(party, tc.(*components.TransformComponent))
		}
	}

	return party
}
