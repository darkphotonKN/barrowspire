package game

import "github.com/darkphotonKN/barrowspire-server/game-service/internal/components"

/*
	Sealed floors' tunables, in one place (FS-5FZ4J §Requirements): the seal
	kind a build is forced to, the Lever Order's lever counts and glyphs, an
	ambush's size and a trap's hit factors.
*/

// ForcedSealKind, when set, is every sealed floor's seal kind in place of the
// draw, as TomeRunChance lets a developer force a tome (FS-5FZ4J
// §Requirements, FS-3103M R5). Lever Order, Weighted Plates and the Hidden Key
// are built so far, and the draw is forced to Lever Order (tests force the
// others); the per-floor draw table and the chain land with the other kinds
// (§B R9).
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

// Hidden rooms a floor rolls, drawn uniformly from 0 to its band's max: none
// on floor 1, up to HiddenRoomsMidMax on floors up to HiddenRoomsMidFloorsMax,
// up to HiddenRoomsHighMax above. On top of them, the Hidden Key's room and
// the hallowed altar's when it is placed hidden. FS-5FZ4J §F R35.
const (
	HiddenRoomsMidFloorsMax = 5
	HiddenRoomsMidMax       = 1
	HiddenRoomsHighMax      = 2
)

// HiddenChestShare is the share of rolled hidden rooms that hold a better
// chest; the rest hold a lore shrine. FS-5FZ4J §F R39.
const HiddenChestShare = 0.6

// BetterChestRaritySteps is how many rarity steps up a better chest's
// contents roll from a chest's, capped at the highest a chest rolls.
// FS-5FZ4J §F R39.
const BetterChestRaritySteps = 1

// DetectionRadius is how near, in px, a delver's body centre comes to a
// secret door's or a trap's cell centre to detect it: 2 cells of 80 px.
// FS-5FZ4J §F R38, §D R30.
const DetectionRadius = 160.0

// SearchDuration is the seconds a search of a secret door takes, on the
// FS-MQYEX timed-open rules. FS-5FZ4J §F R38.
const SearchDuration = 2.0

// A floor holds min(TrapCountBase + floor(depth / TrapCountEvery),
// TrapCountMax) traps: 3 on floor 1, 8 from floor 10. FS-5FZ4J §D R23.
const (
	TrapCountBase  = 3
	TrapCountEvery = 2
	TrapCountMax   = 8
)

// A trap stands more than TrapStartClearCells cells from the start room, so
// from every one of the party's start spots, and at least TrapSpacingCells
// cells from every other trap. FS-5FZ4J §D R23.
const (
	TrapStartClearCells = 2
	TrapSpacingCells    = 3
)

// TrapRearmAfter is the seconds a fired spike plate, dart wall or fire jet
// takes to re-arm. FS-5FZ4J §D R25.
const TrapRearmAfter = 10.0

// A gas vent's cloud reaches GasVentRadius px, 2 cells, from its centre and
// puffs every GasVentPuffEvery seconds while anyone stays in it. FS-5FZ4J §D
// R28.
const (
	GasVentRadius    = 160.0
	GasVentPuffEvery = 6.0
)

// Poison takes PoisonPercentPerSecond of a delver's max health a second for
// PoisonDuration seconds. FS-5FZ4J §D R29.
const (
	PoisonDuration         = 60.0
	PoisonPercentPerSecond = 1.0
)
