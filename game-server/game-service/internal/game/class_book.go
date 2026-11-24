package game

import (
	"log/slog"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/levelgen"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

// The class books, each class's pages in book order (ClassConfig.Book). The
// pages themselves are systems' classBooks table. FS-X2CMM §A R1, §B R9–R12.
var (
	mageBook = []components.PageID{
		components.PageWitchlight, components.PageFarHand, components.PageLevitate,
		components.PageBindingGlyph, components.PageRecall,
	}
	archerBook = []components.PageID{
		components.PageTrackersEye, components.PageBrew, components.PageCallTheHound,
	}
	mercenaryBook = []components.PageID{
		components.PagePickTheLock, components.PageStrikeADeal, components.PageTakeAContract,
	}
	warriorBook = []components.PageID{
		components.PageHeave, components.PageHardened, components.PageLongNight,
	}
)

// castSkill takes a cast_skill on the tick: a page id goes to the class book,
// anything else to the attack rows. Page ids are never attack kinds.
// FS-X2CMM §A R2, §F R35.
func (s *Session) castSkill(playerID uuid.UUID, cast types.PlayerCastSkillPayload) error {
	if page, ok := systems.BookPageOf(cast.SkillID); ok {
		s.castPage(playerID, page, cast)
		return nil
	}
	return s.handleCastSkill(playerID, cast.SkillID, cast.TargetX, cast.TargetY)
}

// castPage judges and resolves a book ability. Escape runs only, as the
// potion is; a refusal of any kind sends nothing back. FS-X2CMM §A R4.
func (s *Session) castPage(playerID uuid.UUID, page systems.BookPage, cast types.PlayerCastSkillPayload) {
	if s.worldType != types.WorldTypeRun {
		slog.Debug("Refusing a book ability outside a run", "session_id", s.ID, "player_id", playerID, "page", page.ID, "world_type", s.worldType)
		return
	}

	s.mu.RLock()
	entityID, here := s.playerIDToEntitiesID[playerID]
	s.mu.RUnlock()
	if !here {
		return
	}
	caster, ok := s.EntityManager.GetEntity(entityID)
	if !ok {
		return
	}

	err := systems.NewBookSystem().Cast(systems.BookCast{
		Caster:   caster,
		Page:     page,
		TargetX:  cast.TargetX,
		TargetY:  cast.TargetY,
		Target:   s.pageTarget(cast.TargetID),
		CellSize: s.bookCellSize(),
	})
	if err != nil {
		slog.Debug("Refusing a book ability", "session_id", s.ID, "player_id", playerID, "page", page.ID, "reason", err)
	}
}

// pageTarget is the entity a cast names, nil when it names none in this world.
func (s *Session) pageTarget(targetID string) *ecs.Entity {
	if targetID == "" {
		return nil
	}
	id, err := uuid.Parse(targetID)
	if err != nil {
		return nil
	}
	target, ok := s.EntityManager.GetEntity(id)
	if !ok {
		return nil
	}
	return target
}

// bookCellSize is the floor's cell edge, the unit of a page's range; a floor
// with no cell grid measures in the dungeon's cell. FS-X2CMM §B R12.
func (s *Session) bookCellSize() float64 {
	if floor, ok := systems.CurrentFloor(s.EntityManager.GetAllEntities()); ok && floor.CellSize > 0 {
		return floor.CellSize
	}
	return levelgen.DungeonFloor1Params.CellSize
}
