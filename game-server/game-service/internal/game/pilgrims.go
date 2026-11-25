package game

import (
	"cmp"
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
* The Lost Pilgrims (FS-4EC7Z §B). Three pilgrims cower in the encounter
* room. The first delver within PilgrimPleaCells of one, or a talk, starts
* their plea; PilgrimWaveDelay later the wave comes from the corridors outside
* two of the room's doorways, if a pilgrim still lives. The wave cleared with
* one alive, they give their thanks and a better chest beside the nearest of
* them; with none alive, nothing.
**/

// lostPilgrims is the Lost Pilgrims' entry in encounterKinds: three bodies,
// their plea and wave on the tick, a talk that starts the plea.
var lostPilgrims = encounterKind{
	spots: PilgrimCount,
	half:  constants.PlayerRadius,
	lay: func(s *Session, encounter *ecs.Entity, ec *components.EncounterComponent, plan *encounterPlan) {
		s.layPilgrims(encounter, ec, plan.spots)
	},
	advance: func(s *Session, dt float64, encounter *ecs.Entity, ec *components.EncounterComponent) {
		if wc, ok := encounter.GetComponent(ecs.ComponentTypePilgrimWave); ok {
			s.advancePilgrims(dt, ec, wc.(*components.PilgrimWaveComponent))
		}
	},
	talk: func(s *Session, encounter *ecs.Entity, ec *components.EncounterComponent, _ uuid.UUID, _ *ecs.Entity, npc *components.EncounterNPCComponent) {
		if wc, ok := encounter.GetComponent(ecs.ComponentTypePilgrimWave); ok {
			s.talkToPilgrim(ec, wc.(*components.PilgrimWaveComponent), npc)
		}
	},
}

// layPilgrims stands the pilgrims at spots, cowering, each of
// PilgrimHealthFactor times a standard fodder monster's health at the floor's
// monster level, in the looks by turn, and their plea yet to start. FS-4EC7Z
// §B R6.
func (s *Session) layPilgrims(encounter *ecs.Entity, ec *components.EncounterComponent, spots []point) {
	health := pilgrimHealth(s.floorMonsterLevel())
	for i, at := range spots {
		npc := CreateEncounterNPCEntity(s.EntityManager, EncounterNPCConfig{
			Kind:      components.EncounterNPCPilgrim,
			Look:      PilgrimLooks[i%len(PilgrimLooks)],
			Stance:    components.StancePeaceful,
			Action:    components.EncounterActionCower,
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
	spots := s.dungeon.waveSpots(s.spawnRand, ec.Room, len(pack), inPlayPositions(delversOf(s.EntityManager.GetAllEntities())))
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
// outside its one, on cells clear of delvers by MonsterDelverExclusion where
// the corridors hold them (§A R5); fewer when the corridors hold fewer cells.
func (d *dungeonFloor) waveSpots(rng populationRand, room, n int, delvers []point) []point {
	openings := d.roomOpenings(room)
	if len(openings) == 0 {
		return nil
	}
	shuffle(rng, openings)
	sides := openings[:min(2, len(openings))]
	barred := d.barrierCells()
	used := map[int]bool{}
	clearance := func(i int) float64 {
		return nearestOfPoints(d.cellCentre(components.Cell{X: i % d.layout.Cols, Y: i / d.layout.Cols}), delvers)
	}
	var spots []point
	for i, mouth := range sides {
		count := n
		if len(sides) == 2 {
			count = (n + 1 - i) / 2
		}
		for _, c := range d.walkOut(mouth, count, barred, used, clearance) {
			spots = append(spots, d.cellCentre(c))
		}
	}
	return spots
}

// nearestOfPoints is how far p stands from the nearest of points; +Inf with
// none.
func nearestOfPoints(p point, points []point) float64 {
	nearest := math.Inf(1)
	for _, o := range points {
		nearest = min(nearest, math.Hypot(p.x-o.x, p.y-o.y))
	}
	return nearest
}

/*
walkOut is up to k corridor cells walked out from mouth, breadth first over
corridor cells off barriers and off used, nearest first but the mouth's own
cells last, so the wave stands a cell out from the doorway when the corridor
allows. Only a cell whose clearance (how far it stands from the nearest
delver) is at least MonsterDelverExclusion is taken while the walk finds
them; short of k, the rest are the cells it walked farthest from the
delvers, as an ambush with no clear room spawns. Each taken is marked used.
*/
func (d *dungeonFloor) walkOut(mouth []components.Cell, k int, barred, used map[int]bool, clearance func(i int) float64) []components.Cell {
	cols := d.layout.Cols
	seen := map[int]bool{}
	var queue, atMouth, crowded []int
	for _, c := range mouth {
		i := c.Y*cols + c.X
		seen[i] = true
		queue = append(queue, i)
		atMouth = append(atMouth, i)
	}
	var out []int
	take := func(i int) {
		switch {
		case used[i]:
		case clearance(i) >= MonsterDelverExclusion:
			out = append(out, i)
		default:
			crowded = append(crowded, i)
		}
	}
	for q := 0; q < len(queue) && len(out) < k; q++ {
		x, y := queue[q]%cols, queue[q]/cols
		for _, n := range [4][2]int{{x + 1, y}, {x - 1, y}, {x, y + 1}, {x, y - 1}} {
			i, ok := d.corridorCell(n[0], n[1], barred)
			if !ok || seen[i] {
				continue
			}
			seen[i] = true
			queue = append(queue, i)
			if len(out) < k {
				take(i)
			}
		}
	}
	for _, i := range atMouth {
		if len(out) >= k {
			break
		}
		take(i)
	}
	if len(out) < k {
		slices.SortStableFunc(crowded, func(a, b int) int { return cmp.Compare(clearance(b), clearance(a)) })
		out = append(out, crowded[:min(len(crowded), k-len(out))]...)
	}
	cells := make([]components.Cell, len(out))
	for j, i := range out {
		used[i] = true
		cells[j] = components.Cell{X: i % cols, Y: i / cols}
	}
	return cells
}
