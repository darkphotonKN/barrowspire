---
id: I-C8VM7-5
status: done
implements: FS-C8VM7
blocked_by: [I-C8VM7-4]
labels: []
title: "FS-C8VM7 slice 5: a champion holds the top floor of a height 3-9 run"
---
Implements FS-C8VM7 §D (R26-R31)

**Type:** AFK. **Hotspot:** `monster_population.go` (`rollDemon`'s top-floor branch),
`dungeon_population.go`, `monster_tuning.go`. FS-3103M's slice removing `DemonChance` edits
`rollDemon` too: this slice replaces only the **top-floor** demon; leave the non-top-floor
demon roll for FS-3103M. Whichever lands second rebases.

## Files expected to touch

- `game-server/game-service/internal/game/champion.go` (new: choosing the variant left out of the pool, R26; its config and name, R28-R29)
- `game-server/game-service/internal/game/monster_tuning.go` (`ChampionMitigationMultiplier` 1.5; `ChampionNames`, `ChampionEpithets`)
- `game-server/game-service/internal/game/monster_population.go` (the top floor of a height 3-9 run places a champion where the demon stood; Daa'gon and the blood demon unchanged)
- `game-server/game-service/internal/game/factory.go` (`MonsterConfig` champion fields: HP and damage from the Demon sheet at its level, mitigation × 1.5)
- `game-server/game-service/internal/components/monster.go` (a `Champion` mark for the kill record)
- `game-server/game-service/internal/systems/combat.go` (`recordKill` carries the mark) and `internal/game/kill_experience.go` (a champion pays the Demon's base, R31)
- Tests: `internal/game/champion_test.go` (new), `monster_population_test.go`, `kill_experience_test.go`, `monster_drops_test.go`

## What to Build

- R26: on the top floor of a height 3-9 run, a champion: a variant unlocked at the floor's tier
  and not in its pool, uniform; from the pool when none is left (tier 1). Height 10 keeps Daa'gon.
- R27: a boss, never elite, placed as the guaranteed demon was (farthest room, relaxed retry),
  outside the floor's total, `boss: true` on the wire.
- R28: level = party + floor offset + 2; HP and damage the Demon sheet's at that level; defence
  and MR the variant's × 1.5; everything else the variant's, its ability at champion damage.
- R29: name "<Name> the <Epithet>" from the two lists in R29.
- R30: the blood demon still rolls on the top floor, never in the champion's room; none beside Daa'gon.
- R31: boss drop row; experience from the Demon's base (25) × the boss multiplier.

## Acceptance Criteria

- [ ] A height 3-9 top floor holds exactly one champion and no Green Demon; it is unlocked at the floor's tier, not in the pool (from the pool at tier 1), boss, not elite, with R28's numbers and an R29 name.
- [ ] A height-10 top floor holds Daa'gon and no champion.
- [ ] The blood demon still rolls on a champion's floor and never stands in the champion's room.
- [ ] A champion kill rolls `BossMonsterDrop` and pays the Demon's base × the boss multiplier at its level.
- [ ] No champion name or epithet contains an elite-prefix word.
- [ ] A champion that finds no spot is retried relaxed, then skipped with an error log.
- [ ] `make test` and `golangci-lint run` pass in game-service.

## Bounds

Never touch `internal/matchmaker` or `internal/match_queue`. No migrations, no HTTP contract
change, no kill or match stats (the champion mark is in-process only). Fabled rules are FS-3103M's.

## Blocked By

I-C8VM7-4

## Spec Reference

FS-C8VM7 §D R26-R31; §Edge States (champion placement, champion of an area family, champion goblin); user stories 16-20; acceptance criteria "Server" 18-20.

## TDD Approach

- RED: a seeded height-4 run's top floor holds one boss whose archetype is a tier variant outside the pool, named "<Name> the <Epithet>", with the Demon's HP at its level.
- GREEN: `champion.go`, then the top-floor branch, then the kill's experience.
