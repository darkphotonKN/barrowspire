package game

import (
	"fmt"
	"log/slog"
	"math"
	"slices"

	commonconstants "github.com/darkphotonKN/barrowspire-server/game-service/common/constants"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/levelgen"
	"github.com/google/uuid"
)

/**
* Seals (FS-5FZ4J §B). Every dungeon floor with stairs is sealed: its stairs
* refuse a climb, and its gate stays shut, until its seals are broken. A seal
* is a floor entity (SealComponent) and its pieces are floor entities
* (SealPieceComponent) that name it; a floor change clears them all.
*
* A seal kind is a small unit (sealKind): where its pieces stand, found before
* anything is laid so a floor that cannot hold it tries its next seed (§H
* R45), and what working one of its pieces does. Breaking a seal, opening the
* gate and waking an ambush are the framework's, shared by every kind.
**/

// sealKind is one kind of seal.
type sealKind interface {
	// plan finds where the kind's pieces stand on d at depth, holding each
	// spot through the occupied-area check; an error when they do not all fit.
	plan(s *Session, d *dungeonFloor, depth int) ([]plannedPiece, error)
	// work answers an in-play delver's interact, in reach, on one of its pieces.
	work(s *Session, w pieceWork)
}

// sealKinds are the kinds built, by kind. FS-5FZ4J §B R9.
var sealKinds = map[components.SealKind]sealKind{
	components.SealLeverOrder:     leverOrder{},
	components.SealWeightedPlates: weightedPlates{},
}

// sealWatcher is a kind the floor works itself, tick by tick, by what stands
// on its pieces rather than by an interact: Weighted Plates (FS-5FZ4J §C R18).
type sealWatcher interface {
	// watch reads the floor's entities this tick for one of its seals, broken
	// or not.
	watch(s *Session, seal *ecs.Entity, sc *components.SealComponent, entities []*ecs.Entity)
}

// watchSeals has every seal of a kind the floor works itself watch its
// pieces, after the walk and the blocks' pushes (FS-5FZ4J §C R18).
func (s *Session) watchSeals(entities []*ecs.Entity) {
	for _, e := range entities {
		sc, ok := e.GetComponent(ecs.ComponentTypeSeal)
		if !ok {
			continue
		}
		if w, watches := sealKinds[sc.(*components.SealComponent).Kind].(sealWatcher); watches {
			w.watch(s, e, sc.(*components.SealComponent), entities)
		}
	}
}

// plannedPiece is one piece of a seal, where it will stand, not laid yet.
type plannedPiece struct {
	kind  components.SealPieceKind
	at    point
	glyph string
	turn  int
	// wakes says its first work wakes an ambush (§B R14)
	wakes bool
}

// sealPlan is one seal of a floor, found before anything is laid.
type sealPlan struct {
	kind   components.SealKind
	pieces []plannedPiece
}

// pieceWork is one delver's interact on one seal piece.
type pieceWork struct {
	playerID uuid.UUID
	delver   *ecs.Entity
	piece    *ecs.Entity
	pc       *components.SealPieceComponent
	seal     *ecs.Entity
	sc       *components.SealComponent
}

// The interact replies' reasons on a sealed floor, from which the client
// writes its own lines. FS-5FZ4J §I R49.
const (
	RefusalStairsSealed = "stairs_sealed"
	RefusalGateSealed   = "gate_sealed"
	RefusalLeverDown    = "lever_down"
	RefusalLeverWrong   = "lever_wrong"
	ReasonMural         = "mural"
)

// sealKindsFor is the kinds of the floor at depth's seals, in chain order.
// Until the draw table lands the draw is ForcedSealKind on every floor; the
// per-floor draw and the chain of floors 8-10 come with the other kinds
// (FS-5FZ4J §B R9).
func sealKindsFor(_ int) []components.SealKind {
	return []components.SealKind{ForcedSealKind}
}

// planSeals finds where every seal of the floor at depth stands; an error
// when one cannot be placed, so the floor's next seed is tried (§H R45).
func (s *Session) planSeals(depth int, d *dungeonFloor) ([]sealPlan, error) {
	var plans []sealPlan
	for _, kind := range sealKindsFor(depth) {
		rules, built := sealKinds[kind]
		if !built {
			return nil, fmt.Errorf("seal kind %q is not built", kind)
		}
		pieces, err := rules.plan(s, d, depth)
		if err != nil {
			return nil, fmt.Errorf("seal %q: %w", kind, err)
		}
		plans = append(plans, sealPlan{kind: kind, pieces: pieces})
	}
	return plans, nil
}

/**
* laySeals lays a sealed floor's gate, when a seal holds it, and its seals and
* their pieces where they were planned (FS-5FZ4J §A R4, §H R45). The gate is
* shut from the start: its cells are blocked on the floor's grid before any
* monster paths over it (§D R22).
**/
func (s *Session) laySeals(d *dungeonFloor, plans []sealPlan) {
	if len(plans) == 0 {
		return
	}
	if slices.ContainsFunc(plans, func(p sealPlan) bool { return p.kind.HoldsGate() }) {
		s.layBarrier(d, components.BarrierGate, d.layout.Stairs.Barrier)
	}
	for stage, plan := range plans {
		seal := CreateSealEntity(s.EntityManager, plan.kind, stage+1)
		for _, piece := range plan.pieces {
			entity := CreateSealPieceEntity(s.EntityManager, SealPieceConfig{
				Seal:  seal.ID,
				Kind:  piece.kind,
				X:     piece.at.x,
				Y:     piece.at.y,
				Cell:  d.cellOf(piece.at),
				Glyph: piece.glyph,
				Turn:  piece.turn,
				Wakes: piece.wakes,
			})
			if piece.kind == components.SealPieceBlock {
				s.standBlock(d, entity)
			}
		}
	}
}

// standBlock makes a laid piece a stone block, one cell in size, and shuts
// its cell on the floor's grid: monster paths go round it while it stands
// there (FS-5FZ4J §C R19, §D R22).
func (s *Session) standBlock(d *dungeonFloor, piece *ecs.Entity) {
	piece.AddComponent(&components.StoneBlockComponent{Size: d.layout.CellSize})
	pc, _ := piece.GetComponent(ecs.ComponentTypeSealPiece)
	s.setWalkable([]components.Cell{pc.(*components.SealPieceComponent).Cell}, false)
}

// layBarrier stands a shut barrier of kind over rect's cells and blocks them
// on the floor's grid.
func (s *Session) layBarrier(d *dungeonFloor, kind components.BarrierKind, rect levelgen.CellRect) *ecs.Entity {
	size := d.layout.CellSize
	cells := make([]components.Cell, 0, rect.W*rect.H)
	for y := rect.Y; y < rect.Y+rect.H; y++ {
		for x := rect.X; x < rect.X+rect.W; x++ {
			cells = append(cells, components.Cell{X: x, Y: y})
		}
	}
	barrier := CreateBarrierEntity(s.EntityManager, BarrierConfig{
		Kind:   kind,
		X:      float64(rect.X) * size,
		Y:      float64(rect.Y) * size,
		Width:  float64(rect.W) * size,
		Height: float64(rect.H) * size,
		Cells:  cells,
	})
	s.setWalkable(cells, false)
	return barrier
}

// setWalkable marks cells walkable or not on the floor's grid, the one the
// monster AI paths over and the movement system's straight moves read
// (FS-5FZ4J §D R22). A floor of buildings has none.
func (s *Session) setWalkable(cells []components.Cell, walkable bool) {
	if s.navGrid == nil {
		return
	}
	for _, c := range cells {
		s.navGrid.SetWalkable(c.X, c.Y, walkable)
	}
}

// openBarrier opens a barrier for good: bodies pass it from this tick, and so
// do monster paths (FS-5FZ4J §A R4, §D R22).
func (s *Session) openBarrier(barrier *ecs.Entity) {
	if oc, ok := barrier.GetComponent(ecs.ComponentTypeOpenable); ok {
		oc.(*components.OpenableComponent).IsOpen = true
	}
	if bc, ok := barrier.GetComponent(ecs.ComponentTypeBarrier); ok {
		s.setWalkable(bc.(*components.BarrierComponent).Cells, true)
	}
}

// barrierOpen is whether a barrier stands open.
func barrierOpen(barrier *ecs.Entity) bool {
	oc, ok := barrier.GetComponent(ecs.ComponentTypeOpenable)
	return ok && oc.(*components.OpenableComponent).IsOpen
}

// cellOf is the cell holding p on d's grid.
func (d *dungeonFloor) cellOf(p point) components.Cell {
	size := d.layout.CellSize
	return components.Cell{X: int(math.Floor(p.x / size)), Y: int(math.Floor(p.y / size))}
}

// seals is every seal of the floor.
func (s *Session) seals() []*components.SealComponent {
	var seals []*components.SealComponent
	for _, e := range s.EntityManager.GetAllEntities() {
		if sc, ok := e.GetComponent(ecs.ComponentTypeSeal); ok {
			seals = append(seals, sc.(*components.SealComponent))
		}
	}
	return seals
}

// sealHolds is whether a seal of the floor is unbroken: its stairs refuse a
// climb (FS-5FZ4J §B R12). A floor with no seal, the top floor and a floor of
// buildings (§A R1), never holds.
func (s *Session) sealHolds() bool {
	return slices.ContainsFunc(s.seals(), func(sc *components.SealComponent) bool { return !sc.Broken })
}

// gateHeld is whether an unbroken seal of the floor holds its gate (§B R13).
func (s *Session) gateHeld() bool {
	return slices.ContainsFunc(s.seals(), func(sc *components.SealComponent) bool {
		return !sc.Broken && sc.Kind.HoldsGate()
	})
}

/**
* breakSeal breaks a seal, once and for good, for the whole party; the state
* says so, not a reply (FS-5FZ4J §B R11, §I R48). The floor's gate opens on
* the tick its last gate-holding seal breaks (R13).
**/
func (s *Session) breakSeal(seal *ecs.Entity) {
	sc, ok := seal.GetComponent(ecs.ComponentTypeSeal)
	if !ok || sc.(*components.SealComponent).Broken {
		return
	}
	sc.(*components.SealComponent).Broken = true
	slog.Info("Seal broken", "sessionID", s.ID, "kind", sc.(*components.SealComponent).Kind)

	if s.gateHeld() {
		return
	}
	for _, e := range s.EntityManager.GetAllEntities() {
		if bc, ok := e.GetComponent(ecs.ComponentTypeBarrier); ok && bc.(*components.BarrierComponent).Kind == components.BarrierGate {
			s.openBarrier(e)
		}
	}
}

// piecesOf is every piece of seal, in no set order.
func (s *Session) piecesOf(seal uuid.UUID) []*components.SealPieceComponent {
	var pieces []*components.SealPieceComponent
	for _, e := range s.EntityManager.GetAllEntities() {
		if pc, ok := e.GetComponent(ecs.ComponentTypeSealPiece); ok && pc.(*components.SealPieceComponent).Seal == seal {
			pieces = append(pieces, pc.(*components.SealPieceComponent))
		}
	}
	return pieces
}

/**
* workSealPiece answers a delver's interact on a seal piece, on the tick: in
* reach, its seal's kind decides what happens. A refusal is play, so it
* returns no error. FS-5FZ4J §C R15-R16.
**/
func (s *Session) workSealPiece(playerID uuid.UUID, delver *ecs.Entity, body *components.TransformComponent, piece *ecs.Entity) error {
	if err := s.inReachOf(playerID, body, piece); err != nil {
		return err
	}
	pc, _ := piece.GetComponent(ecs.ComponentTypeSealPiece)
	w := pieceWork{playerID: playerID, delver: delver, piece: piece, pc: pc.(*components.SealPieceComponent)}

	seal, ok := s.EntityManager.GetEntity(w.pc.Seal)
	if !ok {
		return fmt.Errorf("seal piece %s names no seal: %w", piece.ID, ErrEntityNotFound)
	}
	sc, _ := seal.GetComponent(ecs.ComponentTypeSeal)
	w.seal, w.sc = seal, sc.(*components.SealComponent)

	rules, built := sealKinds[w.sc.Kind]
	if !built {
		return fmt.Errorf("seal kind %q is not built", w.sc.Kind)
	}
	rules.work(s, w)
	return nil
}

/**
* reachBarrier answers a delver's interact on a barrier, on the tick. A shut
* gate is refused gate_sealed (FS-5FZ4J §B R13); it opens only with its seals.
* An open one answers nothing. Reach is measured to the barrier's nearest
* point: a gate is as wide as its corridor.
**/
func (s *Session) reachBarrier(playerID uuid.UUID, body *components.TransformComponent, barrier *ecs.Entity) error {
	if nx, ny := nearestOnRect(barrier, body.X, body.Y); !s.calcWithinDistance(body.X, body.Y, nx, ny) {
		s.sendErrorToPlayer(playerID, string(commonconstants.ActionInteract), "too far away to interact")
		return ErrOutOfRange
	}
	if barrierOpen(barrier) {
		return nil
	}
	bc, _ := barrier.GetComponent(ecs.ComponentTypeBarrier)
	if bc.(*components.BarrierComponent).Kind == components.BarrierGate {
		s.sendRefusalToPlayer(playerID, string(commonconstants.ActionInteract),
			"the gate is sealed", RefusalGateSealed, nil)
	}
	return nil
}

// nearestOnRect is the point of a door-shaped entity's rect nearest (x, y).
func nearestOnRect(e *ecs.Entity, x, y float64) (float64, float64) {
	tc, _ := e.GetComponent(ecs.ComponentTypeTransform)
	at := tc.(*components.TransformComponent)
	w, h := 0.0, 0.0
	if dc, ok := e.GetComponent(ecs.ComponentTypeDoor); ok {
		w, h = dc.(*components.DoorComponent).Width, dc.(*components.DoorComponent).Height
	}
	return min(max(x, at.X), at.X+w), min(max(y, at.Y), at.Y+h)
}
