package game

import "github.com/darkphotonKN/barrowspire-server/game-service/internal/components"

/*
	Sealed floors' tunables, in one place (FS-5FZ4J §Requirements): the seal
	kind a build is forced to, the Lever Order's lever counts and glyphs, an
	ambush's size and a trap's hit factors.
*/

// ForcedSealKind, when set, is every sealed floor's seal kind in place of the
// draw, as TomeRunChance lets a developer force a tome (FS-5FZ4J
// §Requirements, FS-3103M R5). Lever Order and Weighted Plates are built so
// far, and the draw is forced to Lever Order (a test forces Weighted Plates);
// the per-floor draw table and the chain land with the other kinds (§B R9).
var ForcedSealKind = components.SealLeverOrder

// Lever Order's levers: LeverCountLow on floors up to LeverLowFloorsMax, else
// LeverCountMin..LeverCountMax drawn uniformly. FS-5FZ4J §C R15.
const (
	LeverLowFloorsMax = 3
	LeverCountLow     = 3
	LeverCountMin     = 3
	LeverCountMax     = 4
)

// LeverGlyphs are the glyphs a floor's levers bear, drawn without repeats.
// FS-5FZ4J §C R15.
var LeverGlyphs = []string{"crow", "key", "flame", "eye", "serpent", "moon"}

// Weighted Plates' plates: PlateCountLow on floors up to PlateLowFloorsMax,
// else PlateCountMin..PlateCountMax drawn uniformly, and as many stone blocks
// as plates. FS-5FZ4J §C R17.
const (
	PlateLowFloorsMax = 3
	PlateCountLow     = 2
	PlateCountMin     = 2
	PlateCountMax     = 3
)

// A Weighted Plates room is at least PlateRoomLong x PlateRoomShort cells,
// either way round. FS-5FZ4J §C R17.
const (
	PlateRoomLong  = 6
	PlateRoomShort = 5
)

// PlatePlacementDraws is how many placements of its plates and blocks a room
// is drawn before it is passed over for another. FS-5FZ4J §C R20.
const PlatePlacementDraws = 40

// An ambush is AmbushSizeMin..AmbushSizeMax monsters, drawn uniformly.
// FS-5FZ4J §B R14.
const (
	AmbushSizeMin = 2
	AmbushSizeMax = 4
)

// A trap's hit is a standard fodder monster's base hit at the floor's monster
// level times its kind's factor. A wrong lever's dart volley is one dart wall
// hit. FS-5FZ4J §D R26, §C R16.
const (
	TrapFactorSpikePlate = 1.0
	TrapFactorDartWall   = 0.8
	TrapFactorFireJet    = 1.5
)

// standardFodder is the monster a trap's hit is measured against: the first
// fodder family's first variant (FS-5FZ4J §D R26).
const standardFodder = components.MonsterArchetypeGhoul
