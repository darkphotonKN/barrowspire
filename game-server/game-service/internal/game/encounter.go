package game

import (
	"fmt"
	"log/slog"
	"math"
	"slices"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/levelgen"
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
* a plan here (how many stand, and how), a lay, a talk and a tick.
**/

// encounterPlan is a floor's encounter as planned with its layout: its kind,
// its room and where its NPCs stand, held before anything is laid.
type encounterPlan struct {
	kind  components.EncounterKind
	room  int
	spots []point
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

// encounterSize is how many NPCs an encounter of kind stands.
func encounterSize(kind components.EncounterKind) int {
	switch kind {
	case components.EncounterLostPilgrims:
		return PilgrimCount
	default:
		return 0
	}
}

/**
* planEncounter holds the floor's encounter room for kind and its NPCs'
* spots: a room the respites' rule and the merchant's both leave open (not
* the start, stairs, switch, escape door, a treasure room, a seal piece's, a
* hidden room or a respite's), drawn first from those at or past the median
* walk distance from the start, then from the rest; a room with too few free
* spots is passed over. Run while the floor is planned, after its respites.
* False, loudly, when no room fits: the floor then holds none. FS-4EC7Z §A R2.
**/
func (s *Session) planEncounter(d *dungeonFloor, kind components.EncounterKind) bool {
	n := encounterSize(kind)
	if n == 0 {
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
		if spots, ok := s.encounterSpots(d, room, n); ok {
			d.encounter = &encounterPlan{kind: kind, room: room, spots: spots}
			return true
		}
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
	slices.Sort(distances)
	n := len(distances)
	if n == 0 {
		return 0
	}
	if n%2 == 1 {
		return float64(distances[n/2])
	}
	return float64(distances[n/2-1]+distances[n/2]) / 2
}

// encounterSpots finds n spots for bodies in room, each as a fixture's is
// found and held; none is held when the room has fewer.
func (s *Session) encounterSpots(d *dungeonFloor, room, n int) ([]point, bool) {
	mark := len(s.objectOccupiedPlaceAreas)
	spots := make([]point, 0, n)
	for range n {
		at, ok := s.placeFixture(d, room, constants.PlayerRadius, constants.PlayerRadius)
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
	switch plan.kind {
	case components.EncounterLostPilgrims:
		s.layPilgrims(encounter, ec, plan.spots)
	}
	slog.Debug("Encounter laid", "sessionID", s.ID, "kind", plan.kind, "room", plan.room, "npcs", len(ec.NPCs))
}

// EncounterNPCConfig is what an encounter NPC is created with.
type EncounterNPCConfig struct {
	Kind      components.EncounterNPCKind
	Look      string
	Stance    components.EncounterStance
	X, Y      float64
	Health    int
	Encounter uuid.UUID
}

// CreateEncounterNPCEntity stands an encounter NPC: a body with health and a
// velocity, so it collides as bodies do, idle and facing down. FS-4EC7Z §A R3.
func CreateEncounterNPCEntity(em *ecs.EntityManager, config EncounterNPCConfig) *ecs.Entity {
	entity := em.CreateEntity()
	entity.AddComponent(&components.EncounterNPCComponent{
		Kind:      config.Kind,
		Look:      config.Look,
		Stance:    config.Stance,
		Action:    components.EncounterActionIdle,
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
* kind's own tick. FS-4EC7Z §A R3, §B.
**/
func (s *Session) advanceEncounters(dt float64, entities []*ecs.Entity) {
	systems.NewEncounterNPCSystem(s.EntityManager, EncounterCorpseLifetime).Update(dt, entities)
	for _, e := range entities {
		ec, ok := e.GetComponent(ecs.ComponentTypeEncounter)
		if !ok {
			continue
		}
		if wc, isPilgrims := e.GetComponent(ecs.ComponentTypePilgrimWave); isPilgrims {
			s.advancePilgrims(dt, ec.(*components.EncounterComponent), wc.(*components.PilgrimWaveComponent))
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
* one is passed over quietly, one out of reach is refused as any interact
* is; else it is a talk, answered by the NPC's line on the state and what
* its kind's talk starts. The NPC turns to the talker. FS-4EC7Z §A R4.
**/
func (s *Session) talkToEncounterNPC(playerID uuid.UUID, body *components.TransformComponent, target *ecs.Entity) error {
	if !alive(target) {
		return fmt.Errorf("talk: encounter NPC %s is dead", target.ID)
	}
	if err := s.inReachOf(playerID, body, target); err != nil {
		return err
	}
	nc, _ := target.GetComponent(ecs.ComponentTypeEncounterNPC)
	npc := nc.(*components.EncounterNPCComponent)
	tc, _ := target.GetComponent(ecs.ComponentTypeTransform)
	faceTowards(npc, tc.(*components.TransformComponent), body.X, body.Y)

	encounter, ok := s.EntityManager.GetEntity(npc.Encounter)
	if !ok {
		return nil
	}
	if wc, isPilgrims := encounter.GetComponent(ecs.ComponentTypePilgrimWave); isPilgrims {
		ec, _ := encounter.GetComponent(ecs.ComponentTypeEncounter)
		s.talkToPilgrim(ec.(*components.EncounterComponent), wc.(*components.PilgrimWaveComponent), npc)
	}
	return nil
}

/**
* The Lost Pilgrims (FS-4EC7Z §B). Three pilgrims cower in the encounter
* room. The first delver within PilgrimPleaCells of one, or a talk, starts
* their plea; PilgrimWaveDelay later the wave comes from the corridors outside
* two of the room's doorways, if a pilgrim still lives. The wave cleared with
* one alive, they give their thanks and a better chest beside the nearest of
* them; with none alive, nothing.
**/

// layPilgrims stands the pilgrims at spots, each of PilgrimHealthFactor times
// a standard fodder monster's health at the floor's monster level, in the
// looks by turn, and their plea yet to start. FS-4EC7Z §B R6.
func (s *Session) layPilgrims(encounter *ecs.Entity, ec *components.EncounterComponent, spots []point) {
	health := pilgrimHealth(s.floorMonsterLevel())
	for i, at := range spots {
		npc := CreateEncounterNPCEntity(s.EntityManager, EncounterNPCConfig{
			Kind:      components.EncounterNPCPilgrim,
			Look:      PilgrimLooks[i%len(PilgrimLooks)],
			Stance:    components.StancePeaceful,
			X:         at.x,
			Y:         at.y,
			Health:    health,
			Encounter: encounter.ID,
		})
		ec.NPCs = append(ec.NPCs, npc.ID)
	}
	encounter.AddComponent(&components.PilgrimWaveComponent{})
}

// pilgrimHealth is a pilgrim's health at a floor's monster level.
func pilgrimHealth(level int) int {
	return max(int(math.Round(float64(monsterSheets[standardFodder].statsAt(level).HP)*PilgrimHealthFactor)), 1)
}

// talkToPilgrim answers a talk to a pilgrim: before the plea, it starts it;
// once the wave has ended with them alive, the thanks; else the plea again.
func (s *Session) talkToPilgrim(ec *components.EncounterComponent, wave *components.PilgrimWaveComponent, npc *components.EncounterNPCComponent) {
	switch {
	case !wave.Pleaded:
		s.plead(ec, wave, npc)
	case wave.Done:
		systems.Say(npc, components.LinePilgrimThanks)
	default:
		systems.Say(npc, components.LinePilgrimPlea)
	}
}

// plead starts the pilgrims' plea, said by speaker: every living pilgrim
// cowers, and the wave is due PilgrimWaveDelay from now. FS-4EC7Z §B R7.
func (s *Session) plead(ec *components.EncounterComponent, wave *components.PilgrimWaveComponent, speaker *components.EncounterNPCComponent) {
	wave.Pleaded, wave.WaveIn = true, PilgrimWaveDelay
	for _, p := range s.livingNPCs(ec) {
		p.npc.Action = components.EncounterActionCower
	}
	systems.Say(speaker, components.LinePilgrimPlea)
	slog.Debug("Pilgrims plead", "sessionID", s.ID, "room", ec.Room)
}

/**
* advancePilgrims runs the pilgrims' plea and wave a tick: before the plea,
* the first delver in play within PilgrimPleaCells cells of a living pilgrim
* starts it, said by the pilgrim nearest them; once due, the wave comes if a
* pilgrim lives, else nothing ever does; once come, every pilgrim dead ends it
* with nothing, and every wave monster dead with a pilgrim alive ends it with
* the thanks and the chest. FS-4EC7Z §B R7-R8, Edge States.
**/
func (s *Session) advancePilgrims(dt float64, ec *components.EncounterComponent, wave *components.PilgrimWaveComponent) {
	if wave.Done || s.dungeon == nil {
		return
	}
	living := s.livingNPCs(ec)
	switch {
	case !wave.Pleaded:
		if speaker, delver, ok := s.approached(living, PilgrimPleaCells*s.dungeon.layout.CellSize); ok {
			faceTowards(speaker.npc, speaker.at, delver.X, delver.Y)
			s.plead(ec, wave, speaker.npc)
		}
	case !wave.Came:
		wave.WaveIn -= dt
		if wave.WaveIn > 0 {
			return
		}
		if len(living) == 0 {
			wave.Done = true
			slog.Debug("Pilgrims lost before their wave", "sessionID", s.ID)
			return
		}
		s.sendWave(ec, wave, living)
	case len(living) == 0:
		wave.Done = true
		slog.Debug("Pilgrims lost", "sessionID", s.ID)
	case s.waveCleared(wave):
		s.thankParty(living)
		wave.Done = true
	}
}

// approached is the living NPC nearest a delver in play within reach of it,
// and that delver's place; false when no delver is that near any.
func (s *Session) approached(living []encounterNPC, reach float64) (encounterNPC, *components.TransformComponent, bool) {
	var speaker encounterNPC
	var by *components.TransformComponent
	best := math.Inf(1)
	for _, delver := range s.EntityManager.GetAllEntities() {
		if !systems.InPlay(delver) {
			continue
		}
		tc, ok := delver.GetComponent(ecs.ComponentTypeTransform)
		if !ok {
			continue
		}
		at := tc.(*components.TransformComponent)
		for _, p := range living {
			if d := math.Hypot(p.at.X-at.X, p.at.Y-at.Y); d <= reach && d < best {
				speaker, by, best = p, at, d
			}
		}
	}
	return speaker, by, by != nil
}

/**
* sendWave sends the pilgrims' wave (FS-4EC7Z §B R7): its pack for the
* delvers in play now, split between the corridors outside two of the room's
* doorways (both outside its one, when it has one), each hunting the living
* pilgrim or delver in play nearest it, at any distance.
**/
func (s *Session) sendWave(ec *components.EncounterComponent, wave *components.PilgrimWaveComponent, living []encounterNPC) {
	wave.Came = true
	pack := s.rollWave(s.delversInPlay())
	spots := s.dungeon.waveSpots(s.spawnRand, ec.Room, len(pack))
	if len(spots) < len(pack) {
		slog.Warn("Pilgrims' wave short: the corridors hold too few spots", "sessionID", s.ID, "rolled", len(pack), "placed", len(spots))
	}
	hunted := s.huntedBodies(living)
	for i, spot := range spots {
		pack[i].X, pack[i].Y = spot.x, spot.y
		monster := CreateMonsterEntity(s.EntityManager, pack[i])
		wave.Wave = append(wave.Wave, monster.ID)
		if prey, ok := nearestOf(hunted, spot); ok {
			if mc, has := monster.GetComponent(ecs.ComponentTypeEnemy); has {
				// taken up at any distance, past the leash, as an ambush's is
				mc.(*components.MonsterComponent).LastAttacker = prey
			}
		}
	}
	slog.Debug("Pilgrims' wave comes", "sessionID", s.ID, "monsters", len(spots))
}

// rollWave is the wave's pack for alive delvers in play: PilgrimWaveBase +
// PilgrimWavePerDelver per delver, one brute of the floor's pool when
// PilgrimWaveBruteFrom or more are alive and the rest its fodder, each at the
// floor's level and elite chance. FS-4EC7Z §B R7, §A R5.
func (s *Session) rollWave(alive int) []MonsterConfig {
	floor := firstFloor
	if f, ok := systems.CurrentFloor(s.EntityManager.GetAllEntities()); ok {
		floor = f.Depth
	}
	s.mu.RLock()
	pool := s.floorPool
	s.mu.RUnlock()
	level := s.floorPartyLevel(floor)

	n := PilgrimWaveBase + PilgrimWavePerDelver*alive
	var pack []MonsterConfig
	if alive >= PilgrimWaveBruteFrom {
		if brute, ok := pool.brute(s.spawnRand); ok {
			pack = append(pack, rollAs(s.spawnRand, brute.rollLook(s.spawnRand), level, floor, eliteChance(floor)))
		}
	}
	for len(pack) < n {
		fodder, ok := pool.fodder(s.spawnRand)
		if !ok {
			break
		}
		pack = append(pack, rollAs(s.spawnRand, fodder.rollLook(s.spawnRand), level, floor, eliteChance(floor)))
	}
	return pack
}

// huntedBody is a body a wave monster may be set on, and where it stands.
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

// waveCleared is whether every wave monster is dead or gone.
func (s *Session) waveCleared(wave *components.PilgrimWaveComponent) bool {
	for _, id := range wave.Wave {
		if e, ok := s.EntityManager.GetEntity(id); ok && alive(e) {
			return false
		}
	}
	return true
}

/**
* thankParty is the wave's end with pilgrims alive: the living pilgrim
* nearest a delver in play (the first, with none in play) says the thanks and
* a better chest (FS-5FZ4J §F R39), shut and unguarded, stands beside it; the
* rest stand idle where they are. FS-4EC7Z §B R8.
**/
func (s *Session) thankParty(living []encounterNPC) {
	speaker := living[0]
	if near, _, ok := s.approached(living, math.Inf(1)); ok {
		speaker = near
	}
	for _, p := range living {
		p.npc.Action = components.EncounterActionIdle
	}
	systems.Say(speaker.npc, components.LinePilgrimThanks)
	s.layBetterChest(s.chestBeside(point{speaker.at.X, speaker.at.Y}))
	slog.Debug("Pilgrims saved", "sessionID", s.ID, "living", len(living))
}

// chestBesideSteps is how many directions round a pilgrim its chest is tried
// in.
const chestBesideSteps = 8

/**
* chestBeside is where a chest stands beside a body at at: the first of
* chestBesideSteps spots round it, a body's radius and a chest's half-width
* off, where a chest stands wholly on its region and over no body; at itself
* when none is.
**/
func (s *Session) chestBeside(at point) point {
	d := s.dungeon
	region := d.regionAt(at.x, at.y)
	rw, rh := constants.ContainerWidthRadius, constants.ContainerHeightRadius
	reach := constants.PlayerRadius + rw + containerPadding
	entities := s.EntityManager.GetAllEntities()
	for i := range chestBesideSteps {
		angle := 2 * math.Pi * float64(i) / chestBesideSteps
		x, y := at.x+reach*math.Cos(angle), at.y+reach*math.Sin(angle)
		area := centredArea(x, y, rw, rh)
		if region != 0 && d.stands(area, region, onDoorways) && !overBody(area, entities) {
			return point{x, y}
		}
	}
	return at
}

// overBody is whether area overlaps a body the ground counts.
func overBody(area PlaceArea, entities []*ecs.Entity) bool {
	for _, e := range entities {
		if systems.BodyKindOf(e) == systems.BodyNone {
			continue
		}
		if tc, ok := e.GetComponent(ecs.ComponentTypeTransform); ok {
			at := tc.(*components.TransformComponent)
			if area.overlapsBody(at.X, at.Y, constants.PlayerRadius) {
				return true
			}
		}
	}
	return false
}

/**
* The wave's spots (FS-4EC7Z §B R7, Edge States). A room's openings are the
* corridor cells just outside its doorways, grouped where they touch: one
* opening a corridor. The wave comes from two of them, drawn, half each, or
* all from its one; each half stands on the corridor cells nearest its
* opening, walked out from it, one a cell, never on a barrier's cells.
**/

// roomOpenings is room's openings: the corridor cells 4-adjacent to its
// doorway cells, off every barrier, grouped by 4-adjacency, in doorway order.
func (d *dungeonFloor) roomOpenings(room int) [][]components.Cell {
	barred := d.barrierCells()
	region := d.roomRegion(room)
	cols := d.layout.Cols
	mouth := map[int]bool{}
	var order []int
	for _, c := range d.layout.Rooms[room].Doorways {
		for _, n := range [4][2]int{{c.X + 1, c.Y}, {c.X - 1, c.Y}, {c.X, c.Y + 1}, {c.X, c.Y - 1}} {
			i, ok := d.corridorCell(n[0], n[1], barred)
			if !ok || d.region[i] == region || mouth[i] {
				continue
			}
			mouth[i] = true
			order = append(order, i)
		}
	}

	grouped := map[int]bool{}
	var openings [][]components.Cell
	for _, start := range order {
		if grouped[start] {
			continue
		}
		grouped[start] = true
		group := []int{start}
		for k := 0; k < len(group); k++ {
			x, y := group[k]%cols, group[k]/cols
			for _, n := range [4]int{(y)*cols + x + 1, (y)*cols + x - 1, (y+1)*cols + x, (y-1)*cols + x} {
				if mouth[n] && !grouped[n] && neighbours(group[k], n, cols) {
					grouped[n] = true
					group = append(group, n)
				}
			}
		}
		cells := make([]components.Cell, len(group))
		for i, g := range group {
			cells[i] = components.Cell{X: g % cols, Y: g / cols}
		}
		openings = append(openings, cells)
	}
	return openings
}

// neighbours is whether cells a and b, by index on a grid cols wide, share a
// side.
func neighbours(a, b, cols int) bool {
	ax, ay, bx, by := a%cols, a/cols, b%cols, b/cols
	return math.Abs(float64(ax-bx))+math.Abs(float64(ay-by)) == 1
}

// corridorCell is cell (x, y)'s index when it is a corridor segment's cell
// on no barrier; false off the grid, on rock, in a room or on a barrier.
func (d *dungeonFloor) corridorCell(x, y int, barred map[int]bool) (int, bool) {
	if x < 0 || y < 0 || x >= d.layout.Cols || y >= d.layout.Rows {
		return 0, false
	}
	i := y*d.layout.Cols + x
	region := d.region[i]
	if region == 0 || barred[i] || d.layout.Regions[region-1].Kind != levelgen.RegionCorridor {
		return 0, false
	}
	return i, true
}

// barrierCells is every cell a barrier of the layout stands on, by index:
// the stairs' gate's and every secret door's.
func (d *dungeonFloor) barrierCells() map[int]bool {
	barred := map[int]bool{}
	rects := []levelgen.CellRect{d.layout.Stairs.Barrier}
	for _, h := range d.layout.Hidden {
		rects = append(rects, h.Barrier)
	}
	for _, r := range rects {
		for y := r.Y; y < r.Y+r.H; y++ {
			for x := r.X; x < r.X+r.W; x++ {
				barred[y*d.layout.Cols+x] = true
			}
		}
	}
	return barred
}

// waveSpots is where n wave monsters stand outside room: half (the larger
// half first) outside each of two of its openings drawn from rng, or all
// outside its one; fewer when the corridors hold fewer cells.
func (d *dungeonFloor) waveSpots(rng populationRand, room, n int) []point {
	openings := d.roomOpenings(room)
	if len(openings) == 0 {
		return nil
	}
	shuffle(rng, openings)
	sides := openings[:min(2, len(openings))]
	barred := d.barrierCells()
	used := map[int]bool{}
	var spots []point
	for i, mouth := range sides {
		count := n
		if len(sides) == 2 {
			count = (n + 1 - i) / 2
		}
		for _, c := range d.walkOut(mouth, count, barred, used) {
			spots = append(spots, d.cellCentre(c))
		}
	}
	return spots
}

// walkOut is up to k corridor cells walked out from mouth, breadth first over
// corridor cells off barriers and off used, nearest first but the mouth's own
// cells last, so the wave stands a cell out from the doorway when the
// corridor allows; each taken is marked used.
func (d *dungeonFloor) walkOut(mouth []components.Cell, k int, barred, used map[int]bool) []components.Cell {
	cols := d.layout.Cols
	seen := map[int]bool{}
	var queue, atMouth []int
	for _, c := range mouth {
		i := c.Y*cols + c.X
		seen[i] = true
		queue = append(queue, i)
		atMouth = append(atMouth, i)
	}
	var out []int
	for q := 0; q < len(queue) && len(out) < k; q++ {
		x, y := queue[q]%cols, queue[q]/cols
		for _, n := range [4][2]int{{x + 1, y}, {x - 1, y}, {x, y + 1}, {x, y - 1}} {
			i, ok := d.corridorCell(n[0], n[1], barred)
			if !ok || seen[i] {
				continue
			}
			seen[i] = true
			queue = append(queue, i)
			if !used[i] && len(out) < k {
				out = append(out, i)
			}
		}
	}
	for _, i := range atMouth {
		if len(out) >= k {
			break
		}
		if !used[i] {
			out = append(out, i)
		}
	}
	cells := make([]components.Cell, len(out))
	for j, i := range out {
		used[i] = true
		cells[j] = components.Cell{X: i % cols, Y: i / cols}
	}
	return cells
}
