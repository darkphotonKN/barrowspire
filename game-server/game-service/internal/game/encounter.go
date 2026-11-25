package game

import (
	"errors"
	"fmt"
	"log/slog"
	"math"
	"slices"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/google/uuid"
)

/**
* Encounters (FS-4EC7Z §A). About two floors in five from floor 2 below the
* top hold one: a group of humanoid NPCs in a room of its own, past the
* middle of the floor's walk. An encounter NPC is a body with health, never a
* monster or a delver: delvers never damage it (systems.CanHit), monsters
* hunt it as they hunt delvers unless it is caged (systems.BodyKind.Hunted),
* and it dies with its floor. Talking to one is an interact in reach,
* answered on the state by its line.
*
* What an encounter is lives on a floor entity, its EncounterComponent, with
* its kind's own component beside it; each NPC names its encounter. A kind is
* an entry in encounterKinds: how many stand, and how, what else it plans,
* its lay, its tick and its talk, each in the kind's own file (pilgrims.go,
* captives.go, cutthroats.go).
**/

// ErrEncounterNPCDead refuses a talk to a dead encounter NPC: play, not a
// fault, so it is refused quietly. FS-4EC7Z §A R3-R4.
var ErrEncounterNPCDead = errors.New("encounter NPC is dead")

/*
encounterKind is what an encounter of one kind is to the floor (FS-4EC7Z §A):
spots, how many spots it holds in its room, each of half-size half (a body's
each, or the Captives' one cage); plan, when set, what else it plans with its
room, false when the floor cannot hold it; lay, how it stands where it was
planned; advance, its tick after the combat; talk, when set, what a talk to
one of its peaceful NPCs starts. A new kind adds an entry.
*/
type encounterKind struct {
	spots   int
	half    float64
	plan    func(s *Session, d *dungeonFloor, plan *encounterPlan) bool
	lay     func(s *Session, encounter *ecs.Entity, ec *components.EncounterComponent, plan *encounterPlan)
	advance func(s *Session, dt float64, encounter *ecs.Entity, ec *components.EncounterComponent)
	talk    func(s *Session, encounter *ecs.Entity, ec *components.EncounterComponent, playerID uuid.UUID, target *ecs.Entity, npc *components.EncounterNPCComponent)
}

// encounterKinds is every encounter kind built, by kind.
var encounterKinds = map[components.EncounterKind]encounterKind{
	components.EncounterLostPilgrims: lostPilgrims,
	components.EncounterCaptives:     captivesKind,
	components.EncounterCutthroats:   cutthroatsKind,
}

// encounterPlan is a floor's encounter as planned with its layout: its kind,
// its room and where its NPCs stand (the Captives' one spot, their cage's),
// and for the Captives where their key goes, held before anything is laid.
type encounterPlan struct {
	kind  components.EncounterKind
	room  int
	spots []point
	key   cageKeyPlan
}

// encounterFor is whether the floor at depth holds an encounter, and of what
// kind: drawn at tuning's chance on floors 2+ below the top, the kind drawn
// uniformly from EncounterKinds; a forced kind holds on every such floor.
// Floor 1 and the top floor draw nothing. FS-4EC7Z §A R1.
func encounterFor(rng populationRand, depth int, top bool, tuning floorTuning) (components.EncounterKind, bool) {
	if depth <= firstFloor || top {
		return "", false
	}
	if tuning.forcedEncounterKind != "" {
		return tuning.forcedEncounterKind, true
	}
	if rng.Float64() >= tuning.encounterFloorChance {
		return "", false
	}
	return EncounterKinds[rng.IntN(len(EncounterKinds))], true
}

/**
* planEncounter holds the floor's encounter room for kind and its NPCs'
* spots: a room the respites' rule and the merchant's both leave open (not
* the start, stairs, switch, escape door, a treasure room, a seal piece's, a
* hidden room or a respite's), drawn first from those at or past the median
* walk distance from the start, then from the rest; a room with too few free
* spots is passed over. What else a kind plans (the Captives' key, §D R13) is
* planned with it, the floor holding none when that fails. Run
* while the floor is planned, after its respites. False, loudly, when no room
* fits: the floor then holds none. FS-4EC7Z §A R2.
**/
func (s *Session) planEncounter(d *dungeonFloor, kind components.EncounterKind) bool {
	built, ok := encounterKinds[kind]
	if !ok {
		slog.Warn("Encounter skipped: its kind is not built", "sessionID", s.ID, "kind", kind)
		return false
	}
	pieces := d.sealPieceRooms()
	median := d.medianRoomDistance()
	var far, near []int
	for room := range d.layout.Rooms {
		if !d.respiteRoomOpen(room, pieces) || !d.merchantRoomOpen(room) {
			continue
		}
		if float64(d.layout.Rooms[room].Distance) >= median {
			far = append(far, room)
		} else {
			near = append(near, room)
		}
	}
	shuffle(s.spawnRand, far)
	shuffle(s.spawnRand, near)
	for _, room := range append(far, near...) {
		spots, ok := s.encounterSpots(d, room, built.spots, built.half)
		if !ok {
			continue
		}
		plan := &encounterPlan{kind: kind, room: room, spots: spots}
		if built.plan != nil && !built.plan(s, d, plan) {
			return false
		}
		d.encounter = plan
		return true
	}
	slog.Warn("Encounter skipped: no open room has free spots", "sessionID", s.ID, "kind", kind)
	return false
}

// medianRoomDistance is the median of the floor's rooms' walk distances from
// the start room.
func (d *dungeonFloor) medianRoomDistance() float64 {
	distances := make([]int, len(d.layout.Rooms))
	for i, r := range d.layout.Rooms {
		distances[i] = r.Distance
	}
	return medianOf(distances)
}

// medianOf is the median of values, the mean of the middle two for an even
// count; 0 for none. values is sorted in place.
func medianOf(values []int) float64 {
	slices.Sort(values)
	n := len(values)
	if n == 0 {
		return 0
	}
	if n%2 == 1 {
		return float64(values[n/2])
	}
	return float64(values[n/2-1]+values[n/2]) / 2
}

// encounterSpots finds n spots of half-size half in room, each as a
// fixture's is found and held; none is held when the room has fewer.
func (s *Session) encounterSpots(d *dungeonFloor, room, n int, half float64) ([]point, bool) {
	mark := len(s.objectOccupiedPlaceAreas)
	spots := make([]point, 0, n)
	for range n {
		at, ok := s.placeFixture(d, room, half, half)
		if !ok {
			s.objectOccupiedPlaceAreas = s.objectOccupiedPlaceAreas[:mark]
			return nil, false
		}
		spots = append(spots, at)
	}
	return spots, true
}

/**
* layEncounter stands the floor's encounter where it was planned: its floor
* entity, then its NPCs as its kind stands them. A floor with none planned
* lays none. FS-4EC7Z §A R2-R3.
**/
func (s *Session) layEncounter(d *dungeonFloor) {
	plan := d.encounter
	if plan == nil {
		return
	}
	encounter := s.EntityManager.CreateEntity()
	ec := &components.EncounterComponent{Kind: plan.kind, Room: plan.room}
	encounter.AddComponent(ec)
	if built, ok := encounterKinds[plan.kind]; ok {
		built.lay(s, encounter, ec, plan)
	}
	slog.Debug("Encounter laid", "sessionID", s.ID, "kind", plan.kind, "room", plan.room, "npcs", len(ec.NPCs))
}

// EncounterNPCConfig is what an encounter NPC is created with; Action is how
// it stands, idle when left empty.
type EncounterNPCConfig struct {
	Kind      components.EncounterNPCKind
	Look      string
	Stance    components.EncounterStance
	Action    components.EncounterAction
	X, Y      float64
	Health    int
	Encounter uuid.UUID
}

// CreateEncounterNPCEntity stands an encounter NPC: a body with health and a
// velocity, so it collides as bodies do, facing down, idle unless config says
// otherwise. FS-4EC7Z §A R3.
func CreateEncounterNPCEntity(em *ecs.EntityManager, config EncounterNPCConfig) *ecs.Entity {
	action := config.Action
	if action == "" {
		action = components.EncounterActionIdle
	}
	entity := em.CreateEntity()
	entity.AddComponent(&components.EncounterNPCComponent{
		Kind:      config.Kind,
		Look:      config.Look,
		Stance:    config.Stance,
		Action:    action,
		FacingY:   1,
		Encounter: config.Encounter,
	})
	entity.AddComponent(components.NewTransformComponent(config.X, config.Y))
	entity.AddComponent(components.NewVelocityComponent(0, 0, 0))
	entity.AddComponent(components.NewHealthComponent(config.Health, config.Health))
	return entity
}

/**
* advanceEncounters runs the floor's encounters a tick, after the combat:
* every NPC's clock and its dead (systems.EncounterNPCSystem), then each
* kind's own tick. FS-4EC7Z §A R3, §B, §D.
**/
func (s *Session) advanceEncounters(dt float64, entities []*ecs.Entity) {
	systems.NewEncounterNPCSystem(s.EntityManager, EncounterCorpseLifetime).Update(dt, entities)
	for _, e := range entities {
		c, ok := e.GetComponent(ecs.ComponentTypeEncounter)
		if !ok {
			continue
		}
		ec := c.(*components.EncounterComponent)
		if built, ok := encounterKinds[ec.Kind]; ok && built.advance != nil {
			built.advance(s, dt, e, ec)
		}
	}
}

// encounterNPC is an encounter NPC entity and its component.
type encounterNPC struct {
	entity *ecs.Entity
	npc    *components.EncounterNPCComponent
	at     *components.TransformComponent
}

// livingNPCs is the encounter's NPCs still alive and standing, in order.
func (s *Session) livingNPCs(ec *components.EncounterComponent) []encounterNPC {
	var living []encounterNPC
	for _, id := range ec.NPCs {
		e, ok := s.EntityManager.GetEntity(id)
		if !ok || !alive(e) {
			continue
		}
		nc, isNPC := e.GetComponent(ecs.ComponentTypeEncounterNPC)
		tc, placed := e.GetComponent(ecs.ComponentTypeTransform)
		if !isNPC || !placed {
			continue
		}
		living = append(living, encounterNPC{entity: e, npc: nc.(*components.EncounterNPCComponent), at: tc.(*components.TransformComponent)})
	}
	return living
}

// alive is whether e has health above 0.
func alive(e *ecs.Entity) bool {
	hc, ok := e.GetComponent(ecs.ComponentTypeHealth)
	return ok && hc.(*components.HealthComponent).CurrentHealth > 0
}

// faceTowards turns npc to face (x, y) from at; a point under it leaves its
// facing as it was.
func faceTowards(npc *components.EncounterNPCComponent, at *components.TransformComponent, x, y float64) {
	dx, dy := x-at.X, y-at.Y
	if d := math.Hypot(dx, dy); d > 0 {
		npc.FacingX, npc.FacingY = dx/d, dy/d
	}
}

/**
* talkToEncounterNPC answers a delver's interact on an encounter NPC: a dead
* one is refused quietly (ErrEncounterNPCDead), one out of reach as any
* interact is; else it is a talk, answered by the NPC's line on the state and what
* its kind's talk starts. A caged captive answers with its plea and an ally
* with its acknowledgement, and they start nothing. The NPC turns to the
* talker. FS-4EC7Z §A R4.
**/
func (s *Session) talkToEncounterNPC(playerID uuid.UUID, body *components.TransformComponent, target *ecs.Entity) error {
	if !alive(target) {
		return fmt.Errorf("talk to %s: %w", target.ID, ErrEncounterNPCDead)
	}
	if err := s.inReachOf(playerID, body, target); err != nil {
		return err
	}
	nc, _ := target.GetComponent(ecs.ComponentTypeEncounterNPC)
	npc := nc.(*components.EncounterNPCComponent)
	tc, _ := target.GetComponent(ecs.ComponentTypeTransform)
	faceTowards(npc, tc.(*components.TransformComponent), body.X, body.Y)
	switch npc.Stance {
	case components.StanceCaged:
		systems.Say(npc, components.LineCaptivePlea)
		return nil
	case components.StanceAlly:
		systems.Say(npc, components.LineAllyAck)
		return nil
	}

	encounter, ok := s.EntityManager.GetEntity(npc.Encounter)
	if !ok {
		return nil
	}
	c, ok := encounter.GetComponent(ecs.ComponentTypeEncounter)
	if !ok {
		return nil
	}
	ec := c.(*components.EncounterComponent)
	if built, ok := encounterKinds[ec.Kind]; ok && built.talk != nil {
		built.talk(s, encounter, ec, playerID, target, npc)
	}
	return nil
}

// huntedBody is a body a monster spawned to hunt may be set on, and where it
// stands: the pilgrims' wave's, a turned Cutthroat's, a mark's call's.
type huntedBody struct {
	id uuid.UUID
	at point
}

// huntedBodies is the living pilgrims and every delver in play.
func (s *Session) huntedBodies(living []encounterNPC) []huntedBody {
	var bodies []huntedBody
	for _, p := range living {
		bodies = append(bodies, huntedBody{id: p.entity.ID, at: point{p.at.X, p.at.Y}})
	}
	for _, e := range s.EntityManager.GetAllEntities() {
		if !systems.InPlay(e) {
			continue
		}
		if tc, ok := e.GetComponent(ecs.ComponentTypeTransform); ok {
			at := tc.(*components.TransformComponent)
			bodies = append(bodies, huntedBody{id: e.ID, at: point{at.X, at.Y}})
		}
	}
	return bodies
}

// nearestOf is the id of the body nearest p; false with none.
func nearestOf(bodies []huntedBody, p point) (uuid.UUID, bool) {
	best, id := math.Inf(1), uuid.Nil
	for _, b := range bodies {
		if d := math.Hypot(b.at.x-p.x, b.at.y-p.y); d < best {
			best, id = d, b.id
		}
	}
	return id, id != uuid.Nil
}
