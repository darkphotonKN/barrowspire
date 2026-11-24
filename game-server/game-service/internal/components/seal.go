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

// HoldsGate is whether a seal of this kind keeps the stairs room's gate shut:
// every kind but the Chasm, whose chasm is its barrier. FS-5FZ4J §B R13.
func (k SealKind) HoldsGate() bool { return k != SealChasm }

// SealComponent is one seal of a floor. Stage is its 1-based place in the
// floor's chain (FS-5FZ4J §B R9). Broken is set once, for the whole party, and
// never cleared (R11). What breaks it is its kind's rule, read off its pieces.
type SealComponent struct {
	Kind   SealKind
	Stage  int
	Broken bool
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
	SealPieceMural       SealPieceKind = "mural"
	SealPieceShrine      SealPieceKind = "shrine"
)

// Cell is a cell's column and row on the floor's grid.
type Cell struct {
	X, Y int
}

// SealPieceComponent is one piece of a seal, or a lore piece beside it (a
// mural). Seal is the seal entity it belongs to; Cell the floor cell it stands
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
