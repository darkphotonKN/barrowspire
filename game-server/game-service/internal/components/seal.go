package components

import (
	"github.com/darkphotonKN/barrowspire-server/game-service/internal/ecs"
	"github.com/google/uuid"
)

/*
	A sealed floor (FS-5FZ4J): its stairs cannot be climbed, and its gate stays
	shut, until the floor's seals are broken. Each seal is a floor entity of
	its own carrying a SealComponent; its pieces are floor entities carrying a
	SealPieceComponent that names it. Every one of them is a floor entity: a
	floor change clears them with the rest of the floor, so a seal's progress
	is the floor's and never outlives it (§D R31, Edge States).
*/

// SealKind is what a seal is broken by. FS-5FZ4J §B R9, §I R46.
type SealKind string

const (
	SealLeverOrder     SealKind = "lever_order"
	SealWeightedPlates SealKind = "weighted_plates"
	SealHiddenKey      SealKind = "hidden_key"
	SealChasm          SealKind = "chasm"
	SealBraziers       SealKind = "braziers"
)

// SealComponent is one seal of a floor. Stage is its 1-based place in the
// floor's chain (FS-5FZ4J §B R9). Broken is set once, for the whole party, and
// never cleared (R11). What breaks it is its kind's rule, read off its pieces.
// KeyCarried is a Hidden Key seal's: the party took its stair key, which is
// floor state, not a bag item, and is gone with the floor (§E R32).
// WindowLeft is a Braziers seal's: the seconds left of the window its first
// lighting started, 0 while none runs (§E R34).
type SealComponent struct {
	Kind       SealKind
	Stage      int
	Broken     bool
	KeyCarried bool
	WindowLeft float64
}

func (s *SealComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeSeal
}

func NewSealComponent(kind SealKind, stage int) *SealComponent {
	return &SealComponent{Kind: kind, Stage: stage}
}

// SealPieceKind is what a seal piece is. FS-5FZ4J §I R46.
type SealPieceKind string

const (
	SealPieceLever       SealPieceKind = "lever"
	SealPiecePlate       SealPieceKind = "plate"
	SealPieceBlock       SealPieceKind = "block"
	SealPieceBrazier     SealPieceKind = "brazier"
	SealPieceStairKey    SealPieceKind = "stair_key"
	SealPieceBridgeLever SealPieceKind = "bridge_lever"
)

// Cell is a cell's column and row on the floor's grid.
type Cell struct {
	X, Y int
}

// CellRect is a rect of the floor's cells: X, Y its top-left cell, W x H
// cells. The zero rect holds no cell.
type CellRect struct {
	X, Y, W, H int
}

// SealPieceComponent is one piece of a seal. Seal is the seal entity it
// belongs to; Cell the floor cell it stands
// on. Glyph and Turn are a lever's: the glyph it bears and its 1-based place
// in the order. Active is a lever down, a plate held, a brazier lit, a bridge
// lowered; never set on the others. FS-5FZ4J §C R15-R16, §I R46.
type SealPieceComponent struct {
	Seal   uuid.UUID
	Kind   SealPieceKind
	Cell   Cell
	Glyph  string
	Turn   int
	Active bool
}

func (p *SealPieceComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeSealPiece
}

// LoreKind is what a lore piece is. Its values are the wire's seal piece
// kinds for it: a lore piece rides seal_pieces (FS-5FZ4J §I R46).
type LoreKind string

const (
	LoreMural  LoreKind = "mural"
	LoreShrine LoreKind = "shrine"
)

// LorePieceComponent is a lore piece: a mural (FS-5FZ4J §C R15) or a lore
// shrine (§F R39), read by an interact, a piece of no seal, waking nothing
// (CONTEXT.md "Seal piece"). Tells is the seal whose order a mural shows,
// uuid.Nil on a shrine; Cell is the floor cell it stands on.
type LorePieceComponent struct {
	Kind  LoreKind
	Tells uuid.UUID
	Cell  Cell
}

func (l *LorePieceComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeLorePiece
}

// AmbushComponent marks something whose first work wakes an ambush, a seal
// piece or a tripwire: Woken once it has, so it wakes at most one in its
// floor's life. FS-5FZ4J §B R14.
type AmbushComponent struct {
	Woken bool
}

func (a *AmbushComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeAmbush
}

// BarrierKind is what a barrier is. FS-5FZ4J §I R46.
type BarrierKind string

const (
	BarrierGate       BarrierKind = "gate"
	BarrierSecretDoor BarrierKind = "secret_door"
	BarrierPit        BarrierKind = "pit"
)

// BarrierComponent marks a floor barrier and the cells it covers, row by row.
// It stands beside a Door and an Openable, so the walk's wall index blocks
// bodies with it while it is shut, read live as any door's (FS-5FZ4J §A R4);
// whether it is open is the Openable's alone. It never carries an
// Interactable: the interaction system would flip it every tick.
type BarrierComponent struct {
	Kind  BarrierKind
	Cells []Cell
}

func (b *BarrierComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeBarrier
}

/*
StoneBlockComponent is a stone block's, beside its SealPieceComponent of kind
block: a cell-sized blocker a delver pushes one cell at a time (FS-5FZ4J §C
R19). Its place is its Transform, the block's centre, mid-slide while it
slides; the cell it stands on, or slides to, is its piece's Cell. Size is its
side, one cell's.

A push builds while one face is walked against along one axis: PushX, PushY is
its unit step and Pushed how far it has built, 0 to 1. Once it is built the
block's cell moves on, and it slides there from FromX, FromY over SlideFor
seconds, Slid of them gone. PushedBy is the delver whose push last moved it.

Home is the cell it was laid on and Room the plates room's cells it stands
in: a push never takes it out of Room, and left alone it drifts back to Home
(R19 as amended, ADR-0092). Still is the seconds since a push last moved it.
A block with the zero Room has no room to keep to and never drifts.
*/
type StoneBlockComponent struct {
	Size float64

	Home  Cell
	Room  CellRect
	Still float64

	PushX, PushY int
	Pushed       float64
	PushedBy     uuid.UUID

	Sliding        bool
	FromX, FromY   float64
	Slid, SlideFor float64
}

func (b *StoneBlockComponent) Type() ecs.ComponentType {
	return ecs.ComponentTypeStoneBlock
}
