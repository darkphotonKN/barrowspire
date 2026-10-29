package game

import (
	"fmt"
	"log/slog"
	"math"
	"time"

	pbitems "github.com/darkphotonKN/barrowspire-server/common/api/proto/items"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

/**
* SeatVisitor builds a fresh body for the member at the field's arrival point,
* as their character in play wearing the loadout the caller read from
* items-service before taking any lock (FS-X2F2H §Requirements 11, 12), and
* opens their visit with a freshly minted id and the entry time (R13).
*
* Refused in a world that is not a field, for a member who already has a body
* here (a stale enter), and with no loadout: a bare body would clear the stored
* loadout when its visit settles (D27).
**/
func (s *Session) SeatVisitor(memberID uuid.UUID, character types.CharacterInPlay, loadout *pbitems.GetLoadoutWithItemsResponse) (FieldVisit, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.worldType != types.WorldTypeField || s.place == nil {
		return FieldVisit{}, fmt.Errorf("seat visitor %s in %s: %w", memberID, s.ID, ErrNotAField)
	}
	if _, alreadyHere := s.playerIDToEntitiesID[memberID]; alreadyHere {
		return FieldVisit{}, fmt.Errorf("seat visitor %s in %s: %w", memberID, s.ID, ErrAlreadyHere)
	}
	if loadout == nil {
		return FieldVisit{}, fmt.Errorf("seat visitor %s in %s: %w", memberID, s.ID, ErrNoLoadout)
	}

	s.buildBodyLocked(memberID, character, s.place.Arrival.X, s.place.Arrival.Y, loadout)

	visit := FieldVisit{
		ID:          uuid.New(),
		Field:       s.place.ID,
		MemberID:    memberID,
		CharacterID: character.ID,
		Username:    character.Name,
		EnteredAt:   time.Now(),
	}
	s.visits[memberID] = visit

	slog.Info("Visit opened", "field", s.place.ID, "visit_id", visit.ID, "member_id", memberID)

	return visit, nil
}

/**
* EndVisit removes the member's body from the field, with every item entity it
* held, and hands back their visit, closed. It is the one step every way out
* of a field takes (leave, disconnect, leave_hub, enter_hub), so whichever
* comes first ends the visit and every other finds nothing: not ok
* (FS-X2F2H §Requirements 15, 49).
**/
func (s *Session) EndVisit(memberID uuid.UUID) (FieldVisit, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	return s.endVisitLocked(memberID)
}

/**
* LeaveThroughEntrance ends the member's visit if they may walk out: their body
* is here, standing within the entrance gate's range as the tick last measured
* it, and alive. FS-X2F2H §Requirements 14.
**/
func (s *Session) LeaveThroughEntrance(memberID uuid.UUID) (FieldVisit, error) {
	gate, hasEntrance := s.gateTo(components.GateDestinationHub)

	s.mu.Lock()
	defer s.mu.Unlock()

	entityID, here := s.playerIDToEntitiesID[memberID]
	if !here {
		return FieldVisit{}, fmt.Errorf("leave field %s: %w", s.ID, ErrNotInThisWorld)
	}

	body, measured := s.bodiesAt[entityID]
	if !hasEntrance || !measured || math.Hypot(body.X-gate.X, body.Y-gate.Y) > gate.Range {
		return FieldVisit{}, fmt.Errorf("leave field %s: %w", s.ID, ErrNotAtGate)
	}

	if entity, ok := s.EntityManager.GetEntity(entityID); ok && !systems.InPlay(entity) {
		return FieldVisit{}, fmt.Errorf("leave field %s: %w", s.ID, ErrFallen)
	}

	visit, _ := s.endVisitLocked(memberID)
	return visit, nil
}

// endVisitLocked is EndVisit's body. Callers hold the world's lock.
func (s *Session) endVisitLocked(memberID uuid.UUID) (FieldVisit, bool) {
	visit, open := s.visits[memberID]
	entityID, here := s.playerIDToEntitiesID[memberID]
	if !open || !here {
		return FieldVisit{}, false
	}

	if entity, ok := s.EntityManager.GetEntity(entityID); ok {
		if sc, hasStats := entity.GetComponent(ecs.ComponentTypeStats); hasStats {
			stats := sc.(*components.StatsComponent)
			visit.Level = stats.Level
			visit.Experience = int64(stats.Experience)
		}
		for _, itemID := range heldItems(entity) {
			s.EntityManager.RemoveEntity(itemID)
		}
	}

	s.removePlayerLocked(memberID)
	delete(s.visits, memberID)
	visit.LeftAt = time.Now()

	slog.Info("Visit ended", "field", visit.Field, "visit_id", visit.ID, "member_id", memberID)

	return visit, true
}

// heldItems is every item entity a body holds: what it wears and what it
// carries.
func heldItems(body *ecs.Entity) []uuid.UUID {
	var held []uuid.UUID
	if ec, ok := body.GetComponent(ecs.ComponentTypeEquipment); ok {
		held = append(held, systems.WornIDs(ec.(*components.EquipmentComponent))...)
	}
	if lc, ok := body.GetComponent(ecs.ComponentTypeItemIDList); ok {
		held = append(held, lc.(*components.ItemIDListComponent).ItemIDs...)
	}
	return held
}
