---
id: I-M8CSE-6
status: done
implements: FS-M8CSE
blocked_by: [I-M8CSE-5]
labels: [ready-for-agent]
title: "FS-M8CSE slice 6: Daa'gon guards the Master Spire's top floor"
---
Implements FS-M8CSE §E, §H

**Hotspot:** `monster_tuning.go`, `loot_tuning.go`, `monster_population.go`, one writer at a time.

## Files owned

- `game-server/game-service/internal/components/monster.go`
- `game-server/game-service/internal/game/monster_tuning.go` (sheet, XP row, level bonus)
- `game-server/game-service/internal/game/loot_tuning.go` (`MonsterDrops` row: `BossMonsterDrop`)
- `game-server/game-service/internal/game/monster_population.go` (`rollDemon`, `rollBloodDemon`'s caller, both floor kinds)
- Tests: `internal/game/monster_population_test.go`, `monster_drops_test.go`, `kill_experience_test.go`, `demon_moves_test.go`
- `game-client/src/types/gameState.ts`
- `game-client/src/render/art/sceneArt.ts`, `sceneArt.test.ts` (the pin at `:101`)
- `game-client/src/render/creatures/monsters.ts`, `monsters.test.ts`

## What to Build

On a height-10 run's top floor, Daa'gon replaces the Demon and no Blood Demon rolls (R24). Archetype
`daagon` (R21), 2200 HP, 45 damage, level = party + offset + 5, the Blood Demon's sheet otherwise, its
demon moves, boss row, XP base 50 (R25, R26, charter default). Heights 3-9 and floors 1-9 of a Master
Spire are unchanged (R23, R24, R27).

Client: a second `ON_DEMAND_ART` row on `blood_demon` with the same stand-in (R41, charter default);
a `MONSTER_LOOKS` row drawing `creature_blood_demon_base` at the boss tier; and the landed callback
redresses every archetype on the group (R42). No Master Spire card (R10, charter default).

## Acceptance Criteria

- [ ] Height 10: exactly one Daa'gon on floor 10, no Demon, no Blood Demon, on a dungeon and on a fallback floor. Heights 3-9: one Demon on the top floor.
- [ ] Daa'gon's stats, level and XP are as R25-R26.
- [ ] `onDemandFor("daagon")` is the `blood_demon` group with the Blood Demon's stand-in; the coverage test passes.
- [ ] A group landing while a Blood Demon and a Daa'gon are both stand-ins redresses both.
- [ ] `go test ./...` in game-service and `npm test` in game-client pass.

## Blocked By

I-M8CSE-5

## Spec Reference

FS-M8CSE §E R23-R27; §H R41-R42; user stories 15, 16, 25, 26.

## TDD Approach

- RED: a height-10 top-floor population holds one Daa'gon and no other boss.
- GREEN: the Master Spire check where the demon and blood demon are rolled.
