package game

import (
	"errors"
	"fmt"
	"log/slog"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/google/uuid"
)

/**
* The Captives (FS-4EC7Z §D R13). Two captives stand caged in the encounter
* room, inside a locked cage. Its key lies elsewhere on the floor: half the
* time in another room, half the time on one elite among the floor's
* monsters, dropped as a key fixture where that elite dies. An interact on the
* key takes it, party state on the floor as the stair key's is
* (hidden_key.go); an interact on the cage while the party carries it, or the
* open-cage entry point (FS-X2CMM's Pick the Lock), opens the cage, and the
* captives become allies of the delver who opened it (ally.go).
**/

// ErrCageOpen refuses opening a cage already open.
var ErrCageOpen = errors.New("the cage is already open")

// cageKeyPlan is where the floor's cage key goes, planned with its layout: a
// spot in another room, and whether it rides on an elite instead. The spot is
// held either way, the elite's fallback when the floor rolls none.
type cageKeyPlan struct {
	at      point
	onElite bool
}

/**
* planCageKey holds the cage key's spot in a room other than the encounter
* room, the start, the stairs, a hidden room and a respite's, drawn, and
* draws whether an elite carries it instead (CageKeyOnEliteShare). False when
* no such room has a free spot. FS-4EC7Z §D R13.
**/
func (s *Session) planCageKey(d *dungeonFloor, encounterRoom int) (cageKeyPlan, bool) {
	roles := d.layout.Roles
	var rooms []int
	for room := range d.layout.Rooms {
		if room == encounterRoom || room == roles.Start || room == roles.Stairs || d.isHidden(room) || d.isRespite(room) {
			continue
		}
		rooms = append(rooms, room)
	}
	shuffle(s.spawnRand, rooms)
	for _, room := range rooms {
		if at, ok := s.placeFixture(d, room, constants.ContainerWidthRadius, constants.ContainerHeightRadius); ok {
			return cageKeyPlan{at: at, onElite: s.spawnRand.Float64() < CageKeyOnEliteShare}, true
		}
	}
	return cageKeyPlan{}, false
}

/**
* layCaptives stands the Captives where they were planned: the cage on its
* spot, the captives caged inside it side by side, each still (no Velocity:
* a caged body neither moves nor is pushed) with an ally's health for its
* kind, and the key on its spot unless an elite will carry it
* (handCageKey). FS-4EC7Z §D R13.
**/
func (s *Session) layCaptives(encounter *ecs.Entity, ec *components.EncounterComponent, plan *encounterPlan) {
	at := plan.spots[0]
	cage := s.EntityManager.CreateEntity()
	cage.AddComponent(&components.CageComponent{Encounter: encounter.ID})
	cage.AddComponent(components.NewTransformComponent(at.x, at.y))
	captives := &components.CaptivesComponent{Cage: cage.ID}
	encounter.AddComponent(captives)

	health := allyHealth(components.EncounterNPCCaptive, s.floorMonsterLevel())
	offset := CageHalfSize - constants.PlayerRadius
	for i := range CaptiveCount {
		x := at.x - offset + 2*offset*float64(i)/float64(max(CaptiveCount-1, 1))
		npc := CreateEncounterNPCEntity(s.EntityManager, EncounterNPCConfig{
			Kind:      components.EncounterNPCCaptive,
			Look:      CaptiveLooks[i%len(CaptiveLooks)],
			Stance:    components.StanceCaged,
			X:         x,
			Y:         at.y,
			Health:    health,
			Encounter: encounter.ID,
		})
		npc.RemoveComponent(ecs.ComponentTypeVelocity)
		ec.NPCs = append(ec.NPCs, npc.ID)
	}
	if !plan.key.onElite {
		captives.Key = s.layCageKey(encounter.ID, plan.key.at).ID
	}
}

// layCageKey lays the cage key as a fixture at at.
func (s *Session) layCageKey(encounter uuid.UUID, at point) *ecs.Entity {
	key := s.EntityManager.CreateEntity()
	key.AddComponent(&components.CageKeyComponent{Encounter: encounter})
	key.AddComponent(components.NewTransformComponent(at.x, at.y))
	return key
}

/**
* handCageKey gives the cage key to one live elite among the floor's monsters,
* drawn, once they stand, when the plan put it on one; a floor that rolled no
* elite lays the key on its planned spot instead. Run after the floor's
* monsters are populated. FS-4EC7Z §D R13.
**/
func (s *Session) handCageKey() {
	d := s.dungeon
	if d == nil || d.encounter == nil || d.encounter.kind != components.EncounterCaptives || !d.encounter.key.onElite {
		return
	}
	encounter, ec, ok := s.floorEncounter()
	if !ok {
		return
	}
	cc, ok := encounter.GetComponent(ecs.ComponentTypeCaptives)
	if !ok {
		return
	}
	captives := cc.(*components.CaptivesComponent)
	var elites []uuid.UUID
	for _, e := range s.EntityManager.GetAllEntities() {
		mc, isMonster := e.GetComponent(ecs.ComponentTypeEnemy)
		if !isMonster || !alive(e) {
			continue
		}
		if monster := mc.(*components.MonsterComponent); monster.Elite && !monster.Boss {
			elites = append(elites, e.ID)
		}
	}
	if len(elites) == 0 {
		slog.Warn("Cage key laid in a room: the floor rolled no elite to carry it", "sessionID", s.ID, "room", ec.Room)
		captives.Key = s.layCageKey(encounter.ID, d.encounter.key.at).ID
		return
	}
	captives.Carrier = elites[s.spawnRand.IntN(len(elites))]
}

// floorEncounter is the floor's encounter entity and component; false with
// none.
func (s *Session) floorEncounter() (*ecs.Entity, *components.EncounterComponent, bool) {
	for _, e := range s.EntityManager.GetAllEntities() {
		if ec, ok := e.GetComponent(ecs.ComponentTypeEncounter); ok {
			return e, ec.(*components.EncounterComponent), true
		}
	}
	return nil, nil, false
}

/**
* advanceCaptives runs the Captives a tick: the elite carrying the key, dead
* (or gone), drops it as a key fixture where it fell, or on its planned spot
* when its body is gone. Run after the combat, while a corpse still lies.
* FS-4EC7Z §D R13.
**/
func (s *Session) advanceCaptives(encounter *ecs.Entity, captives *components.CaptivesComponent) {
	if captives.Carrier == uuid.Nil {
		return
	}
	carrier, ok := s.EntityManager.GetEntity(captives.Carrier)
	if ok && alive(carrier) {
		return
	}
	captives.Carrier = uuid.Nil
	if ok {
		if tc, placed := carrier.GetComponent(ecs.ComponentTypeTransform); placed {
			at := tc.(*components.TransformComponent)
			captives.Key = s.layCageKey(encounter.ID, point{at.X, at.Y}).ID
			slog.Debug("Cage key dropped by its elite", "sessionID", s.ID)
			return
		}
	}
	if d := s.dungeon; d != nil && d.encounter != nil {
		slog.Warn("Cage key's elite gone without a body: the key lies on its planned spot", "sessionID", s.ID)
		captives.Key = s.layCageKey(encounter.ID, d.encounter.key.at).ID
	}
}

// captivesOfEncounter is the Captives state of the encounter named, and its
// entity; false when it is no Captives encounter.
func (s *Session) captivesOfEncounter(id uuid.UUID) (*ecs.Entity, *components.CaptivesComponent, bool) {
	encounter, ok := s.EntityManager.GetEntity(id)
	if !ok {
		return nil, nil, false
	}
	cc, ok := encounter.GetComponent(ecs.ComponentTypeCaptives)
	if !ok {
		return nil, nil, false
	}
	return encounter, cc.(*components.CaptivesComponent), true
}

// takeCageKey answers an interact on the cage key in reach: it leaves the
// floor and the party carries it. The state says so (cage_key_carried), not a
// reply. FS-4EC7Z §D R13, §F R23.
func (s *Session) takeCageKey(playerID uuid.UUID, body *components.TransformComponent, key *ecs.Entity) error {
	if err := s.inReachOf(playerID, body, key); err != nil {
		return err
	}
	kc, _ := key.GetComponent(ecs.ComponentTypeCageKey)
	_, captives, ok := s.captivesOfEncounter(kc.(*components.CageKeyComponent).Encounter)
	if !ok {
		return fmt.Errorf("cage key %s names no Captives encounter", key.ID)
	}
	s.EntityManager.RemoveEntity(key.ID)
	captives.Key, captives.KeyCarried = uuid.Nil, true
	slog.Info("Cage key taken", "sessionID", s.ID, "player_id", playerID)
	return nil
}

/**
* reachCage answers an interact on the cage in reach: an open cage is passed
* over quietly; a locked one opens while the party carries the key, freeing
* the captives as the interacting delver's allies, and is refused cage_locked
* without it, or too_many_allies past the party's cap. FS-4EC7Z §D R13, §F
* R27.
**/
func (s *Session) reachCage(playerID uuid.UUID, body *components.TransformComponent, cage *ecs.Entity) error {
	if err := s.inReachOf(playerID, body, cage); err != nil {
		return err
	}
	cc, _ := cage.GetComponent(ecs.ComponentTypeCage)
	if cc.(*components.CageComponent).Open {
		return nil
	}
	_, captives, ok := s.captivesOfEncounter(cc.(*components.CageComponent).Encounter)
	if !ok || !captives.KeyCarried {
		s.sendRefusalToPlayer(playerID, string(constants.ActionInteract),
			"the cage is locked", RefusalCageLocked, nil)
		return nil
	}
	err := s.OpenCage(cage.ID, playerID)
	if errors.Is(err, ErrTooManyAllies) {
		s.sendRefusalToPlayer(playerID, string(constants.ActionInteract),
			"too many follow you already", RefusalTooManyAllies, nil)
		return nil
	}
	return err
}

/**
* OpenCage is the open-cage entry point (FS-4EC7Z §D R13), the server side of
* FS-X2CMM's Pick the Lock: it opens the cage cageID without its key and frees
* its living captives as allies of opener, a member id, each saying its freed
* line; a key the party carries is spent with it. Refused, the cage left
* shut: ErrEntityNotFound for no cage, ErrCageOpen for one already open,
* ErrTooManyAllies past the party's cap (§C R10). It checks neither reach nor
* the key: the interact and the page that call it do. Call it on the tick,
* as every world change is made (a queued intent).
**/
func (s *Session) OpenCage(cageID, opener uuid.UUID) error {
	cage, ok := s.EntityManager.GetEntity(cageID)
	if !ok {
		return ErrEntityNotFound
	}
	cc, isCage := cage.GetComponent(ecs.ComponentTypeCage)
	if !isCage {
		return ErrEntityNotFound
	}
	cageState := cc.(*components.CageComponent)
	if cageState.Open {
		return ErrCageOpen
	}
	encounter, captives, ok := s.captivesOfEncounter(cageState.Encounter)
	if !ok {
		return fmt.Errorf("cage %s names no Captives encounter", cageID)
	}
	ec, _ := encounter.GetComponent(ecs.ComponentTypeEncounter)
	living := s.livingNPCs(ec.(*components.EncounterComponent))
	group := make([]*ecs.Entity, len(living))
	for i, n := range living {
		group[i] = n.entity
	}
	if err := s.makeAllies(group, opener); err != nil {
		return err
	}
	cageState.Open, captives.Open, captives.KeyCarried = true, true, false
	for _, n := range living {
		systems.Say(n.npc, components.LineCaptiveFreed)
	}
	slog.Info("Cage opened, captives freed", "sessionID", s.ID, "opener", opener, "allies", len(group))
	return nil
}
