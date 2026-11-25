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
// (FS-4EC7Z §A R1). Only the Lost Pilgrims are built (I-4EC7Z-1); the Captives
// and the Cutthroats join with their slices.
var EncounterKinds = []components.EncounterKind{components.EncounterLostPilgrims}

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
