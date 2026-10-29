package game

import (
	"math"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
)

/*
	Monster tuning: every stat sheet and spawn rate in one place, so a developer
	can change a number, or force a monster, in a local build without hunting for
	it. FS-77AB6 §Requirements 19–22, 25. Every number is a starting value,
	expected to move in play.
*/

// Population.
const (
	// standard monsters per floor, a uniform integer in [min, max]
	MonsterCountMin = 8
	MonsterCountMax = 14

	// each standard monster is a troll with probability
	// base + perFloor × (floor − 1), capped
	TrollShareBase     = 0.25
	TrollSharePerFloor = 0.10
	TrollShareCap      = 0.60

	// monster level = party level + step × (floor − 1) ± spread, at least 1
	MonsterLevelPerFloor = 2
	MonsterLevelSpread   = 1

	// no monster spawns closer than this to any delver, in px
	MonsterDelverExclusion = 350.0
	// minimum centre-to-centre gap between two monsters, in px. Twice the body
	// radius would merely stop them overlapping; this is wide enough that no two
	// share a MovementSystem spatial-hash cell (2 × PlayerRadius square), which
	// keeps one entity per cell (FS-QG1HR D4) from dropping a monster out of the
	// simulation.
	MonsterSpacing = 60.0
	// random positions tried per monster before it is skipped
	MonsterPlacementAttempts = 200
)

// Elites: promoted standard monsters, stats-only. FS-77AB6 §Requirements 23.
const (
	// each standard monster is an elite with probability
	// base + perFloor × (floor − 1), capped
	EliteChanceBase     = 0.03
	EliteChancePerFloor = 0.02
	EliteChanceCap      = 0.25

	// over its base at its level; every other stat is unchanged
	EliteHPMultiplier     = 2.5
	EliteDamageMultiplier = 1.5
)

// ElitePrefixes is the authored list an elite's name prefix is drawn from, as
// in "Dread Ghoul".
var ElitePrefixes = []string{"Dread", "Grave-sworn", "Hollow", "Barrow-cursed"}

/*
	Field tuning: the field worlds' numbers, beside the Spire's they derive from.
	FS-X2F2H §Requirements 26–29, 36–37 (D14–D16, D24, D26). Every number is a
	starting value, carried on each field place.
*/

// Field monsters.
const (
	// a field monster's level stats over the Spire's at the same level; an
	// elite takes the Spire's elite multipliers on top
	FieldStatFactor = 0.75

	// a spawn point rolls its next monster this long after its last one died,
	// in seconds
	FieldRespawnDelay = 45.0
	// how long a due respawn waits, in seconds, before trying again while a
	// player in play stands within MonsterDelverExclusion of the point
	FieldRespawnRetry = 1.0

	// the Gentle Meadows' level band, inclusive
	MeadowsMinLevel = 1
	MeadowsMaxLevel = 4
	// the Gentle Meadows' drop chance over the Spire's row (fieldDrops)
	MeadowsDropFactor = 0.35

	// the Forlorn Forest's level band, inclusive, and its drop chance over
	// the Spire's (FS-X2F2H D15, D17)
	ForestMinLevel   = 4
	ForestMaxLevel   = 9
	ForestDropFactor = 0.5
)

// Field loot. FS-X2F2H §Requirements 33–34 (D13, D25).
const (
	// a field drop pile is the killer's alone this long after it lands, in
	// seconds; then anyone's
	FieldLootWindow = 30.0
	// a field drop pile is removed this long after it lands, in seconds, with
	// whatever it still holds
	FieldDropPileLifetime = 120.0
)

// FieldDropsAs names, for each field creature, the Spire archetype whose
// MonsterDrops row it drops as: a reference, never a copied chance. Any elite
// drops as EliteMonsterDrop. A creature with no entry drops nothing.
// FS-X2F2H §Requirements 31 (D17, D23).
var FieldDropsAs = map[components.MonsterArchetype]components.MonsterArchetype{
	// fodder drops as Spire fodder (D23)
	components.MonsterArchetypeBoar: components.MonsterArchetypeGhoul,
	// the Forest's dead: FS-3QHQZ names no row, so they drop as the boar does
	components.MonsterArchetypeZombie: components.MonsterArchetypeGhoul,
	components.MonsterArchetypeGhost:  components.MonsterArchetypeGhoul,
}

// The Forlorn Forest's population. FS-3QHQZ §Requirements 15–17.
const (
	// standard (trail) spawn points, a uniform integer in [min, max]
	ForestSpawnPointsMin = 18
	ForestSpawnPointsMax = 24
	// no standard spawn point stands closer than this to the entrance, in px
	ForestEntranceExclusion = 400.0
	// each spawn and respawn is a ghost with this probability, else a zombie
	ForestGhostShare = 1.0 / 12
	// a side dead end's clearing holds a chest with this probability, else an
	// elite; the main trail's always holds an elite
	ForestChestShare = 0.5
	// a clearing chest restocks this long after it was first opened, in
	// seconds (FS-3QHQZ §Requirements 19, D20)
	ForestChestRestockDelay = 300.0
)

// FieldElitePrefixes is the authored list a field elite's name prefix is drawn
// from, as in "Scarred Boar", in place of the barrow ElitePrefixes.
var FieldElitePrefixes = []string{"Old", "Scarred", "Great"}

// The demon boss. FS-77AB6 §Requirements 21, 24.
const (
	// chance of a demon on a floor that is not the top one; the top floor
	// always has exactly one
	DemonChance = 0.01
	// demon level = party level + floor offset + bonus, with no spread
	DemonLevelBonus = 2
	// random positions sampled for the demon; it takes the valid one farthest
	// from the delvers
	DemonPlacementSamples = 200
)

// MonsterCorpseLifetime is how long, in seconds, a dead monster lies broadcast as
// dead, so every client can play its death, before it is removed. FS-77AB6
// §Requirements 30.
const MonsterCorpseLifetime = 4.0

// The level curve. Speeds, radii and timings do not scale.
const (
	// HP and damage × (1 + growth × (level − 1))
	MonsterPowerGrowth = 0.12
	// defense and magic resistance × (1 + growth × (level − 1))
	MonsterMitigationGrowth = 0.05
)

// monsterSheet is an archetype at level 1.
type monsterSheet struct {
	Name            string
	HP              int
	Damage          int
	AttackInterval  float64 // s
	WindUp          float64 // s
	AttackRange     float64 // px
	MoveSpeed       float64 // px/s; delvers move at 200 and outrun every archetype
	Defense         int
	MagicResistance int
	AggroRadius     float64 // px
	LeashRadius     float64 // px
}

var monsterSheets = map[components.MonsterArchetype]monsterSheet{
	components.MonsterArchetypeGhoul: {
		Name: "Ghoul", HP: 40, Damage: 6,
		AttackInterval: 1.0, WindUp: 0.35, AttackRange: 45, MoveSpeed: 150,
		Defense: 2, MagicResistance: 0,
		AggroRadius: 260, LeashRadius: 520,
	},
	components.MonsterArchetypeTroll: {
		Name: "Troll", HP: 140, Damage: 16,
		AttackInterval: 2.0, WindUp: 0.7, AttackRange: 60, MoveSpeed: 90,
		Defense: 10, MagicResistance: 4,
		AggroRadius: 220, LeashRadius: 480,
	},
	components.MonsterArchetypeDemon: {
		Name: "Demon", HP: 1200, Damage: 28,
		AttackInterval: 1.6, WindUp: 0.8, AttackRange: 75, MoveSpeed: 120,
		Defense: 15, MagicResistance: 15,
		AggroRadius: 320, LeashRadius: 700,
	},
	// field wildlife: a lowered-head charge (FS-X2F2H §Requirements 37)
	components.MonsterArchetypeBoar: {
		Name: "Boar", HP: 36, Damage: 5,
		AttackInterval: 1.2, WindUp: 0.45, AttackRange: 45, MoveSpeed: 140,
		Defense: 2, MagicResistance: 0,
		AggroRadius: 200, LeashRadius: 450,
	},
	// the Forest's shambling default (FS-3QHQZ §Requirements 18)
	components.MonsterArchetypeZombie: {
		Name: "Zombie", HP: 70, Damage: 9,
		AttackInterval: 1.4, WindUp: 0.5, AttackRange: 45, MoveSpeed: 100,
		Defense: 5, MagicResistance: 1,
		AggroRadius: 240, LeashRadius: 480,
	},
	// the Forest's rare drifter: faster and frailer than the zombie
	components.MonsterArchetypeGhost: {
		Name: "Ghost", HP: 30, Damage: 8,
		AttackInterval: 0.9, WindUp: 0.3, AttackRange: 50, MoveSpeed: 175,
		Defense: 0, MagicResistance: 8,
		AggroRadius: 300, LeashRadius: 560,
	},
}

// killExperienceBase is what killing a level-1 monster of an archetype is worth,
// before its level and its multiplier. A new archetype adds a row; one without
// a row is worth nothing. FS-BDA7X §Requirements 11.
var killExperienceBase = map[components.MonsterArchetype]int{
	components.MonsterArchetypeGhoul:  10,
	components.MonsterArchetypeTroll:  25,
	components.MonsterArchetypeDemon:  25,
	components.MonsterArchetypeBoar:   8,
	components.MonsterArchetypeZombie: 15,
	components.MonsterArchetypeGhost:  20,
}

// Kill experience scaling. FS-BDA7X §Requirements 10.
const (
	// base × (1 + growth × (level − 1))
	KillExperienceLevelGrowth = 0.15
	// over a standard monster's
	EliteExperienceMultiplier = 3
	BossExperienceMultiplier  = 10
)

// monsterStats is what an archetype's level makes of its sheet.
type monsterStats struct {
	HP, Damage, Defense, MagicResistance int
}

// statsAt scales a sheet to a level along the level curve.
func (sheet monsterSheet) statsAt(level int) monsterStats {
	steps := float64(max(level, 1) - 1)
	power := 1 + MonsterPowerGrowth*steps
	mitigation := 1 + MonsterMitigationGrowth*steps

	return monsterStats{
		HP:              int(math.Round(float64(sheet.HP) * power)),
		Damage:          int(math.Round(float64(sheet.Damage) * power)),
		Defense:         int(math.Round(float64(sheet.Defense) * mitigation)),
		MagicResistance: int(math.Round(float64(sheet.MagicResistance) * mitigation)),
	}
}

// elite is what promotion makes of a monster's stats at its level.
func (stats monsterStats) elite() monsterStats {
	stats.HP = int(math.Round(float64(stats.HP) * EliteHPMultiplier))
	stats.Damage = int(math.Round(float64(stats.Damage) * EliteDamageMultiplier))
	return stats
}

/**
* scaled is a field's factor applied to a monster's level stats: each × factor,
* rounded, with HP and damage at least 1. The one place a field factor touches
* stats; a field never keeps a second sheet. FS-X2F2H §Requirements 29.
**/
func (stats monsterStats) scaled(factor float64) monsterStats {
	scale := func(v int) int { return int(math.Round(float64(v) * factor)) }
	return monsterStats{
		HP:              max(scale(stats.HP), 1),
		Damage:          max(scale(stats.Damage), 1),
		Defense:         scale(stats.Defense),
		MagicResistance: scale(stats.MagicResistance),
	}
}

// eliteChance is the chance a standard monster on this floor is an elite.
func eliteChance(floor int) float64 {
	return math.Min(EliteChanceBase+EliteChancePerFloor*float64(floor-1), EliteChanceCap)
}

// trollShare is the chance a standard monster on this floor is a troll.
func trollShare(floor int) float64 {
	return math.Min(TrollShareBase+TrollSharePerFloor*float64(floor-1), TrollShareCap)
}

// demonLevel is the demon's level: the party's, plus the floor's offset, plus
// its bonus. It has no spread.
func demonLevel(partyLevel, floor int) int {
	return max(partyLevel+MonsterLevelPerFloor*(floor-1)+DemonLevelBonus, 1)
}
