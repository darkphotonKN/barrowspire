package game

import (
	"fmt"
	"math"
	"slices"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/levelgen"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
)

/**
* Weighted Plates (FS-5FZ4J §C R17-R20): plates in one room of their own, as
* many stone blocks beside them, the seal broken on the first tick every plate
* is held at once. A plate is held by what stands on its cell: a body that
* weighs (a delver's centre; a hired ally's, FS-4EC7Z, or a hound's, FS-X2CMM
* R58, through the same body kind, systems.BodyKindOf) or a stone block come
* to rest there; never a monster. The first plate held wakes the seal's one
* ambush. One delver can push every block onto a plate: solvable by one
* (R10), as the build checks.
**/
type weightedPlates struct{}

// plateCount is how many plates a Weighted Plates has on the floor at depth.
func plateCount(rng populationRand, depth int) int {
	if depth <= PlateLowFloorsMax {
		return PlateCountLow
	}
	return PlateCountMin + rng.IntN(PlateCountMax-PlateCountMin+1)
}

/**
* plan stands the plates and as many blocks in one room drawn from those that
* may hold them (plateRooms), one nothing else of the build stands in yet, at
* a placement the push search passes; a room that never passes is passed over
* for the next (FS-5FZ4J §C R17, R20). The whole room is then held through the
* occupied-area check, so no container, fixture or tome lands in it, and the
* population leaves it empty (quietRooms). The first plate carries the seal's
* one ambush, woken at whichever plate is held first (R18).
**/
func (weightedPlates) plan(s *Session, d *dungeonFloor, depth int) ([]plannedPiece, error) {
	n := plateCount(s.spawnRand, depth)
	rooms := d.plateRooms()
	shuffle(s.spawnRand, rooms)

	for _, room := range rooms {
		area := d.roomArea(room)
		if !s.isFree(area) {
			continue
		}
		plates, blocks, ok := d.placePlates(s.spawnRand, room, n)
		if !ok {
			continue
		}
		s.objectOccupiedPlaceAreas = append(s.objectOccupiedPlaceAreas, area)
		pieces := make([]plannedPiece, 0, 2*n)
		for i, c := range plates {
			pieces = append(pieces, plannedPiece{kind: components.SealPiecePlate, at: d.cellCentre(c), wakes: i == 0})
		}
		for _, c := range blocks {
			pieces = append(pieces, plannedPiece{kind: components.SealPieceBlock, at: d.cellCentre(c)})
		}
		return pieces, nil
	}
	return nil, fmt.Errorf("no room of at least %dx%d holds %d plates and blocks solvably", PlateRoomLong, PlateRoomShort, n)
}

// work answers an interact on a plate or a block: nothing. A plate is held by
// standing on it and a block is moved by walking into it (FS-5FZ4J §C R18-R19).
func (weightedPlates) work(*Session, pieceWork) {}

/**
* watch weighs every plate of the seal this tick: held while a body that
* weighs has its centre on the plate's cell or a block rests there (FS-5FZ4J
* §C R18), shown as the piece's active, broken seal or not. While the seal
* holds, the first plate held wakes its one ambush, on the delver holding it
* or the one whose push brought the block there; and on the first tick every
* plate is held at once the seal breaks (R17).
**/
func (weightedPlates) watch(s *Session, _ float64, seal *ecs.Entity, sc *components.SealComponent, entities []*ecs.Entity) {
	plates := platesOf(seal, entities)
	if len(plates) == 0 {
		return
	}
	size := s.dungeonCellSize()
	every := true
	var held *ecs.Entity
	var waker *ecs.Entity
	for _, plate := range plates {
		pc := pieceComponent(plate)
		holds, by := plateHeld(pc.Cell, size, entities)
		pc.Active = holds
		every = every && holds
		if holds && held == nil {
			held, waker = plate, by
		}
	}
	if sc.Broken || held == nil {
		return
	}
	if once, ok := plateAmbush(plates); ok && !once.Woken {
		if waker == nil {
			waker = nearestDelverTo(held, entities)
		}
		if waker != nil {
			tc, _ := held.GetComponent(ecs.ComponentTypeTransform)
			at := tc.(*components.TransformComponent)
			s.wakeAmbush(once, point{at.X, at.Y}, waker)
		}
	}
	if every {
		s.breakSeal(seal)
	}
}

/**
* plateHeld is whether something holds the plate on cell, and the delver it
* is down to: a body that weighs with its centre on the cell, that body; else
* a stone block at rest on the cell, the delver whose push left it there, nil
* when they are gone or out of play. Cells are size px a side.
**/
func plateHeld(cell components.Cell, size float64, entities []*ecs.Entity) (bool, *ecs.Entity) {
	if size <= 0 {
		return false, nil
	}
	var block *components.StoneBlockComponent
	for _, e := range entities {
		if bc, ok := e.GetComponent(ecs.ComponentTypeStoneBlock); ok {
			if stone := bc.(*components.StoneBlockComponent); !stone.Sliding && pieceComponent(e).Cell == cell {
				block = stone
			}
			continue
		}
		if !systems.BodyKindOf(e).Weighs() {
			continue
		}
		if tc, ok := e.GetComponent(ecs.ComponentTypeTransform); ok {
			at := tc.(*components.TransformComponent)
			if (components.Cell{X: int(math.Floor(at.X / size)), Y: int(math.Floor(at.Y / size))}) == cell {
				return true, e
			}
		}
	}
	if block == nil {
		return false, nil
	}
	for _, e := range entities {
		if e.ID == block.PushedBy && systems.BodyKindOf(e) == systems.BodyDelver {
			return true, e
		}
	}
	return true, nil
}

// platesOf is seal's plates, by entity.
func platesOf(seal *ecs.Entity, entities []*ecs.Entity) []*ecs.Entity {
	var plates []*ecs.Entity
	for _, e := range entities {
		if pc, ok := e.GetComponent(ecs.ComponentTypeSealPiece); ok {
			if piece := pc.(*components.SealPieceComponent); piece.Seal == seal.ID && piece.Kind == components.SealPiecePlate {
				plates = append(plates, e)
			}
		}
	}
	return plates
}

// plateAmbush is the seal's one ambush, carried by one of its plates.
func plateAmbush(plates []*ecs.Entity) (*components.AmbushComponent, bool) {
	for _, plate := range plates {
		if ac, ok := plate.GetComponent(ecs.ComponentTypeAmbush); ok {
			return ac.(*components.AmbushComponent), true
		}
	}
	return nil, false
}

// nearestDelverTo is the delver in play nearest e, nil with none.
func nearestDelverTo(e *ecs.Entity, entities []*ecs.Entity) *ecs.Entity {
	tc, ok := e.GetComponent(ecs.ComponentTypeTransform)
	if !ok {
		return nil
	}
	at := tc.(*components.TransformComponent)
	var nearest *ecs.Entity
	best := math.Inf(1)
	for _, other := range entities {
		if systems.BodyKindOf(other) != systems.BodyDelver {
			continue
		}
		oc, _ := other.GetComponent(ecs.ComponentTypeTransform)
		o := oc.(*components.TransformComponent)
		if d := math.Hypot(o.X-at.X, o.Y-at.Y); d < best {
			nearest, best = other, d
		}
	}
	return nearest
}

// pieceComponent is a seal piece entity's piece.
func pieceComponent(e *ecs.Entity) *components.SealPieceComponent {
	pc, _ := e.GetComponent(ecs.ComponentTypeSealPiece)
	return pc.(*components.SealPieceComponent)
}

// dungeonCellSize is the current dungeon floor's cell side, 0 on any other.
func (s *Session) dungeonCellSize() float64 {
	if s.dungeon == nil {
		return 0
	}
	return s.dungeon.layout.CellSize
}

// plateRooms is the rooms a Weighted Plates may stand in: a seal piece's
// (sealRooms), never a treasure room, whose chest always stands, and at least
// PlateRoomLong x PlateRoomShort cells either way round (FS-5FZ4J §C R17). A
// respite's room joins the barred ones when respites land.
func (d *dungeonFloor) plateRooms() []int {
	return slices.DeleteFunc(d.sealRooms(), func(room int) bool {
		r := d.layout.Rooms[room].Rect
		long, short := max(r.W, r.H), min(r.W, r.H)
		return slices.Contains(d.layout.Roles.Treasure, room) || long < PlateRoomLong || short < PlateRoomShort
	})
}

/**
* placePlates draws n plates and n blocks on distinct cells of room's footing
* (plateFooting), no block on a plate, up to PlatePlacementDraws times, and
* keeps the first draw the push search passes from the room's first doorway
* (FS-5FZ4J §C R20). Every piece stands inside the room's border, which is
* left open, so a delver entering at any doorway can walk its whole ring.
* false when the room has too few cells or no draw passes.
**/
func (d *dungeonFloor) placePlates(rng populationRand, room, n int) (plates, blocks []components.Cell, ok bool) {
	r := d.layout.Rooms[room]
	cells := d.plateFooting(room)
	if len(cells) < 2*n || len(r.Doorways) == 0 {
		return nil, nil, false
	}
	start := d.roomEntry(room)
	for range PlatePlacementDraws {
		drawn := slices.Clone(cells)
		shuffle(rng, drawn)
		plates, blocks = drawn[:n], drawn[n:2*n]
		if platesCoverable(r.Rect.W, r.Rect.H, d.inRoom(room, plates), d.inRoom(room, blocks), start) {
			return plates, blocks, true
		}
	}
	return nil, nil, false
}

// inRoom is cells as room's own, (0, 0) its top-left: as the push search
// reads them.
func (d *dungeonFloor) inRoom(room int, cells []components.Cell) []components.Cell {
	r := d.layout.Rooms[room].Rect
	out := make([]components.Cell, len(cells))
	for i, c := range cells {
		out[i] = components.Cell{X: c.X - r.X, Y: c.Y - r.Y}
	}
	return out
}

// roomEntry is where the push search has a delver enter room: its first
// doorway, in the room's own cells.
func (d *dungeonFloor) roomEntry(room int) components.Cell {
	door := d.layout.Rooms[room].Doorways[0]
	return d.inRoom(room, []components.Cell{{X: door.X, Y: door.Y}})[0]
}

// plateFooting is the cells of room a plate or a block may stand on: at
// least one cell from its walls and its doorways, that is inside its border
// and beside no doorway, diagonals included (FS-5FZ4J §C R20). Row by row.
func (d *dungeonFloor) plateFooting(room int) []components.Cell {
	r := d.layout.Rooms[room]
	var cells []components.Cell
	for y := r.Rect.Y + 1; y < r.Rect.Y+r.Rect.H-1; y++ {
		for x := r.Rect.X + 1; x < r.Rect.X+r.Rect.W-1; x++ {
			beside := slices.ContainsFunc(r.Doorways, func(c levelgen.Cell) bool {
				return max(c.X-x, x-c.X) <= 1 && max(c.Y-y, y-c.Y) <= 1
			})
			if !beside {
				cells = append(cells, components.Cell{X: x, Y: y})
			}
		}
	}
	return cells
}

// roomArea is room's whole rect in px.
func (d *dungeonFloor) roomArea(room int) PlaceArea {
	r, size := d.layout.Rooms[room].Rect, d.layout.CellSize
	return PlaceArea{X: float64(r.X) * size, Y: float64(r.Y) * size, W: float64(r.W) * size, H: float64(r.H) * size}
}

// cellCentre is the centre of cell in px.
func (d *dungeonFloor) cellCentre(c components.Cell) point {
	size := d.layout.CellSize
	return point{x: (float64(c.X) + 0.5) * size, y: (float64(c.Y) + 0.5) * size}
}

// quietRooms is the rooms the floor's build leaves empty of anything else
// that stands on the ground, monsters and containers both: a Weighted Plates
// room, found by its plates (FS-5FZ4J §C R17), every hidden room, which
// holds only its own contents (§F R39), every respite room (§D R21, §G
// R40), and the encounter room, which holds its NPCs and no rolled monster
// (FS-4EC7Z §A R2). Never nil.
func (s *Session) quietRooms(d *dungeonFloor) map[int]bool {
	quiet := map[int]bool{}
	if d.encounter != nil {
		quiet[d.encounter.room] = true
	}
	for _, h := range d.layout.Hidden {
		quiet[h.Room] = true
	}
	for _, r := range d.respites {
		quiet[r.room] = true
	}
	// a chained Weighted Plates' room, before its pieces are laid
	for _, plan := range d.seals {
		for _, piece := range plan.pieces {
			if piece.kind == components.SealPiecePlate {
				quiet[d.roomAt(piece.at.x, piece.at.y)] = true
			}
		}
	}
	for _, e := range s.EntityManager.GetAllEntities() {
		pc, ok := e.GetComponent(ecs.ComponentTypeSealPiece)
		tc, placed := e.GetComponent(ecs.ComponentTypeTransform)
		if !ok || !placed || pc.(*components.SealPieceComponent).Kind != components.SealPiecePlate {
			continue
		}
		at := tc.(*components.TransformComponent)
		if room := d.roomAt(at.X, at.Y); room >= 0 {
			quiet[room] = true
		}
	}
	return quiet
}
