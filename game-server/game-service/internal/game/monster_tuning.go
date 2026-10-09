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
}

// killExperienceBase is what killing a level-1 monster of an archetype is worth,
// before its level and its multiplier. A new archetype adds a row; one without
// a row is worth nothing. FS-BDA7X §Requirements 11.
var killExperienceBase = map[components.MonsterArchetype]int{
	components.MonsterArchetypeGhoul: 10,
	components.MonsterArchetypeTroll: 25,
	components.MonsterArchetypeDemon: 25,
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
