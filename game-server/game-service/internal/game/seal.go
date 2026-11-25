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
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/systems"
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
	components.SealHiddenKey:      hiddenKey{},
	components.SealBraziers:       braziers{},
	components.SealChasm:          chasm{},
}

// sealWatcher is a kind the floor works itself, tick by tick, rather than by
// an interact alone: Weighted Plates by what stands on its pieces (FS-5FZ4J
// §C R18), Braziers by its window's clock (§E R34).
type sealWatcher interface {
	// watch reads the floor's entities this tick, dt seconds long, for one of
	// its seals, broken or not.
	watch(s *Session, dt float64, seal *ecs.Entity, sc *components.SealComponent, entities []*ecs.Entity)
}

// watchSeals has every seal of a kind the floor works itself watch its
// pieces, after the walk and the blocks' pushes (FS-5FZ4J §C R18, §E R34).
func (s *Session) watchSeals(dt float64, entities []*ecs.Entity) {
	for _, e := range entities {
		sc, ok := e.GetComponent(ecs.ComponentTypeSeal)
		if !ok {
			continue
		}
		if w, watches := sealKinds[sc.(*components.SealComponent).Kind].(sealWatcher); watches {
			w.watch(s, dt, e, sc.(*components.SealComponent), entities)
		}
	}
}

// plannedPiece is one piece of a seal, where it will stand, not laid yet; or,
// with lore set, a lore piece laid beside the seal's (a mural) that is no
// piece of it.
type plannedPiece struct {
	kind  components.SealPieceKind
	lore  components.LoreKind
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

/**
* sealKindsFor is the kinds of the floor at depth's seals, in chain order,
* drawn with the floor before its layout (drawFloor), so a Hidden Key gets its
* hidden room (FS-5FZ4J §B R9): one from sealBandLow on floors up to
* SealLowFloorsMax, one from all five up to SealMidFloorsMax, and above, two
* chained, the first from sealChainFirst and the second from all five but the
* first's kind. Each is drawn uniformly from rng, the session's spawn source.
* With alive, the delvers alive at the floor's build, at one, a two-body kind
* never rolls (R10). The tuning's forced kind, when set, is every floor's one
* seal.
**/
func (t floorTuning) sealKindsFor(rng populationRand, depth, alive int) []components.SealKind {
	if t.forcedSealKind != "" {
		return []components.SealKind{t.forcedSealKind}
	}
	switch {
	case depth <= SealLowFloorsMax:
		return []components.SealKind{t.drawSealKind(rng, sealBandLow, alive)}
	case depth <= SealMidFloorsMax:
		return []components.SealKind{t.drawSealKind(rng, sealBandAll, alive)}
	}
	first := t.drawSealKind(rng, sealChainFirst, alive)
	return []components.SealKind{first, t.drawSealKind(rng, sealBandAll, alive, first)}
}

// drawSealKind is one kind drawn uniformly from set, less but and, with one
// delver alive, less every two-body kind (FS-5FZ4J §B R9-R10).
func (t floorTuning) drawSealKind(rng populationRand, set []components.SealKind, alive int, but ...components.SealKind) components.SealKind {
	kinds := slices.DeleteFunc(slices.Clone(set), func(k components.SealKind) bool {
		return slices.Contains(but, k) || (alive <= 1 && t.twoBodyKinds[k])
	})
	return kinds[rng.IntN(len(kinds))]
}

// planSeals finds where each of kinds, the floor at depth's seals, stands; an
// error when one cannot be placed, so the floor's next seed is tried (§H R45).
func (s *Session) planSeals(depth int, d *dungeonFloor, kinds []components.SealKind) ([]sealPlan, error) {
	var plans []sealPlan
	for _, kind := range kinds {
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
* laySeals lays a sealed floor's gate, when a seal holds it, its seals, the
* first stage's pieces where they were planned, and its chasm's pits and
* ledge (FS-5FZ4J §A R4, §H R45). A later stage's pieces are laid only when
* the stage before it breaks (§B R9). The gate is shut from the start: its
* cells are blocked on the floor's grid before any monster paths over it
* (§D R22).
**/
func (s *Session) laySeals(d *dungeonFloor, plans []sealPlan) {
	if len(plans) == 0 {
		return
	}
	if slices.ContainsFunc(plans, func(p sealPlan) bool { return holdsGate(p.kind) }) {
		s.layBarrier(d, components.BarrierGate, d.layout.Stairs.Barrier)
	}
	for stage, plan := range plans {
		seal := CreateSealEntity(s.EntityManager, plan.kind, stage+1)
		if stage == 0 {
			s.layPieces(d, seal.ID, plan.pieces)
		}
	}
	s.layChasm(d)
}

// layPieces stands seal's planned pieces, and the lore pieces planned beside
// them, telling seal. One laid in a hidden room whose secret door is still
// shut is concealed by it, as the room's contents are (FS-5FZ4J §F R37): a
// chained Hidden Key's key, laid after the build. A block laid mid-floor (a
// chained Weighted Plates') whose cell a body stands on is laid on the
// nearest free cell of its room instead, its home still the planned cell, to
// which it drifts once left alone (§C R19).
func (s *Session) layPieces(d *dungeonFloor, seal uuid.UUID, pieces []plannedPiece) {
	for i, piece := range pieces {
		if piece.lore != "" {
			entity := CreateLorePieceEntity(s.EntityManager, LorePieceConfig{
				Kind: piece.lore, Tells: seal, X: piece.at.x, Y: piece.at.y, Cell: d.cellOf(piece.at),
			})
			s.concealInShutRoom(d, entity, piece.at)
			continue
		}
		home, at := d.cellOf(piece.at), piece.at
		if piece.kind == components.SealPieceBlock {
			at = d.cellCentre(s.blockFooting(d, home, pieces[i+1:]))
		}
		entity := CreateSealPieceEntity(s.EntityManager, SealPieceConfig{
			Seal:  seal,
			Kind:  piece.kind,
			X:     at.x,
			Y:     at.y,
			Cell:  d.cellOf(at),
			Glyph: piece.glyph,
			Turn:  piece.turn,
			Wakes: piece.wakes,
		})
		if piece.kind == components.SealPieceBlock {
			s.standBlock(d, entity, home)
		}
		s.concealInShutRoom(d, entity, piece.at)
	}
}

/**
* blockFooting is the cell a block planned on home is laid on: home itself
* unless a body overlaps it (the push's own body test), else the free cell of
* its room's footing nearest home, one no body overlaps, no laid piece or
* still-to-be-laid piece holds and the grid holds open. With none free, home:
* the walk then moves the body out of the block, loudly logged.
**/
func (s *Session) blockFooting(d *dungeonFloor, home components.Cell, rest []plannedPiece) components.Cell {
	entities := s.EntityManager.GetAllEntities()
	size := d.layout.CellSize
	if !systems.BodyOverlapsCell(home, size, entities) {
		return home
	}
	taken := map[components.Cell]bool{}
	for _, p := range rest {
		taken[d.cellOf(p.at)] = true
	}
	for _, e := range entities {
		if pc, ok := e.GetComponent(ecs.ComponentTypeSealPiece); ok {
			taken[pc.(*components.SealPieceComponent).Cell] = true
		}
	}
	centre := d.cellCentre(home)
	room := d.roomAt(centre.x, centre.y)
	if room < 0 {
		return home
	}
	footing := d.plateFooting(room)
	slices.SortStableFunc(footing, func(a, b components.Cell) int {
		return cellSteps(a, home) - cellSteps(b, home)
	})
	for _, c := range footing {
		if !taken[c] && (s.navGrid == nil || s.navGrid.Walkable(c.X, c.Y)) && !systems.BodyOverlapsCell(c, size, entities) {
			return c
		}
	}
	slog.Warn("A block laid on a body: its room has no free cell", "sessionID", s.ID, "cell", home)
	return home
}

// cellSteps is the 4-neighbour steps between two cells.
func cellSteps(a, b components.Cell) int {
	return max(a.X-b.X, b.X-a.X) + max(a.Y-b.Y, b.Y-a.Y)
}

// concealInShutRoom conceals entity, laid at at, by the shut secret door of
// the hidden room it stands in; nothing outside one.
func (s *Session) concealInShutRoom(d *dungeonFloor, entity *ecs.Entity, at point) {
	if door := s.shutSecretDoorOf(d, d.roomAt(at.x, at.y)); door != nil {
		entity.AddComponent(&components.ConcealedComponent{By: door.ID})
	}
}

// shutSecretDoorOf is room's secret door while it is shut, nil when room is
// no hidden room or its door stands open.
func (s *Session) shutSecretDoorOf(d *dungeonFloor, room int) *ecs.Entity {
	i := slices.IndexFunc(d.layout.Hidden, func(h levelgen.BarredRoom) bool { return h.Room == room })
	if i < 0 {
		return nil
	}
	cells := cellsOf(d.layout.Hidden[i].Barrier)
	for _, e := range s.EntityManager.GetAllEntities() {
		if bc, ok := e.GetComponent(ecs.ComponentTypeBarrier); ok && slices.Equal(bc.(*components.BarrierComponent).Cells, cells) {
			if barrierOpen(e) {
				return nil
			}
			return e
		}
	}
	return nil
}

// layNextStage lays the pieces of the seal chained after stage, on the tick
// stage breaks (FS-5FZ4J §B R9); nothing when stage is the floor's last.
func (s *Session) layNextStage(stage int) {
	d := s.dungeon
	if d == nil || stage >= len(d.seals) {
		return
	}
	for _, e := range s.EntityManager.GetAllEntities() {
		if sc, ok := e.GetComponent(ecs.ComponentTypeSeal); ok && sc.(*components.SealComponent).Stage == stage+1 {
			s.layPieces(d, e.ID, d.seals[stage].pieces)
			slog.Info("Chained seal's pieces laid", "sessionID", s.ID, "kind", d.seals[stage].kind, "stage", stage+1)
			return
		}
	}
}

// standBlock makes a laid piece a stone block, one cell in size, at home on
// home and kept to the plates room it stands in, and shuts its cell on the
// floor's grid: monster paths go round it while it stands there (FS-5FZ4J §C
// R19 as amended, §D R22).
func (s *Session) standBlock(d *dungeonFloor, piece *ecs.Entity, home components.Cell) {
	pc, _ := piece.GetComponent(ecs.ComponentTypeSealPiece)
	cell := pc.(*components.SealPieceComponent).Cell
	block := &components.StoneBlockComponent{Size: d.layout.CellSize, Home: home}
	if room := d.roomAt(d.cellCentre(cell).x, d.cellCentre(cell).y); room >= 0 {
		r := d.layout.Rooms[room].Rect
		block.Room = components.CellRect{X: r.X, Y: r.Y, W: r.W, H: r.H}
	}
	piece.AddComponent(block)
	s.setWalkable([]components.Cell{cell}, false)
}

// layBarrier stands a shut barrier of kind over rect's cells and blocks them
// on the floor's grid.
func (s *Session) layBarrier(d *dungeonFloor, kind components.BarrierKind, rect levelgen.CellRect) *ecs.Entity {
	size := d.layout.CellSize
	cells := cellsOf(rect)
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

// delversInPlay is how many delvers are in play on the floor.
func (s *Session) delversInPlay() int {
	n := 0
	for _, e := range s.EntityManager.GetAllEntities() {
		if systems.InPlay(e) {
			n++
		}
	}
	return n
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

// holdsGate is whether a seal of kind keeps the stairs room's gate shut:
// every kind but the Chasm, whose chasm is its barrier. FS-5FZ4J §B R13.
func holdsGate(kind components.SealKind) bool { return kind != components.SealChasm }

// gateHeld is whether an unbroken seal of the floor holds its gate (§B R13).
func (s *Session) gateHeld() bool {
	return slices.ContainsFunc(s.seals(), func(sc *components.SealComponent) bool {
		return !sc.Broken && holdsGate(sc.Kind)
	})
}

/**
* breakSeal breaks a seal, once and for good, for the whole party; the state
* says so, not a reply (FS-5FZ4J §B R11, §I R48). The seal chained after it
* has its pieces laid on that tick (R9), and the floor's gate opens on the
* tick its last gate-holding seal breaks (R13).
**/
func (s *Session) breakSeal(seal *ecs.Entity) {
	sc, ok := seal.GetComponent(ecs.ComponentTypeSeal)
	if !ok || sc.(*components.SealComponent).Broken {
		return
	}
	sc.(*components.SealComponent).Broken = true
	slog.Info("Seal broken", "sessionID", s.ID, "kind", sc.(*components.SealComponent).Kind)
	s.layNextStage(sc.(*components.SealComponent).Stage)

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
* readLore answers a delver's interact on a lore piece, on the tick: in reach,
* a mural answers with its seal's glyphs in order, a shrine with its lore. A
* lore piece belongs to no seal's working: it wakes nothing. FS-5FZ4J §C R15,
* §F R39, §I R49.
**/
func (s *Session) readLore(playerID uuid.UUID, body *components.TransformComponent, piece *ecs.Entity) error {
	if err := s.inReachOf(playerID, body, piece); err != nil {
		return err
	}
	lc, _ := piece.GetComponent(ecs.ComponentTypeLorePiece)
	lore := lc.(*components.LorePieceComponent)
	switch lore.Kind {
	case components.LoreMural:
		readMural(s, playerID, s.leversOf(lore.Tells))
	case components.LoreShrine:
		s.readShrine(playerID)
	}
	return nil
}

/**
* reachBarrier answers a delver's interact on a barrier, on the tick. A shut
* gate is refused gate_sealed (FS-5FZ4J §B R13); it opens only with its seals,
* or breaks a Hidden Key seal whose key the party carries (§E R32). A secret
* door is searched (§F R38). An open gate answers nothing. Reach is measured to
* the barrier's nearest point: a gate is as wide as its corridor.
**/
func (s *Session) reachBarrier(playerID uuid.UUID, delver *ecs.Entity, body *components.TransformComponent, barrier *ecs.Entity) error {
	// an undetected secret door is no target: the client has no id for it,
	// and one sent anyway is not found (FS-5FZ4J §F R38)
	if isSecretDoor(barrier) && !detected(barrier) {
		return ErrUndetected
	}
	if nx, ny := nearestOnRect(barrier, body.X, body.Y); !s.calcWithinDistance(body.X, body.Y, nx, ny) {
		s.sendErrorToPlayer(playerID, string(commonconstants.ActionInteract), "too far away to interact")
		return ErrOutOfRange
	}
	if isSecretDoor(barrier) {
		return s.reachSecretDoor(playerID, delver, barrier)
	}
	if barrierOpen(barrier) {
		return nil
	}
	bc, _ := barrier.GetComponent(ecs.ComponentTypeBarrier)
	if bc.(*components.BarrierComponent).Kind == components.BarrierGate && !s.turnKey() {
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
