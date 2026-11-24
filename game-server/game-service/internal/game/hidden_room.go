package game

import (
	"log/slog"
	"slices"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/levelgen"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/types"
	"github.com/google/uuid"
)

/**
* Hidden rooms (FS-5FZ4J §F R35-R39). A hidden room is a dead end behind a
* secret door: a shut barrier over the layout's door cells, blocking bodies and
* monster paths (§D R22), kept off the wire until a delver comes within 2
* cells of it (detection, R38), and opened for good by the first search to
* complete. Until it opens, the floor map leaves out the room's region and the
* door's cells, and nothing standing in the room is sent (R37); its opening
* sends every member the floor map again.
*
* What each hidden room holds is drawn with the floor, before its layout is
* generated, so the generator is asked for exactly that many (R35).
**/

// hiddenUse is what a hidden room holds. FS-5FZ4J §F R39.
type hiddenUse string

const (
	// hiddenStairKey is the Hidden Key seal's key room (§E R32)
	hiddenStairKey hiddenUse = "stair_key"
	// hiddenChest is a better chest's room
	hiddenChest hiddenUse = "chest"
	// hiddenShrine is a lore shrine's room
	hiddenShrine hiddenUse = "shrine"
	// hiddenHallowedAltar is the hallowed altar's room, when it stands
	// hidden (§G R42)
	hiddenHallowedAltar hiddenUse = "hallowed_altar"
)

// The interact replies' reasons of a hidden room. FS-5FZ4J §I R49.
const (
	RefusalDoorOpen = "door_open"
	ReasonShrine    = "shrine"
)

// floorDraw is what a dungeon floor draws before its layout is generated:
// its seals, in chain order (none on the top floor), what each of its hidden
// rooms holds, in the order the layout gives the rooms, and whether it holds
// a fountain (§G R40) and the wandering merchant (FS-9JV5K §A R1).
type floorDraw struct {
	seals    []components.SealKind
	hidden   []hiddenUse
	fountain bool
	merchant bool
}

// drawFloor draws the floor at depth's seals, for alive delvers alive at its
// build (FS-5FZ4J §B R9-R10), its hidden rooms and whether it holds a
// fountain (§G R40). also is one more hidden room for each use given: the
// hallowed altar's when it is placed hidden (§G R42).
func (s *Session) drawFloor(depth, alive int, also ...hiddenUse) floorDraw {
	var draw floorDraw
	if s.hasStairs(depth) {
		draw.seals = sealKindsFor(s.spawnRand, depth, alive)
	}
	draw.hidden = hiddenRoomsFor(s.spawnRand, depth, draw.seals, also...)
	draw.fountain = fountainFor(s.spawnRand, depth, s.isTopFloor(depth))
	draw.merchant = merchantFor(s.spawnRand, depth, s.isTopFloor(depth))
	return draw
}

// chasmMisfits is whether the draw has a Chasm that layout's stairs room
// cannot hold, and may draw again: a forced Chasm never is (FS-5FZ4J §E R33).
func (draw floorDraw) chasmMisfits(layout levelgen.DungeonLayout) bool {
	return !layout.ChasmCapable && ForcedSealKind == "" && slices.Contains(draw.seals, components.SealChasm)
}

/**
* redrawChasm draws the draw's Chasm again, from all five kinds but the Chasm
* and the floor's other seal's kind, as the band would (FS-5FZ4J §B R9, §E
* R33); a Hidden Key drawn in its place adds its key's hidden room.
**/
func (s *Session) redrawChasm(alive int, draw floorDraw) floorDraw {
	seals := slices.Clone(draw.seals)
	for i, kind := range seals {
		if kind == components.SealChasm {
			seals[i] = drawSealKind(s.spawnRand, sealBandAll, alive, seals...)
		}
	}
	hidden := slices.Clone(draw.hidden)
	if slices.Contains(seals, components.SealHiddenKey) && !slices.Contains(hidden, hiddenStairKey) {
		hidden = append(hidden, hiddenStairKey)
		shuffle(s.spawnRand, hidden)
	}
	return floorDraw{seals: seals, hidden: hidden, fountain: draw.fountain, merchant: draw.merchant}
}

// hiddenRoomMax is how many hidden rooms the floor at depth rolls at most.
// FS-5FZ4J §F R35.
func hiddenRoomMax(depth int) int {
	switch {
	case depth <= firstFloor:
		return 0
	case depth <= HiddenRoomsMidFloorsMax:
		return HiddenRoomsMidMax
	default:
		return HiddenRoomsHighMax
	}
}

/**
* hiddenRoomsFor is what each hidden room of the floor at depth holds, in a
* random order: its rolled count (uniform from 0 to its band's max), each a
* better chest at HiddenChestShare else a lore shrine, plus the Hidden Key's
* key room when a seal of the floor is the Hidden Key, plus one room per use
* in also. FS-5FZ4J §F R35, R39, §E R32.
*
* Draws, in order: the count when the band allows any, a chest-or-shrine per
* rolled room, then the shuffle.
**/
func hiddenRoomsFor(rng populationRand, depth int, seals []components.SealKind, also ...hiddenUse) []hiddenUse {
	var uses []hiddenUse
	if most := hiddenRoomMax(depth); most > 0 {
		for range rng.IntN(most + 1) {
			if rng.Float64() < HiddenChestShare {
				uses = append(uses, hiddenChest)
			} else {
				uses = append(uses, hiddenShrine)
			}
		}
	}
	if slices.Contains(seals, components.SealHiddenKey) {
		uses = append(uses, hiddenStairKey)
	}
	uses = append(uses, also...)
	shuffle(rng, uses)
	return uses
}

// hiddenUseOf is what the layout's i-th hidden room holds: a better chest
// when the draw named none for it.
func (d *dungeonFloor) hiddenUseOf(i int) hiddenUse {
	if i < len(d.hidden) {
		return d.hidden[i]
	}
	return hiddenChest
}

// hiddenRoomOf is the hidden room that holds use, false when none does.
func (d *dungeonFloor) hiddenRoomOf(use hiddenUse) (levelgen.BarredRoom, bool) {
	for i, h := range d.layout.Hidden {
		if d.hiddenUseOf(i) == use {
			return h, true
		}
	}
	return levelgen.BarredRoom{}, false
}

// isHidden is whether room is a hidden room.
func (d *dungeonFloor) isHidden(room int) bool {
	return slices.ContainsFunc(d.layout.Hidden, func(h levelgen.BarredRoom) bool { return h.Room == room })
}

/**
* layHiddenRooms stands each hidden room's secret door, shut and undetected,
* and its contents: a better chest, a lore shrine or the hallowed altar (the
* Hidden Key's key is its seal's piece, laid with the seals). Then everything standing in a hidden
* room is concealed by its door. FS-5FZ4J §F R36-R39, §H R45. A room whose
* contents find no spot holds nothing, loudly.
**/
func (s *Session) layHiddenRooms(d *dungeonFloor) {
	for i, h := range d.layout.Hidden {
		door := s.layBarrier(d, components.BarrierSecretDoor, h.Barrier)
		bc, _ := door.GetComponent(ecs.ComponentTypeBarrier)
		spots := make([]components.Spot, 0, len(bc.(*components.BarrierComponent).Cells))
		for _, c := range bc.(*components.BarrierComponent).Cells {
			centre := d.cellCentre(c)
			spots = append(spots, components.Spot{X: centre.x, Y: centre.y})
		}
		door.AddComponent(&components.DetectableComponent{Spots: spots})

		switch use := d.hiddenUseOf(i); use {
		case hiddenChest, hiddenShrine:
			at, ok := s.placeFixture(d, h.Room, constants.ContainerWidthRadius, constants.ContainerHeightRadius)
			if !ok {
				slog.Warn("Hidden room holds nothing: no free spot", "sessionID", s.ID, "room", h.Room, "use", use)
				break
			}
			if use == hiddenChest {
				s.layBetterChest(at)
				break
			}
			CreateSealPieceEntity(s.EntityManager, SealPieceConfig{Kind: components.SealPieceShrine, X: at.x, Y: at.y, Cell: d.cellOf(at)})
		case hiddenHallowedAltar:
			at, ok := s.placeFixture(d, h.Room, constants.ContainerWidthRadius, constants.ContainerHeightRadius)
			if !ok {
				slog.Warn("Hidden room holds nothing: no free spot", "sessionID", s.ID, "room", h.Room, "use", use)
				break
			}
			CreateHallowedAltarEntity(s.EntityManager, at.x, at.y)
		}
		s.conceal(d, h.Room, door.ID)
	}
}

// layBetterChest stands a better chest at at: a chest whose contents roll a
// rarity step up, with no guard and the usual timed open (FS-5FZ4J §F R39).
func (s *Session) layBetterChest(at point) {
	id := s.AddContainer(at.x, at.y, components.ContainerKindChest)
	chest, _ := s.EntityManager.GetEntity(id)
	cc, _ := chest.GetComponent(ecs.ComponentTypeContainer)
	cc.(*components.ContainerComponent).Better = true
}

// conceal marks everything placed in room as hidden by door.
func (s *Session) conceal(d *dungeonFloor, room int, door uuid.UUID) {
	for _, e := range s.EntityManager.GetAllEntities() {
		tc, placed := e.GetComponent(ecs.ComponentTypeTransform)
		if !placed || e.HasComponent(ecs.ComponentTypePlayer) {
			continue
		}
		if at := tc.(*components.TransformComponent); d.roomAt(at.X, at.Y) == room {
			e.AddComponent(&components.ConcealedComponent{By: door})
		}
	}
}

// isSecretDoor is whether e is a secret door.
func isSecretDoor(e *ecs.Entity) bool {
	bc, ok := e.GetComponent(ecs.ComponentTypeBarrier)
	return ok && bc.(*components.BarrierComponent).Kind == components.BarrierSecretDoor
}

// detected is whether the party has detected e; a thing that is never
// hidden is.
func detected(e *ecs.Entity) bool {
	dc, ok := e.GetComponent(ecs.ComponentTypeDetectable)
	return !ok || dc.(*components.DetectableComponent).Detected
}

/**
* reachSecretDoor answers a delver's interact on a detected secret door, in
* reach: a shut one starts their search, a 2 s timed open on the FS-MQYEX
* rules; an open one is refused quietly, door_open. (An undetected one is no
* target: reachBarrier finds it not found.) FS-5FZ4J §F R38, §I R49.
**/
func (s *Session) reachSecretDoor(playerID uuid.UUID, delver, door *ecs.Entity) error {
	if barrierOpen(door) {
		s.sendRefusalToPlayer(playerID, string(constants.ActionInteract), "the door stands open", RefusalDoorOpen, nil)
		return nil
	}
	systems.NewTimedOpenSystem(s.EntityManager).Start(delver, door.ID, components.TimedTargetSearch, SearchDuration)
	return nil
}

/**
* openSecretDoor opens a secret door for everyone, for the floor's life, on
* the tick its first search completes: bodies and monster paths pass it, what
* it concealed is sent from this tick, and every member is sent the floor map
* again, now with the room and the door's cells (FS-5FZ4J §F R37-R38).
**/
func (s *Session) openSecretDoor(door *ecs.Entity) {
	if !isSecretDoor(door) || barrierOpen(door) {
		return
	}
	s.openBarrier(door)
	entities := s.EntityManager.GetAllEntities()
	for _, e := range entities {
		if cc, ok := e.GetComponent(ecs.ComponentTypeConcealed); ok && cc.(*components.ConcealedComponent).By == door.ID {
			e.RemoveComponent(ecs.ComponentTypeConcealed)
		}
	}
	s.publishFloorMap(floorDepth(entities))
	s.sendFloorMap()
}

// readShrine answers a look at a lore shrine: reason shrine, from which the
// client writes a lore line; it wakes nothing (FS-5FZ4J §F R39, §I R49).
func (s *Session) readShrine(playerID uuid.UUID) {
	if err := s.sender.SendMessageToPlayer(playerID, types.Message{
		Action:  string(constants.ActionInteract),
		Payload: map[string]interface{}{"success": true, "reason": ReasonShrine},
	}); err != nil {
		slog.Debug("Could not answer the shrine's reader", "player_id", playerID, "error", err)
	}
}

/**
* shownRegions is the floor map's regions with every hidden room whose secret
* door is shut left out: the room's region, and the door's cells cut from the
* corridor segments holding them, so the door reads as rock (FS-5FZ4J §F R37,
* §I R50). Region ids are kept; an opened room is shown whole.
**/
func (d *dungeonFloor) shownRegions(entities []*ecs.Entity) []levelgen.Region {
	shut := d.shutHiddenRooms(entities)
	if len(shut) == 0 {
		return d.layout.Regions
	}
	hidden := map[int]bool{}
	cut := map[int][]levelgen.Cell{}
	for _, h := range shut {
		hidden[d.roomRegion(h.Room)] = true
		for _, seg := range h.BarrierSegments {
			cut[seg.Region] = append(cut[seg.Region], seg.Cells...)
		}
	}
	regions := make([]levelgen.Region, 0, len(d.layout.Regions))
	for _, r := range d.layout.Regions {
		switch {
		case hidden[r.ID]:
		case len(cut[r.ID]) > 0:
			regions = append(regions, levelgen.Region{ID: r.ID, Kind: r.Kind, Cells: cutCells(r.Cells, cut[r.ID])})
		default:
			regions = append(regions, r)
		}
	}
	return regions
}

// shutHiddenRooms is the hidden rooms whose secret door stands shut: a door is
// its room's when it stands on the room's door cells.
func (d *dungeonFloor) shutHiddenRooms(entities []*ecs.Entity) []levelgen.BarredRoom {
	open := map[components.Cell]bool{}
	for _, e := range entities {
		if !isSecretDoor(e) || !barrierOpen(e) {
			continue
		}
		bc, _ := e.GetComponent(ecs.ComponentTypeBarrier)
		for _, c := range bc.(*components.BarrierComponent).Cells {
			open[c] = true
		}
	}
	var shut []levelgen.BarredRoom
	for _, h := range d.layout.Hidden {
		if !open[components.Cell{X: h.Barrier.X, Y: h.Barrier.Y}] {
			shut = append(shut, h)
		}
	}
	return shut
}

// cutCells is rects with cells taken out, as rects that cover what is left
// exactly once: a rect holding none of them is kept whole, one holding any is
// split into its rows' runs.
func cutCells(rects []levelgen.CellRect, cells []levelgen.Cell) []levelgen.CellRect {
	gone := map[levelgen.Cell]bool{}
	for _, c := range cells {
		gone[c] = true
	}
	var out []levelgen.CellRect
	for _, r := range rects {
		touched := false
		for c := range gone {
			if c.X >= r.X && c.X < r.X+r.W && c.Y >= r.Y && c.Y < r.Y+r.H {
				touched = true
				break
			}
		}
		if !touched {
			out = append(out, r)
			continue
		}
		for y := r.Y; y < r.Y+r.H; y++ {
			start := -1
			for x := r.X; x <= r.X+r.W; x++ {
				kept := x < r.X+r.W && !gone[levelgen.Cell{X: x, Y: y}]
				switch {
				case kept && start < 0:
					start = x
				case !kept && start >= 0:
					out = append(out, levelgen.CellRect{X: start, Y: y, W: x - start, H: 1})
					start = -1
				}
			}
		}
	}
	return out
}
