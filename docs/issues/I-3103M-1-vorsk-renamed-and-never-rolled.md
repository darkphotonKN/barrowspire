---
id: I-3103M-1
status: done
implements: FS-3103M
blocked_by: []
labels: []
title: "FS-3103M slice 1: the Demon is Vorsk, and no floor below the top rolls it"
---
Implements FS-3103M §A

**Hotspot:** `monster_population.go` is also FS-C8VM7's (the champion rewrites `rollDemon`'s
top-floor branch). One writer at a time; rebase on whichever lands first. Never touch
`internal/matchmaker` or `internal/match_queue`. No migrations, no HTTP contract change, no kill or
match stats.

## Files expected

- `game-server/game-service/internal/game/monster_tuning.go` (`DemonChance` removed; the `demon` sheet's `Name` becomes "Vorsk")
- `game-server/game-service/internal/game/monster_population.go` (`rollDemon`: nothing below the top; doc comments that describe the rare roll)
- Tests: `monster_population_test.go`, `monster_roll_test.go`, `dungeon_population_test.go`, and any test naming `DemonChance` or the name "Demon"

## What to Build

The `demon` archetype's display name becomes "Vorsk" (R1); the archetype code stays `demon`
(charter default). `DemonChance` and its roll go (R2): `rollDemon` returns nothing on a floor that
is not the top. Leave the top-floor branch, `placeDemon`, `placeDungeonDemon` and `demonOddsOf` as
they are: FS-C8VM7's champion replaces the top floor's Demon (R3). Stats, moves, level rule and XP
unchanged (R4).

## Acceptance Criteria

- [ ] The `demon` sheet's name is "Vorsk"; a spawned `demon` reports `Name: "Vorsk"` in `MonsterState`; the archetype code is `demon`.
- [ ] `DemonChance` no longer exists.
- [ ] Over many seeded populations of floors 1-9 that are not the top, no `demon` is placed (dungeon and building floors).
- [ ] The top floor still gets whatever its branch gives today (until FS-C8VM7 lands); Daa'gon unchanged.
- [ ] `make test` (and `make lint`, `make check`) green in game-service.

## Blocked By

None. Cross-item: the top-floor half of "no run rolls Vorsk" lands with FS-C8VM7's champion-bosses
issue. Blocks I-3103M-5.

## Spec Reference

FS-3103M §A R1-R4; user stories 1, 26.

## TDD Approach

- RED: a seeded population of a non-top floor with a roll source that always returns 0 places no `demon`.
- GREEN: drop the `!topFloor` roll path and `DemonChance`.
