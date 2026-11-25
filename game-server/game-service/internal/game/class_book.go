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
// potion is; a refusal sends nothing back, but for an entry point's, whose
// reason is told (refusePage). FS-X2CMM §A R4.
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

	err := systems.NewBookSystem(s.EntityManager).Cast(systems.BookCast{
		Caster:     caster,
		Page:       page,
		TargetX:    cast.TargetX,
		TargetY:    cast.TargetY,
		Target:     s.pageTarget(cast.TargetID),
		CellSize:   s.bookCellSize(),
		BookGround: s.bookGround(),
	})
	if err != nil {
		slog.Debug("Refusing a book ability", "session_id", s.ID, "player_id", playerID, "page", page.ID, "reason", err)
		s.refusePage(playerID, err)
	}
}

// pageTarget is the entity a cast names, nil when it names none in this world:
// an entity id, or a delver's player id (the "id" every player state carries),
// so an ally page names a teammate, or its caster, as the client knows them.
// FS-X2CMM §C R13, R15.
func (s *Session) pageTarget(targetID string) *ecs.Entity {
	if targetID == "" {
		return nil
	}
	id, err := uuid.Parse(targetID)
	if err != nil {
		return nil
	}
	if target, ok := s.EntityManager.GetEntity(id); ok {
		return target
	}
	s.mu.RLock()
	entityID, isDelver := s.playerIDToEntitiesID[id]
	s.mu.RUnlock()
	if !isDelver {
		return nil
	}
	target, ok := s.EntityManager.GetEntity(entityID)
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

// markCasts notes the health each casting delver takes into the tick's
// combat, so a hit that costs any breaks the cast after it. Runs only: no
// page is cast anywhere else. FS-X2CMM §D R18.
func (s *Session) markCasts(entities []*ecs.Entity) {
	if s.worldType != types.WorldTypeRun {
		return
	}
	systems.NewBookSystem(s.EntityManager).MarkHealth(entities)
}

// advanceCasts counts the run's casts in progress on the tick, after its
// movement and combat: each breaks, completes with its effect, or counts the
// tick. attackers is the bodies whose attack or cast went off in the tick's
// combat. Nothing is sent: the next state shows the cast gone, or its effect.
// FS-X2CMM §D R16–R18.
func (s *Session) advanceCasts(deltaTime float64, entities []*ecs.Entity, attackers []uuid.UUID) {
	if s.worldType != types.WorldTypeRun {
		return
	}
	systems.NewBookSystem(s.EntityManager).AdvanceCasts(deltaTime, entities, attackers, s.bookGround())
}

// bookGround is the run's floor as a page reads it: its ground, the walk's own
// ground a move over it lands on (as a blink's does), and the combat's end to
// a charge in flight; on a dungeon floor its cells, where a delver whose
// afloat ends over a pit is set down and over which Heave shoves a stone
// block. FS-X2CMM §C R14, §E R25, §J R51, R52.
func (s *Session) bookGround() systems.BookGround {
	ground := systems.BookGround{
		Walkable:  s.pageGround,
		Ground:    s.movementSystem,
		EndCharge: s.combatSystem.EndCharge,
		Contracts: s,
		FarReach:  s,
	}
	// a nil grid is no footing, never a footing holding a nil grid
	if s.navGrid != nil {
		ground.Footing = s.navGrid
		ground.Cells = s.navGrid
	}
	return ground
}

// pageGround is whether a ground page's point is ground a body could stand
// on: a walkable cell of a dungeon floor, inside the bounds of a floor of
// buildings, and in neither case inside a wall. FS-X2CMM §C R14.
func (s *Session) pageGround(x, y float64) bool {
	s.mu.RLock()
	dungeon, width, height := s.dungeon, s.mapWidth, s.mapHeight
	s.mu.RUnlock()

	if dungeon != nil {
		if dungeon.regionAt(x, y) == 0 {
			return false
		}
	} else if x < 0 || y < 0 || x >= width || y >= height {
		return false
	}
	return !systems.PointInWall(s.EntityManager.GetAllEntities(), x, y)
}
