package game

import "github.com/darkphotonKN/barrowspire-server/game-service/internal/components"

/*
	Dungeon encounters' tunables, in one place beside the other spawn rates
	(FS-4EC7Z §Requirements): how often a floor holds one, its kind forced in a
	local build, and the Lost Pilgrims' numbers.
*/

// EncounterFloorChance is the chance a sealed dungeon floor 2+ below the top
// holds an encounter; 1 forces one onto every such floor in a local build.
// FS-4EC7Z §A R1.
const EncounterFloorChance = 0.4

// ForcedEncounterKind, when set, is every such floor's encounter, in place of
// the draw and its chance, as ForcedSealKind forces a seal: a local build
// forces one by setting it here. Unset, the floor draws. FS-4EC7Z
// §Requirements.
const ForcedEncounterKind components.EncounterKind = ""

// EncounterKinds are the kinds an encounter is drawn from, uniformly
// (FS-4EC7Z §A R1).
var EncounterKinds = []components.EncounterKind{components.EncounterLostPilgrims, components.EncounterCaptives, components.EncounterCutthroats}

// The Lost Pilgrims: PilgrimCount pilgrims, each of PilgrimHealthFactor times
// a standard fodder monster's health at the floor's monster level, in the
// looks of PilgrimLooks by turn. FS-4EC7Z §B R6, §A R3, §H R36.
const (
	PilgrimCount        = 3
	PilgrimHealthFactor = 2.0
)

// PilgrimLooks are the pilgrims' art variants, one a pilgrim in turn.
var PilgrimLooks = []string{"pilgrim_a", "pilgrim_b", "pilgrim_c"}

// The plea and the wave: the first delver within PilgrimPleaCells cells of a
// pilgrim, or a talk, starts the plea; the wave comes PilgrimWaveDelay
// seconds later, PilgrimWaveBase + PilgrimWavePerDelver x the delvers in play
// then, fodder of the floor's pool and one brute when PilgrimWaveBruteFrom or
// more are in play. FS-4EC7Z §B R7.
const (
	PilgrimPleaCells     = 3.0
	PilgrimWaveDelay     = 5.0
	PilgrimWaveBase      = 2
	PilgrimWavePerDelver = 2
	PilgrimWaveBruteFrom = 3
)

// EncounterCorpseLifetime is how long a killed encounter NPC lies before it
// is removed, a monster's corpse's time. FS-4EC7Z §A R3.
const EncounterCorpseLifetime = MonsterCorpseLifetime

// Hired allies (FS-4EC7Z §C R9-R10): at most AllyCap a party; each keeps
// AllyFollowNearCells to AllyFollowFarCells cells from its leader and engages
// a monster within AllyEngageCells cells of itself.
const (
	AllyCap             = 3
	AllyFollowNearCells = 2.0
	AllyFollowFarCells  = 4.0
	AllyEngageCells     = 6.0
)

/*
allySheet is an encounter NPC's fighting sheet once it is a hired ally
(FS-4EC7Z §C R9), measured against a standard fodder monster at the floor's
monster level as a pilgrim's health is: HealthFactor times its health,
DamageFactor its hit and DefenseFactor its defense. AttackInterval is its
cadence in seconds, AttackRange its melee reach and MoveSpeed its pace, both
in px; a delver walks at 200, so an ally keeps up.
*/
type allySheet struct {
	HealthFactor   float64
	DamageFactor   float64
	DefenseFactor  float64
	AttackInterval float64
	AttackRange    float64
	MoveSpeed      float64
}

// AllySheets are the sheets of the kinds that become allies: a freed captive
// and a hired cutthroat (FS-4EC7Z §C R9, §D R13, R15). A pilgrim never does.
var AllySheets = map[components.EncounterNPCKind]allySheet{
	components.EncounterNPCCaptive: {
		HealthFactor: 3.0, DamageFactor: 1.5, DefenseFactor: 1.0,
		AttackInterval: 1.1, AttackRange: 50, MoveSpeed: 190,
	},
	components.EncounterNPCCutthroat: {
		HealthFactor: 3.0, DamageFactor: 1.8, DefenseFactor: 1.0,
		AttackInterval: 1.0, AttackRange: 50, MoveSpeed: 190,
	},
}

// The Captives (FS-4EC7Z §D R13): CaptiveCount captives in the looks of
// CaptiveLooks by turn, in a cage of CageHalfSize px a side's half; their
// key lies in another room or, at CageKeyOnEliteShare, rides on an elite.
const (
	CaptiveCount        = 2
	CageHalfSize        = 40.0
	CageKeyOnEliteShare = 0.5
)

// CaptiveLooks are the captives' art variants, one a captive in turn.
var CaptiveLooks = []string{"captive_a", "captive_b"}

// The Cutthroats (FS-4EC7Z §D R14): CutthroatCount Cutthroats in the looks of
// CutthroatLooks by turn, each with a hired Cutthroat's health; the first
// talk's parley draws their fate CutthroatParleyDelay seconds later, hostile
// at CutthroatHostileChance (a world's own copy, floorTuning, so a test or a
// local build forces either way with 1 or 0).
const (
	CutthroatCount         = 3
	CutthroatParleyDelay   = 3.0
	CutthroatHostileChance = 0.5
)

// CutthroatLooks are the Cutthroats' art variants, one a Cutthroat in turn;
// a turned one keeps its look as a monster (§F R24).
var CutthroatLooks = []string{"cutthroat_a", "cutthroat_b"}
