package game

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
)

// FieldPlayerRespawnDelay is how long a fallen field player lies before they
// stand at the entrance again, s. FS-X2F2H §Requirements 23, D11.
const FieldPlayerRespawnDelay = 3.0

/**
* settleFieldDeaths is a field's share of the elimination on a tick: the
* players who fell on it are counted in their visits' deaths, never recorded as
* eliminations, and every fallen body counts down to rising at the entrance
* (FS-X2F2H §Requirements 22–24). Nothing they wear or carry is touched.
**/
func (s *Session) settleFieldDeaths(deltaTime float64, entities []*ecs.Entity, fallen []types.Player) {
	s.mu.Lock()
	place := s.place
	for _, player := range fallen {
		if visit, open := s.visits[player.ID]; open {
			visit.Deaths++
			s.visits[player.ID] = visit
		}
	}
	s.mu.Unlock()

	if place == nil {
		return
	}
	systems.NewFieldRespawnSystem(place.Arrival.X, place.Arrival.Y, FieldPlayerRespawnDelay).Update(deltaTime, entities)
}
