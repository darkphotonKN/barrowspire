package game

import (
	"fmt"
	"log/slog"
	"math"

	commonconstants "github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

/**
* The Tome of Filth and the Altar of Consecration (FS-3103M). In a tome run a
* small tome lies hidden on a lower floor and an altar stands on a floor above
* it, never the top. The plan of where they stand is rolled once with the run's
* height and kept on the run-level entity; each floor build places whichever
* of the two its floor holds.
**/

// rollTomePlan draws whether a run of height floors has a tome, at chance, and
// if so where the pair stands: the tome's floor uniform in [1, height - 2],
// the altar's uniform in [tome + 1, height - 1]. A run too short for both
// below its top has none. FS-3103M §B R5-R6.
func rollTomePlan(rng populationRand, height int, chance float64) (tomeFloor, altarFloor int, ok bool) {
	if rng.Float64() >= chance || height < 3 {
		return 0, 0, false
	}
	tomeFloor = firstFloor + rng.IntN(height-2)
	altarFloor = tomeFloor + 1 + rng.IntN(height-1-tomeFloor)
	return tomeFloor, altarFloor, true
}

// setTomePlan makes this run a tome run, its tome on tomeFloor and its altar
// on altarFloor, on the run-level entity beside the floor (FS-3103M §B R7).
// The roll's result goes here; the endgame test run (FS-BDRTJ) sets fixed
// floors in its place. Without a run-level entity there is nothing to hold it.
func (s *Session) setTomePlan(tomeFloor, altarFloor int) {
	if runLevel, ok := runLevelEntity(s.EntityManager.GetAllEntities()); ok {
		runLevel.AddComponent(components.NewTomePlanComponent(tomeFloor, altarFloor))
	}
}

// tomePlan is the run's tome plan; false when this is not a tome run.
func (s *Session) tomePlan() (*components.TomePlanComponent, bool) {
	runLevel, ok := runLevelEntity(s.EntityManager.GetAllEntities())
	if !ok {
		return nil, false
	}
	pc, ok := runLevel.GetComponent(ecs.ComponentTypeTomePlan)
	if !ok {
		return nil, false
	}
	return pc.(*components.TomePlanComponent), true
}

// runLevelEntity is the entity that outlives every floor change, the one
// holding the floor; false in a world without floors.
func runLevelEntity(entities []*ecs.Entity) (*ecs.Entity, bool) {
	for _, entity := range entities {
		if entity.HasComponent(ecs.ComponentTypeFloor) {
			return entity, true
		}
	}
	return nil, false
}

/**
* layTomeAndAltar places whatever of the tome and the altar the floor at depth
* holds, after its containers so neither displaces one: each in a random room
* that is not the start room, at a spot found as a container's is, a room with
* no free spot passed over for the next one drawn. The altar stands whether or
* not the tome was taken. A floor with no free spot in any room skips it with a
* warning. FS-3103M §C R8-R10.
**/
func (s *Session) layTomeAndAltar(depth int, d *dungeonFloor) {
	plan, ok := s.tomePlan()
	if !ok {
		return
	}
	if depth == plan.TomeFloor {
		s.placeTomeRunObject(d, "tome", CreateTomeEntity)
	}
	if depth == plan.AltarFloor {
		s.placeTomeRunObject(d, "altar", CreateAltarEntity)
	}
}

// placeTomeRunObject stands one tome-run object, made by create, in the first
// room drawn from those that are not the start room with a free spot for it.
func (s *Session) placeTomeRunObject(d *dungeonFloor, what string, create func(*ecs.EntityManager, float64, float64) *ecs.Entity) {
	rw := commonconstants.ContainerWidthRadius + containerPadding
	rh := commonconstants.ContainerHeightRadius + containerPadding

	rooms := make([]int, 0, len(d.layout.Rooms))
	for room := range d.layout.Rooms {
		if room != d.layout.Roles.Start {
			rooms = append(rooms, room)
		}
	}
	shuffle(s.spawnRand, rooms)

	for _, room := range rooms {
		x, y, ok := d.spot(s.spawnRand, d.roomRegion(room), rw, rh, footing{doorways: offDoorways, free: s.isFree})
		if !ok {
			continue
		}
		create(s.EntityManager, x, y)
		s.objectOccupiedPlaceAreas = append(s.objectOccupiedPlaceAreas, centredArea(x, y, rw, rh))
		return
	}
	slog.Warn("Tome run object skipped: no room on its floor has a free spot", "sessionID", s.ID, "object", what)
}

// warnTomeRunFallback logs that the floor at depth, fallen back to a floor of
// buildings, holds neither the tome nor the altar it was planned to.
// FS-3103M §C R10.
func (s *Session) warnTomeRunFallback(depth int) {
	plan, ok := s.tomePlan()
	if !ok || (depth != plan.TomeFloor && depth != plan.AltarFloor) {
		return
	}
	slog.Warn("Tome run floor fell back to a floor of buildings: neither tome nor altar is placed",
		"sessionID", s.ID, "floor", depth)
}

// CreateTomeEntity lays the Tome of Filth at (x, y), taken by interact.
func CreateTomeEntity(em *ecs.EntityManager, x, y float64) *ecs.Entity {
	entity := em.CreateEntity()
	entity.AddComponent(components.NewTomeComponent())
	entity.AddComponent(components.NewTransformComponent(x, y))
	entity.AddComponent(components.NewInteractableComponent(commonconstants.DefaultInteractableRange))
	return entity
}

// CreateAltarEntity stands the Altar of Consecration at (x, y), reached by
// interact.
func CreateAltarEntity(em *ecs.EntityManager, x, y float64) *ecs.Entity {
	entity := em.CreateEntity()
	entity.AddComponent(components.NewAltarComponent())
	entity.AddComponent(components.NewTransformComponent(x, y))
	entity.AddComponent(components.NewInteractableComponent(commonconstants.DefaultInteractableRange))
	return entity
}

// The interact replies' reasons on the tome and the altar, from which the
// client writes its own lines. FS-3103M §D R13, §F R16.
const (
	// ReasonTomeTaken is the taker's reply on taking the tome
	ReasonTomeTaken = "tome_taken"
	// RefusalAltarWithoutTome is a reach for the altar without the tome
	RefusalAltarWithoutTome = "altar_without_tome"
	// RefusalAltarBurned is a reach for an altar the tome was burned at
	RefusalAltarBurned = "altar_burned"
)

/**
* takeTome takes the tome a delver reached for, on the tick: in interact range,
* the tome entity is removed and the run's plan records that the party carries
* it. It is run-level state, no bag slot, never extracted; the taker leaving or
* dying changes nothing. Only the taker is told. A second reach in the same
* tick finds no entity and is refused before it gets here.
* FS-3103M §D R12-R13.
**/
func (s *Session) takeTome(playerID uuid.UUID, body *components.TransformComponent, tome *ecs.Entity) error {
	if err := s.inReachOf(playerID, body, tome); err != nil {
		return err
	}
	plan, ok := s.tomePlan()
	if !ok {
		return fmt.Errorf("take tome %s in a run with no tome plan", tome.ID)
	}

	s.EntityManager.RemoveEntity(tome.ID)
	plan.Carried = true
	slog.Info("Tome taken", "sessionID", s.ID, "playerID", playerID)

	if err := s.sender.SendMessageToPlayer(playerID, types.Message{
		Action:  string(commonconstants.ActionInteract),
		Payload: map[string]interface{}{"success": true, "reason": ReasonTomeTaken},
	}); err != nil {
		slog.Debug("Could not tell the taker the tome is taken", "player_id", playerID, "error", err)
	}
	return nil
}

/**
* reachAltar answers a delver's reach for the altar, on the tick. A burned
* altar refuses quietly with altar_burned; without the tome it is refused with
* altar_without_tome and nothing changes. A refusal is play, so the reach
* returns no error and the altar's hold is let go at once, as every refused
* reach's is. With the tome carried, any delver in range burns it and Vorsk is
* summoned in the same tick; the broadcast's burned says so, not a reply.
* FS-3103M §F R16-R19.
**/
func (s *Session) reachAltar(playerID uuid.UUID, body *components.TransformComponent, altar *ecs.Entity) error {
	if err := s.inReachOf(playerID, body, altar); err != nil {
		return err
	}
	plan, ok := s.tomePlan()
	switch {
	case ok && plan.Burned:
		s.sendRefusalToPlayer(playerID, string(commonconstants.ActionInteract),
			"the altar is burned", RefusalAltarBurned, nil)
	case !ok || !plan.Carried:
		s.sendRefusalToPlayer(playerID, string(commonconstants.ActionInteract),
			"a tome was burned here once", RefusalAltarWithoutTome, nil)
	default:
		plan.Carried, plan.Burned = false, true
		slog.Info("Tome burned at the altar", "sessionID", s.ID, "playerID", playerID)
		s.summonVorsk(altar)
	}
	return nil
}

/**
* summonVorsk stands Vorsk, the demon archetype as a boss and never an elite,
* at its summoned level, beside the altar: the free spot in the altar's room
* nearest it, off doorways and clear of walls, fixtures and every delver's
* body, among a bounded sample. With none it is placed as a guaranteed boss
* is, the delver exclusion relaxed last, and logged loudly if even that fails.
* It comes on top of the floor's count and beside any blood demon.
* FS-3103M §F R18, R20.
**/
func (s *Session) summonVorsk(altar *ecs.Entity) {
	entities := s.EntityManager.GetAllEntities()
	floor, ok := systems.CurrentFloor(entities)
	if !ok {
		slog.Error("Vorsk not summoned: the run has no floor", "sessionID", s.ID)
		return
	}
	vorsk := MonsterConfig{
		Archetype: components.MonsterArchetypeDemon,
		Level:     s.vorskLevel(floor.Depth),
		Boss:      true,
	}

	area := s.summonArea(entities)
	if s.dungeon == nil {
		s.placeDemon(&area, vorsk, floor.Depth, true)
		return
	}
	if x, y, ok := s.besideAltar(s.dungeon, &area, altar); ok {
		vorsk.X, vorsk.Y = x, y
		CreateMonsterEntity(s.EntityManager, vorsk)
		return
	}
	slog.Warn("Vorsk placed away from the altar: its room has no free spot", "sessionID", s.ID, "floor", floor.Depth)
	if _, ok := s.placeDungeonDemon(s.dungeon, &area, vorsk, floor.Depth, demonGuaranteed); !ok {
		slog.Error("Vorsk not summoned: no valid spawn point on the floor even relaxed",
			"sessionID", s.ID, "floor", floor.Depth)
	}
}

// vorskLevel is the level Vorsk is summoned at on floor: the demon's level
// rule, at the party's level as population takes it (FS-3103M §F R18). The one
// place it is read, so a test run can set its own.
func (s *Session) vorskLevel(floor int) int {
	return demonLevel(partyLevel(delversOf(s.EntityManager.GetAllEntities())), floor)
}

// summonArea is the floor as a summoned boss sees it mid-run: what it may not
// stand on, the altar included, every delver in play and every monster
// standing where it is now.
func (s *Session) summonArea(entities []*ecs.Entity) spawnArea {
	area := spawnArea{
		width:   s.mapWidth,
		height:  s.mapHeight,
		keepOut: mapKeepOut(entities),
		delvers: inPlayPositions(delversOf(entities)),
	}
	for _, entity := range entities {
		tc, ok := entity.GetComponent(ecs.ComponentTypeTransform)
		if !ok {
			continue
		}
		at := tc.(*components.TransformComponent)
		switch {
		case entity.HasComponent(ecs.ComponentTypeAltar):
			area.keepOut = append(area.keepOut, centredArea(at.X, at.Y, commonconstants.ContainerWidthRadius, commonconstants.ContainerHeightRadius))
		case entity.HasComponent(ecs.ComponentTypeEnemy):
			area.placed = append(area.placed, point{at.X, at.Y})
		}
	}
	return area
}

// besideAltar is the spot in the altar's room nearest the altar where a body
// stands off the doorways, on open ground and clear of every delver's body,
// among DemonPlacementSamples draws; false when none of them fits.
func (s *Session) besideAltar(d *dungeonFloor, area *spawnArea, altar *ecs.Entity) (x, y float64, ok bool) {
	tc, has := altar.GetComponent(ecs.ComponentTypeTransform)
	if !has {
		return 0, 0, false
	}
	at := tc.(*components.TransformComponent)
	region := d.regionAt(at.X, at.Y)
	if region == 0 {
		return 0, 0, false
	}

	r := commonconstants.PlayerRadius
	best := math.Inf(1)
	for range DemonPlacementSamples {
		cx, cy := d.draw(s.spawnRand, region)
		if !d.stands(centredArea(cx, cy, r, r), region, offDoorways) || !area.open(cx, cy) || onADelver(area, cx, cy) {
			continue
		}
		if dist := math.Hypot(cx-at.X, cy-at.Y); dist < best {
			best, x, y, ok = dist, cx, cy, true
		}
	}
	return x, y, ok
}

// onADelver is whether a body at (x, y) overlaps any delver's, both taken as
// the square MovementSystem collides.
func onADelver(area *spawnArea, x, y float64) bool {
	reach := 2 * commonconstants.PlayerRadius
	for _, d := range area.delvers {
		if math.Abs(x-d.x) < reach && math.Abs(y-d.y) < reach {
			return true
		}
	}
	return false
}

// inReachOf refuses a reach for target from beyond interact range, as every
// interactable's is.
func (s *Session) inReachOf(playerID uuid.UUID, body *components.TransformComponent, target *ecs.Entity) error {
	tc, ok := target.GetComponent(ecs.ComponentTypeTransform)
	if !ok {
		return fmt.Errorf("interact target %s has no position", target.ID)
	}
	at := tc.(*components.TransformComponent)
	if !s.calcWithinDistance(body.X, body.Y, at.X, at.Y) {
		s.sendErrorToPlayer(playerID, string(commonconstants.ActionInteract), "too far away to interact")
		return ErrOutOfRange
	}
	return nil
}
