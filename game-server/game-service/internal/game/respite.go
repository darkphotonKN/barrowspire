package game

import (
	"log/slog"
	"math"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/google/uuid"
)

/**
* Respites (FS-5FZ4J §G). A floor may keep a respite room: a room the build
* holds for a respite standing in it, the healing fountain's here and the
* wandering merchant's (FS-9JV5K), where nothing hunts the party. A respite
* room is drawn by one rule (respiteRoomOpen) and kept quiet by one set
* (respiteRooms): no monster, container or blood demon is placed in it
* (quietRooms), no ambush spawns in it (ambushRooms), and no tome-run object
* or hallowed altar stands in it.
*
* The hallowed altar is a respite too, but not a respite room's: it stands
* where the tome's altar would, or in a hidden room.
**/

// respiteKind is what holds a respite room.
type respiteKind string

const (
	// respiteFountain is the healing fountain's room (§G R40)
	respiteFountain respiteKind = "fountain"
	// respiteMerchant is the wandering merchant's room (FS-9JV5K §A R1)
	respiteMerchant respiteKind = "merchant"
)

// respite is one respite room of a floor: what holds it, the room and where
// in it its fixture stands.
type respite struct {
	kind respiteKind
	room int
	at   point
}

// isRespite is whether room is a respite room.
func (d *dungeonFloor) isRespite(room int) bool {
	for _, r := range d.respites {
		if r.room == room {
			return true
		}
	}
	return false
}

// respiteAt is the floor's respite of kind, false when it holds none.
func (d *dungeonFloor) respiteAt(kind respiteKind) (respite, bool) {
	for _, r := range d.respites {
		if r.kind == kind {
			return r, true
		}
	}
	return respite{}, false
}

// sealPieceRooms is every room a piece of the floor's seals stands in, every
// stage's, planned or laid.
func (d *dungeonFloor) sealPieceRooms() map[int]bool {
	rooms := map[int]bool{}
	for _, plan := range d.seals {
		for _, piece := range plan.pieces {
			if room := d.roomAt(piece.at.x, piece.at.y); room >= 0 {
				rooms[room] = true
			}
		}
	}
	return rooms
}

/**
* respiteRoomOpen is whether room may be a respite room: not the start, the
* stairs, a treasure room (its guards are where monsters spawn), a seal
* piece's, a hidden room or another respite's (FS-5FZ4J §G R40, §D R21). A
* respite whose own rule bars more rooms (the merchant's, FS-9JV5K R1) filters
* them on top.
**/
func (d *dungeonFloor) respiteRoomOpen(room int, pieces map[int]bool) bool {
	roles := d.layout.Roles
	if room == roles.Start || room == roles.Stairs || pieces[room] || d.isHidden(room) || d.isRespite(room) {
		return false
	}
	for _, treasure := range roles.Treasure {
		if room == treasure {
			return false
		}
	}
	return true
}

/**
* planRespite holds a respite room for kind, its fixture of half-size (rw, rh)
* at a spot found as a fixture's is (placeFixture), in a room drawn from the
* open ones that also allows, when given: a room with no free spot is passed
* over for the next drawn. Run
* while the floor is planned, before it is published, after its seals. False,
* loudly, when no room has a spot: the floor then holds no such respite.
**/
func (s *Session) planRespite(d *dungeonFloor, kind respiteKind, rw, rh float64, also func(room int) bool) bool {
	pieces := d.sealPieceRooms()
	var rooms []int
	for room := range d.layout.Rooms {
		if d.respiteRoomOpen(room, pieces) && (also == nil || also(room)) {
			rooms = append(rooms, room)
		}
	}
	shuffle(s.spawnRand, rooms)
	for _, room := range rooms {
		if at, ok := s.placeFixture(d, room, rw, rh); ok {
			d.respites = append(d.respites, respite{kind: kind, room: room, at: at})
			return true
		}
	}
	slog.Warn("Respite skipped: no open room has a free spot", "sessionID", s.ID, "respite", kind)
	return false
}

// fountainFor is whether the floor at depth holds a fountain: drawn at
// FountainFloorChance on floors 2+ below the top; floor 1 and the top floor
// draw nothing. FS-5FZ4J §G R40.
func fountainFor(rng populationRand, depth int, top bool) bool {
	if depth <= firstFloor || top {
		return false
	}
	return rng.Float64() < FountainFloorChance
}

/**
* layFountain stands the floor's fountain where it was planned, its pool
* FountainPoolPercent of the highest max health among the delvers in play at
* the build, fixed from then on (FS-5FZ4J §G R41, Edge States). A floor with no
* fountain planned lays none.
**/
func (s *Session) layFountain(d *dungeonFloor) {
	r, ok := d.respiteAt(respiteFountain)
	if !ok {
		return
	}
	most := 0
	for _, delver := range delversOf(s.EntityManager.GetAllEntities()) {
		if hc, has := delver.GetComponent(ecs.ComponentTypeHealth); has && systems.InPlay(delver) {
			most = max(most, hc.(*components.HealthComponent).MaxHealth)
		}
	}
	CreateFountainEntity(s.EntityManager, r.at.x, r.at.y, int(math.Round(float64(most)*FountainPoolPercent/100)))
}

// CreateFountainEntity stands a healing fountain holding pool at (x, y). It is
// not interactable: it heals whoever stands beside it (FS-5FZ4J §G R41).
func CreateFountainEntity(em *ecs.EntityManager, x, y float64, pool int) *ecs.Entity {
	entity := em.CreateEntity()
	entity.AddComponent(components.NewFountainComponent(pool))
	entity.AddComponent(components.NewTransformComponent(x, y))
	return entity
}

/**
* The hallowed altar (FS-5FZ4J §G R42-R43): rolled once at run creation, as the
* tome plan is, kept on the run-level entity; placed on its floor in a hidden
* room or where the tome's altar would stand; a 2 s prayer blesses the party.
**/

// rollHallowedAltarPlan draws whether a run of height floors holds a hallowed
// altar, at chance, and if so its floor, uniform in [2, height - 1], and
// whether it stands hidden, at HallowedAltarHiddenShare. A run too short for
// a floor between its first and its top has none. FS-5FZ4J §G R42.
func rollHallowedAltarPlan(rng populationRand, height int, chance float64) (floor int, hidden, ok bool) {
	if rng.Float64() >= chance || height < 3 {
		return 0, false, false
	}
	floor = firstFloor + 1 + rng.IntN(height-2)
	hidden = rng.Float64() < HallowedAltarHiddenShare
	return floor, hidden, true
}

// setHallowedAltarPlan puts this run's hallowed altar on floor, hidden or not,
// on the run-level entity. Without a run-level entity there is nothing to hold
// it.
func (s *Session) setHallowedAltarPlan(floor int, hidden bool) {
	if runLevel, ok := runLevelEntity(s.EntityManager.GetAllEntities()); ok {
		runLevel.AddComponent(&components.HallowedAltarPlanComponent{Floor: floor, Hidden: hidden})
	}
}

// hallowedAltarPlan is the run's hallowed altar plan; false when it has none.
func (s *Session) hallowedAltarPlan() (*components.HallowedAltarPlanComponent, bool) {
	runLevel, ok := runLevelEntity(s.EntityManager.GetAllEntities())
	if !ok {
		return nil, false
	}
	pc, ok := runLevel.GetComponent(ecs.ComponentTypeHallowedAltarPlan)
	if !ok {
		return nil, false
	}
	return pc.(*components.HallowedAltarPlanComponent), true
}

// hiddenAltarUses is the hidden room the floor at depth asks its layout for
// on top of its own: the hallowed altar's, when it stands hidden there.
func (s *Session) hiddenAltarUses(depth int) []hiddenUse {
	if plan, ok := s.hallowedAltarPlan(); ok && plan.Hidden && plan.Floor == depth {
		return []hiddenUse{hiddenHallowedAltar}
	}
	return nil
}

/**
* layHallowedAltar stands the hallowed altar on its floor when it is not
* hidden (a hidden one is laid with its hidden room): in a random room that
* is not the start, the stairs, a hidden room or a respite room, at a spot
* found as the tome's altar's is (FS-3103M R8-R9). FS-5FZ4J §G R42.
**/
func (s *Session) layHallowedAltar(depth int, d *dungeonFloor) {
	plan, ok := s.hallowedAltarPlan()
	if !ok || plan.Hidden || plan.Floor != depth {
		return
	}
	s.placeRunObject(d, "hallowed altar", func(room int) bool { return room != d.layout.Roles.Stairs }, CreateHallowedAltarEntity)
}

// warnHallowedAltarFallback logs that the hallowed altar's floor, fallen back
// to a floor of buildings, holds no altar: the run has none (FS-5FZ4J Edge
// States, as FS-3103M R10).
func (s *Session) warnHallowedAltarFallback(depth int) {
	if plan, ok := s.hallowedAltarPlan(); ok && plan.Floor == depth {
		slog.Warn("Hallowed altar floor fell back to a floor of buildings: no altar this run",
			"sessionID", s.ID, "floor", depth)
	}
}

// CreateHallowedAltarEntity stands the hallowed altar at (x, y), prayed at by
// interact. FS-5FZ4J §G R42.
func CreateHallowedAltarEntity(em *ecs.EntityManager, x, y float64) *ecs.Entity {
	entity := em.CreateEntity()
	entity.AddComponent(&components.HallowedAltarComponent{})
	entity.AddComponent(components.NewTransformComponent(x, y))
	entity.AddComponent(components.NewInteractableComponent(constants.DefaultInteractableRange))
	return entity
}

// RefusalAltarPrayed is an interact on a hallowed altar already prayed at.
// FS-5FZ4J §G R43, §I R49.
const RefusalAltarPrayed = "altar_prayed"

/**
* reachHallowedAltar answers a delver's interact on the hallowed altar, in
* reach: a spent altar is refused quietly with altar_prayed; else the delver's
* prayer starts, a PrayDuration timed interact on the FS-MQYEX rules.
* FS-5FZ4J §G R43.
**/
func (s *Session) reachHallowedAltar(playerID uuid.UUID, delver *ecs.Entity, body *components.TransformComponent, altar *ecs.Entity) error {
	if err := s.inReachOf(playerID, body, altar); err != nil {
		return err
	}
	if hallowedAltarPrayed(altar) {
		s.sendRefusalToPlayer(playerID, string(constants.ActionInteract), "the altar has been prayed at", RefusalAltarPrayed, nil)
		return nil
	}
	systems.NewTimedOpenSystem(s.EntityManager).Start(delver, altar.ID, components.TimedTargetPray, PrayDuration)
	return nil
}

// hallowedAltarPrayed is whether altar is spent.
func hallowedAltarPrayed(altar *ecs.Entity) bool {
	hc, ok := altar.GetComponent(ecs.ComponentTypeHallowedAltar)
	return ok && hc.(*components.HallowedAltarComponent).Prayed
}

/**
* completePrayer is a prayer's end, on the tick its timed interact completes:
* every party member in play on the floor that tick is blessed, and the altar
* is spent for the run. FS-5FZ4J §G R43-R44.
**/
func (s *Session) completePrayer(altar *ecs.Entity) {
	hc, ok := altar.GetComponent(ecs.ComponentTypeHallowedAltar)
	if !ok || hc.(*components.HallowedAltarComponent).Prayed {
		return
	}
	hc.(*components.HallowedAltarComponent).Prayed = true
	blessed := 0
	for _, delver := range delversOf(s.EntityManager.GetAllEntities()) {
		if systems.InPlay(delver) {
			systems.Bless(delver)
			blessed++
		}
	}
	slog.Info("Hallowed altar prayed at", "sessionID", s.ID, "blessed", blessed)
}
