---
id: I-VHGE7-1
status: done
implements: FS-VHGE7
blocked_by: []
labels: [ready-for-agent]
title: "FS-VHGE7 slice 1: the blood demon spawns on run floors, drops boss loot and pays XP (game-service)"
---
Implements FS-VHGE7 §A (Requirements 1–14)

**Author: agent.** Server work under the owner's charter (2026-11-08): agents build this one.

## What to Build

A `blood_demon` boss that run floors roll and place, end to end: archetype, sheet, level,
per-floor odds, placement on open and dungeon floors, the boss loot row and its XP row.

1. `components.MonsterArchetypeBloodDemon = "blood_demon"` (a value on the existing string type).
2. `monsterSheets` row: name `Blood Demon`, HP 1600, damage 34, every other field the green
   demon's (R3). `BloodDemonLevelBonus = 3` and a `bloodDemonLevel` beside `demonLevel` (R4).
3. A per-floor chance table in `monster_tuning.go` (0.02 / 0.05 / 0.10). A floor past its end
   uses the last row (R6).
4. `rollBloodDemon` beside `rollDemon`: an independent draw, `Boss: true`, never elite. It runs
   after the green demon's roll and placement on both floor kinds (R5, R7, R8).
5. Open floors: `placeFarthest` with `area.valid` only. With no spot, a `slog.Warn` and a skip
   (R9).
6. Dungeon floors: `placeDungeonDemon` returns the room it used. The blood demon searches from the
   second-farthest room down, skipping the start room and the green demon's room, `area.valid`
   only, and warns and skips when nothing fits (R10).
7. `MonsterDrops[blood_demon] = BossMonsterDrop`, and `killExperienceBase[blood_demon] = 35`
   (R12, R13).
8. Update the `MonsterState.Archetype` comment in `internal/types/game.go` to list the new value.

## Acceptance Criteria

- [ ] The FS §Acceptance Criteria "Server" items about the blood demon: archetype + sheet + XP + drop rows; per-floor table rolls with seeded draws just under and at the chance; past-the-end row; level + boss + name; open-floor placement clear of delvers and of the green demon, skip with warning; dungeon placement never in the start or green demon's room, starting at second-farthest, skip with warning; no blood demon in fields or the hub; kill drops 2–3 boss items and pays 35-base boss XP.
- [ ] The green demon's roll, level and placement are unchanged: its existing tests pass untouched.
- [ ] Seeded population tests whose draw counts shift because of the extra roll are updated, and each shifted expectation is called out in the PR, never silently re-pinned.
- [ ] `go test ./...` and `golangci-lint run` pass in game-service.

## Files expected to touch

- `game-server/game-service/internal/components/monster.go`
- `game-server/game-service/internal/game/monster_tuning.go`
- `game-server/game-service/internal/game/monster_population.go`, `monster_population_test.go`
- `game-server/game-service/internal/game/dungeon_population.go`, `dungeon_population_test.go`
- `game-server/game-service/internal/game/loot_tuning.go`, `monster_drops_test.go`
- `game-server/game-service/internal/game/kill_experience_test.go`
- `game-server/game-service/internal/types/game.go` (comment only)

## Blocked By

None

## Spec Reference

FS-VHGE7 §A R1–14; User Stories 1, 2, 5–11, 22, 25; Edge States "Both demons on one floor",
"No spot for the blood demon", "Green demon skipped", "Dungeon with only two rooms", "Party still
connecting".

## TDD Approach

- RED: `TestRollBloodDemon` table: floor × draw → spawned or not, using a stub `populationRand`.
  Then `TestPlaceDungeonBloodDemon_NeverSharesTheDemonsRoom`.
- GREEN: the table, `rollBloodDemon`, and the room-reporting `placeDungeonDemon`.
