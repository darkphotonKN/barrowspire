package game

import (
	"log/slog"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/google/uuid"
)

/**
* Builds the hub world's map: boundary walls and nothing else.
*
* Deliberately NOT InitialMapObjects. A run's map is buildings, doors, containers,
* switches, an escape door and a seeded item pool; the hub has none of those. Its
* broadcast carries players (and later NPCs), so those entity kinds never exist
* here rather than being filtered out downstream. FS-0008 §Requirements 3, 7.
*
* Buildings and dressing arrive in I-0047; this is a bare field with edges.
**/
func (s *Session) InitialHubMapObjects() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.mapWidth, s.mapHeight = constants.HubMapWidth, constants.HubMapHeight

	// One synthetic "house" id, since walls are grouped by the building they
	// belong to and the boundary belongs to no building.
	boundaryID := uuid.New()

	const thickness = constants.HubWallThickness
	w, h := constants.HubMapWidth, constants.HubMapHeight

	boundary := []WallConfig{
		{X: 0, Y: 0, Width: w, Height: thickness},             // north
		{X: 0, Y: h - thickness, Width: w, Height: thickness}, // south
		{X: 0, Y: 0, Width: thickness, Height: h},             // west
		{X: w - thickness, Y: 0, Width: thickness, Height: h}, // east
	}

	for _, wall := range boundary {
		CreateWallEntity(s.EntityManager, wall, boundaryID)
	}

	slog.Info("Hub map built", "session_id", s.ID, "width", w, "height", h)
}
