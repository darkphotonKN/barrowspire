package game

import (
	"log/slog"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

/**
* A run floor's static layout leaves the per-tick state and travels once per
* floor as floor_map (FS-KE075 §F, ADR-0060 Decisions 1–2): its size and its
* walls in today's WallState, house id included. A floor built on a cell grid
* will add its cell size and regions; no floor has one yet, so neither key is
* ever written here. Room roles never leave the server (ADR-0060 Decision 8).
**/

// FloorMapMessage is the current run floor's floor_map, safe to read from any
// goroutine: the message is published whole and nothing writes it after. False
// before a run's first floor stands, and in every world that is not a run.
func (s *Session) FloorMapMessage() (types.Message, bool) {
	if s.worldType != types.WorldTypeRun {
		return types.Message{}, false
	}
	message := s.floorMap.Load()
	if message == nil {
		return types.Message{}, false
	}
	return *message, true
}

// publishFloorMap makes the floor just built at depth the one the map
// describes. Its walls are fresh values, never the pooled backend state's.
func (s *Session) publishFloorMap(depth int) {
	if s.worldType != types.WorldTypeRun {
		return
	}
	s.mu.RLock()
	width, height := s.mapWidth, s.mapHeight
	s.mu.RUnlock()

	message := floorMapMessage(s.ID, depth, width, height, wallStatesOf(s.EntityManager.GetAllEntities()))
	s.floorMap.Store(&message)
}

// sendFloorMap hands the current floor's map to everyone the run's broadcast
// reaches. Called by the loop after a floor change and before the new floor's
// first broadcast, so it is queued ahead of that floor's states. A full queue
// drops it like any frame; the client asks again (FS-KE075 §F R33).
func (s *Session) sendFloorMap() {
	message, ok := s.FloorMapMessage()
	if !ok || s.sender == nil {
		return
	}
	s.mu.RLock()
	recipients := s.recipientsLocked()
	s.mu.RUnlock()

	for _, playerID := range recipients {
		if err := s.sender.SendMessageToPlayer(playerID, message); err != nil {
			slog.Warn("Floor map not delivered, the client asks again", "sessionID", s.ID, "player_id", playerID, "error", err)
		}
	}
}

// floorMapMessage is the floor_map for one floor of buildings: no cell grid.
func floorMapMessage(sessionID uuid.UUID, depth int, width, height float64, walls []*types.WallState) types.Message {
	return types.Message{
		Action: string(constants.ActionFloorMap),
		Payload: map[string]interface{}{
			"session_id": sessionID.String(),
			"floor":      depth,
			"width":      width,
			"height":     height,
			"walls":      walls,
		},
	}
}

// wallStatesOf is every wall among entities as a snapshot used to carry it:
// its house, its id, its top-left corner and its size.
func wallStatesOf(entities []*ecs.Entity) []*types.WallState {
	walls := []*types.WallState{}
	for _, entity := range entities {
		wc, isWall := entity.GetComponent(ecs.ComponentTypeWall)
		if !isWall {
			continue
		}
		tc, hasTransform := entity.GetComponent(ecs.ComponentTypeTransform)
		if !hasTransform {
			continue
		}
		wall := wc.(*components.WallComponent)
		transform := tc.(*components.TransformComponent)
		walls = append(walls, &types.WallState{
			HouseID:  wall.HouseID,
			EntityID: entity.ID,
			Position: &types.Position{X: transform.X, Y: transform.Y},
			Width:    wall.Width,
			Height:   wall.Height,
		})
	}
	return walls
}
