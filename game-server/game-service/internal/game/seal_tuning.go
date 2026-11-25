package game

import "github.com/darkphotonKN/barrowspire-server/game-service/internal/components"

/*
	Sealed floors' tunables, in one place (FS-5FZ4J §Requirements): the seal
	kind a build is forced to, the Lever Order's lever counts and glyphs, an
	ambush's size, a trap's hit factors, and the respites' odds and numbers
	(the fountain, the hallowed altar and the Blessing).
*/

// ForcedSealKind, when set, is every sealed floor's one seal in place of the
// draw, as TomeRunChance lets a developer force a tome (FS-5FZ4J
// §Requirements, FS-3103M R5). Unset, the floor draws (§B R9). A forced Chasm
// is never redrawn: a layout whose stairs room cannot hold it fails, and the
// floor's next seed is tried. A local build forces one by setting it here.
const ForcedSealKind components.SealKind = ""

/*
floorTuning is a world's own copy of the floor build's overridable tunables:
the forced seal kind, the two-body kinds and the respites' and merchant's odds.
newSession starts every world from defaultFloorTuning, the constants here, and
a test overrides them on its own world (withTuning), so no tunable is mutable
state shared by every world (game-service CLAUDE.md).
*/
type floorTuning struct {
	forcedSealKind components.SealKind
	// twoBodyKinds are the kinds that need two bodies at once: none rolls
	// when one delver is alive at the floor's build (FS-5FZ4J §B R10,
	// ADR-0092). No v1 kind does, so the default is empty; a test marks one
	// on its own world to hold the rule.
	twoBodyKinds             map[components.SealKind]bool
	fountainFloorChance      float64
	hallowedAltarRunChance   float64
	hallowedAltarHiddenShare float64
	merchantFloorChance      float64
	merchantTomeChance       float64
}

// defaultFloorTuning is the floor build's tunables as this file sets them.
func defaultFloorTuning() floorTuning {
	return floorTuning{
		forcedSealKind:           ForcedSealKind,
		twoBodyKinds:             map[components.SealKind]bool{},
		fountainFloorChance:      FountainFloorChance,
		hallowedAltarRunChance:   HallowedAltarRunChance,
		hallowedAltarHiddenShare: HallowedAltarHiddenShare,
		merchantFloorChance:      MerchantFloorChance,
		merchantTomeChance:       MerchantTomeChance,
	}
}

// The seal draw's floor bands: one seal from sealBandLow on floors up to
// SealLowFloorsMax, one from all five up to SealMidFloorsMax, two chained
// above. FS-5FZ4J §B R9.
const (
	SealLowFloorsMax = 3
	SealMidFloorsMax = 7
)

// The seal draw's sets, by band and place in the chain. FS-5FZ4J §B R9.
var (
	sealBandLow    = []components.SealKind{components.SealLeverOrder, components.SealWeightedPlates, components.SealHiddenKey}
	sealBandAll    = []components.SealKind{components.SealLeverOrder, components.SealWeightedPlates, components.SealHiddenKey, components.SealChasm, components.SealBraziers}
	sealChainFirst = []components.SealKind{components.SealLeverOrder, components.SealWeightedPlates, components.SealHiddenKey, components.SealBraziers}
)

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

// A stone block left alone drifts home: off its home cell, on no plate,
// unmoved by a push for BlockDriftAfter seconds and with no delver within
// BlockDriftClearCells cells of it, it slides back to the cell it was laid on
// at the push speed. FS-5FZ4J §C R19 as amended (ADR-0092).
const (
	BlockDriftAfter      = 20.0
	BlockDriftClearCells = 2.0
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

// Braziers: BrazierCount braziers, each in a room of its own; the window the
// first lighting starts is BrazierWindow seconds, BrazierWindowSolo when one
// delver is in play at that moment. FS-5FZ4J §E R34.
const (
	BrazierCount      = 3
	BrazierWindow     = 60.0
	BrazierWindowSolo = 90.0
)

// MerchantFloorChance is the chance a floor 2+ below the top holds the
// wandering merchant, drawn after its fountain; 1 forces one onto every such
// floor in a local build. MerchantTomeChance is the chance a merchant offers
// the Tome of Filth, when the run has no tome plan and a floor above his can
// hold the altar. FS-9JV5K §A R1, §E R18.
const (
	MerchantFloorChance = 0.33
	MerchantTomeChance  = 0.10
)

// A merchant's wares, their prices in gold and the stock each is rolled with.
// FS-9JV5K §A R3.
const (
	MerchantPotionPrice   int64 = 60
	MerchantPotionStock         = 3
	MerchantAntidotePrice int64 = 40
	MerchantAntidoteStock       = 3
	MerchantTomePrice     int64 = 1500
	MerchantTomeStock           = 1
)

// FountainFloorChance is the chance a floor 2+ below the top holds a healing
// fountain, drawn with its seals; 1 forces one onto every such floor in a
// local build. FS-5FZ4J §G R40.
const FountainFloorChance = 0.5

// A fountain heals each delver in play within FountainRadius px, 2 cells of
// 80 px, of its centre FountainPercentPerSecond of their max health a second,
// from a pool of FountainPoolPercent of the highest max health among the
// delvers in play at the floor's build. FS-5FZ4J §G R41.
const (
	FountainRadius           = 160.0
	FountainPercentPerSecond = 4.0
	FountainPoolPercent      = 150.0
)

// HallowedAltarRunChance is the chance a run holds a hallowed altar, rolled
// once at its creation; 1 forces one into every run in a local build.
// HallowedAltarHiddenShare is the share of those whose altar stands in a
// hidden room of its floor. FS-5FZ4J §G R42.
const (
	HallowedAltarRunChance   = 0.3
	HallowedAltarHiddenShare = 0.5
)

// PrayDuration is the seconds a prayer at the hallowed altar takes, on the
// FS-MQYEX timed-open rules. FS-5FZ4J §G R43.
const PrayDuration = 2.0

// The Blessing: a blessed delver's kills roll their drop chance times
// BlessingDropFactor, and their class resource regen rates, the passive
// tree's bonus applied, are multiplied by 1 + BlessingRegenPercent / 100.
// FS-5FZ4J §G R44.
const (
	BlessingDropFactor   = 1.10
	BlessingRegenPercent = 5.0
)
