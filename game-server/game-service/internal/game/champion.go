package game

import (
	"math"
	"slices"

	"github.com/darkphotonKN/barrowspire-server/game-service/internal/components"
)

/*
	Champion bosses: the top floor of a height 3-9 run holds a variant the
	floor's pool left out, scaled to a boss and named from a lore list.
	FS-C8VM7 §D R26-R31.
*/

/**
* rollChampion is the top floor's champion (R26-R29): a variant unlocked at the
* pool's level tier and not in it, drawn uniformly, or from the pool when it holds
* every unlocked variant; a goblin in its rolled look. It stands at the old
* demon's level, a boss and never an elite, named "<Name> the <Epithet>".
**/
func rollChampion(rng populationRand, pool floorPool, partyLevel, floor int) MonsterConfig {
	left := slices.DeleteFunc(unlockedAt(pool.LevelTier), func(e rosterEntry) bool {
		return slices.ContainsFunc(pool.Members, func(m rosterEntry) bool { return m.Variant.Archetype == e.Variant.Archetype })
	})
	if len(left) == 0 {
		left = pool.Members
	}
	variant, _ := pick(rng, left)

	name := ChampionNames[rng.IntN(len(ChampionNames))] + " the " + ChampionEpithets[rng.IntN(len(ChampionEpithets))]
	return MonsterConfig{
		Archetype: variant.rollLook(rng),
		Level:     demonLevel(partyLevel, floor),
		Boss:      true,
		Champion:  true,
		Name:      name,
	}
}

// champion is what a champion makes of its variant's stats at its level: the
// Demon sheet's HP and damage at that level, its own defence and magic
// resistance × ChampionMitigationMultiplier (R28).
func (stats monsterStats) champion(level int) monsterStats {
	demon := monsterSheets[components.MonsterArchetypeDemon].statsAt(level)
	scale := func(v int) int { return int(math.Round(float64(v) * ChampionMitigationMultiplier)) }
	return monsterStats{
		HP:              demon.HP,
		Damage:          demon.Damage,
		Defense:         scale(stats.Defense),
		MagicResistance: scale(stats.MagicResistance),
	}
}
