package game

import (
	"errors"
	"log/slog"
	"slices"

	"github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/levelgen"
)

/**
* The Chasm (FS-5FZ4J §E R33): a band of pit cells two cells thick crosses the
* stairs room between its doorway side and its stairs side. Along one side
* wall a ledge one cell wide stays walkable, every other ledge cell a spike
* plate (a trap like any, on top of the floor's count). The bridge lever stands
* on the stairs side: pulling it lowers the bridge, the pit cells of a
* two-cell lane through the band's middle become walkable for the floor's
* life, and the seal breaks. The pits are rock to bodies and monster paths,
* barriers that never open but the lane's. The ledge is the way for anyone:
* solvable by one (R10). The Chasm holds no gate (§B R13): the chasm is the
* stairs room's barrier, and a floor whose only seal it is has none.
**/
type chasm struct{}

// errNoChasmRoom is a floor drawn with a Chasm whose stairs room is too small
// for one: a forced Chasm tries the floor's next seed (§E R33).
var errNoChasmRoom = errors.New("the stairs room is too small for a chasm")

// chasmGround is where a floor's Chasm lies in its stairs room, in cells:
// what the build holds, lays and opens. Found once, with the floor, before its
// layout is published.
type chasmGround struct {
	// band is the whole pit band, ledge cells included, across the room
	band levelgen.CellRect
	// pits are the band's pit cells either side of the lane: shut for good
	pits []levelgen.CellRect
	// lane is the pit cells the bridge makes walkable
	lane levelgen.CellRect
	// ledge is the walkable side-wall strip across the band and a cell past
	// it either way; spikes are every other one of its cells
	ledge  levelgen.CellRect
	spikes []components.Cell
	// doorwaySide is the room's cells between its doorway wall and the band
	doorwaySide levelgen.CellRect
}

// The Chasm's shape: a band ChasmBandCells thick, a lane ChasmLaneCells wide
// (FS-5FZ4J §E R33).
const (
	ChasmBandCells = 2
	ChasmLaneCells = 2
)

/**
* digChasm finds where the Chasm lies in d's stairs room, the ledge on the
* side wall drawn from the spawn source, and holds the band and the ledge
* through the occupied-area check, so nothing of the build stands on either.
* The band crosses the room's middle, measured from the doorway wall: at
* least two rows on each side of it in a room 6 cells deep. The ledge runs a
* cell past the band either way, a spike plate on its band cell nearer the
* doorway and on its first cell past the band, so a crossing steps on one.
**/
func (s *Session) digChasm(d *dungeonFloor) (*chasmGround, error) {
	if !d.layout.ChasmCapable {
		return nil, errNoChasmRoom
	}
	frame := chasmFrameOf(d.layout.Rooms[d.layout.Stairs.Room].Rect, d.layout.Stairs.Barrier)
	band := (frame.deep - ChasmBandCells) / 2
	ledge := 0
	if s.spawnRand.IntN(2) == 1 {
		ledge = frame.wide - 1
	}
	pitFrom := 0
	if ledge == 0 {
		pitFrom = 1
	}
	pitCells := frame.wide - 1
	laneFrom := pitFrom + (pitCells-ChasmLaneCells)/2

	g := &chasmGround{
		band:        frame.rect(0, band, frame.wide, ChasmBandCells),
		lane:        frame.rect(laneFrom, band, ChasmLaneCells, ChasmBandCells),
		ledge:       frame.rect(ledge, band-1, 1, ChasmBandCells+2),
		doorwaySide: frame.rect(0, 0, frame.wide, band),
		pits: []levelgen.CellRect{
			frame.rect(pitFrom, band, laneFrom-pitFrom, ChasmBandCells),
			frame.rect(laneFrom+ChasmLaneCells, band, pitFrom+pitCells-laneFrom-ChasmLaneCells, ChasmBandCells),
		},
	}
	for v := band; v < band+ChasmBandCells+2; v += 2 {
		g.spikes = append(g.spikes, frame.cell(ledge, v))
	}
	s.objectOccupiedPlaceAreas = append(s.objectOccupiedPlaceAreas, d.rectArea(g.band), d.rectArea(g.ledge))
	return g, nil
}

/**
* chasmFrame reads a stairs room in its own terms: across (u) along its
* doorway wall, wide cells, and deep (v) from that wall, deep cells. A gate
* in a column stands on a west or east wall, as levelgen's chasmCapable reads
* it.
**/
type chasmFrame struct {
	room       levelgen.CellRect
	wide, deep int
	// column says the gate is in a column: v runs east-west
	column bool
	// far says the doorway wall is the room's south or east one: v runs back
	far bool
}

func chasmFrameOf(room, gate levelgen.CellRect) chasmFrame {
	if gate.W == 1 && gate.H > 1 {
		return chasmFrame{room: room, wide: room.H, deep: room.W, column: true, far: gate.X >= room.X+room.W}
	}
	return chasmFrame{room: room, wide: room.W, deep: room.H, far: gate.Y >= room.Y+room.H}
}

// cell is the room's cell at (u, v).
func (f chasmFrame) cell(u, v int) components.Cell {
	if f.far {
		v = f.deep - 1 - v
	}
	if f.column {
		return components.Cell{X: f.room.X + v, Y: f.room.Y + u}
	}
	return components.Cell{X: f.room.X + u, Y: f.room.Y + v}
}

// rect is the room's cells from (u, v), du across and dv deep.
func (f chasmFrame) rect(u, v, du, dv int) levelgen.CellRect {
	a, b := f.cell(u, v), f.cell(u+du-1, v+dv-1)
	x0, y0 := min(a.X, b.X), min(a.Y, b.Y)
	return levelgen.CellRect{X: x0, Y: y0, W: max(a.X, b.X) - x0 + 1, H: max(a.Y, b.Y) - y0 + 1}
}

// rectArea is r's cells as an area in px.
func (d *dungeonFloor) rectArea(r levelgen.CellRect) PlaceArea {
	size := d.layout.CellSize
	return PlaceArea{X: float64(r.X) * size, Y: float64(r.Y) * size, W: float64(r.W) * size, H: float64(r.H) * size}
}

/**
* placeOnStairsSide finds a fixture's spot of half-size (rw, rh) in the stairs
* room past the Chasm, as placeFixture does, with its doorway side held while
* it looks: the stairs and the bridge lever stand there (FS-5FZ4J §E R33).
**/
func (s *Session) placeOnStairsSide(d *dungeonFloor, g *chasmGround, rw, rh float64) (point, bool) {
	held := len(s.objectOccupiedPlaceAreas)
	s.objectOccupiedPlaceAreas = append(s.objectOccupiedPlaceAreas, d.rectArea(g.doorwaySide))
	at, ok := s.placeFixture(d, d.layout.Roles.Stairs, rw, rh)
	// the doorway side is held only while the stairs side is looked over
	s.objectOccupiedPlaceAreas = slices.Delete(s.objectOccupiedPlaceAreas, held, held+1)
	return at, ok
}

// plan stands the bridge lever on the stairs side. It wakes no ambush: the
// gauntlet was the cost (FS-5FZ4J §E R33).
func (chasm) plan(s *Session, d *dungeonFloor, _ int) ([]plannedPiece, error) {
	if d.chasm == nil {
		return nil, errNoChasmRoom
	}
	at, ok := s.placeOnStairsSide(d, d.chasm, constants.ContainerWidthRadius, constants.ContainerHeightRadius)
	if !ok {
		return nil, errors.New("the stairs side of the chasm has no spot for the bridge lever")
	}
	return []plannedPiece{{kind: components.SealPieceBridgeLever, at: at}}, nil
}

// work lowers the bridge: the lane opens for the floor's life, the lever
// stays down and the seal breaks. A lowered bridge answers nothing.
func (chasm) work(s *Session, w pieceWork) {
	if w.pc.Active {
		return
	}
	w.pc.Active = true
	if lane := s.chasmLane(); lane != nil {
		s.openBarrier(lane)
	}
	slog.Info("Bridge lowered", "sessionID", s.ID, "player_id", w.playerID)
	s.breakSeal(w.seal)
}

// layChasm lays the floor's chasm, when it has one: its pits, shut, and the
// ledge's spike plates, armed and undetected (FS-5FZ4J §E R33, §H R45).
func (s *Session) layChasm(d *dungeonFloor) {
	if d.chasm == nil {
		return
	}
	for _, pit := range append(slices.Clone(d.chasm.pits), d.chasm.lane) {
		s.layBarrier(d, components.BarrierPit, pit)
	}
	for _, c := range d.chasm.spikes {
		at := d.cellCentre(c)
		CreateTrapEntity(s.EntityManager, TrapConfig{Kind: components.TrapSpikePlate, Cell: c, X: at.x, Y: at.y})
	}
}

// chasmLane is the pit barrier over the floor's bridge lane, nil with none.
func (s *Session) chasmLane() *ecs.Entity {
	if s.dungeon == nil || s.dungeon.chasm == nil {
		return nil
	}
	lane := cellsOf(s.dungeon.chasm.lane)
	for _, e := range s.EntityManager.GetAllEntities() {
		if bc, ok := e.GetComponent(ecs.ComponentTypeBarrier); ok {
			if b := bc.(*components.BarrierComponent); b.Kind == components.BarrierPit && slices.Equal(b.Cells, lane) {
				return e
			}
		}
	}
	return nil
}
