---
id: I-X2F2H-11
status: done
implements: FS-X2F2H
blocked_by: [I-3QHQZ-9]
labels: []
title: "Tune FS-X2F2H: field level bands, Gentle Meadows 1-4 to 1-2, Forlorn Forest 4-9 to 8-12"
---
Tunes FS-X2F2H

Values only: FS-X2F2H R36 names the level bands as tuning constants beside the Spire's, each a
starting value, and no acceptance criterion changes. Sorted out of the FS-C8VM7 scoping session
(2026-11-14, "Field zones"). Owner's reason: the fields stay easy and fixed, the Meadows for
hanging out and future events, the Forest at 8-12 with elites (FS-3QHQZ §Change: Elites on the
Forest's trail). Waits on I-3QHQZ-9 only because both edit `forest_population_test.go`.

**Lane: game-server (game-service only).**

## Files owned

- `game-server/game-service/internal/game/monster_tuning.go`: `MeadowsMaxLevel` 4 → 2;
  `ForestMinLevel` 4 → 8, `ForestMaxLevel` 9 → 12. `MeadowsMinLevel` stays 1.
- Tests, only where a value hard-codes the old band:
  - `game-server/game-service/internal/game/meadows_map_test.go`: `TestGentleMeadows_IsTheEasyFieldEastOfTheHub` (`MaxLevel` 4 → 2, and its "levels 1–4" comment).
  - `game-server/game-service/internal/game/forest_population_test.go`: `TestForlornForest` literals (`4`, `9` → `8`, `12`); `TestFieldPlace_StandardElitesDefaultToRolled` queues a level draw of 2 on the Meadows and expects `MeadowsMinLevel+2`; `drawQueue.IntN` returns `v % n`, so over a 1-2 band it gives level 1 and the test fails: queue an in-band draw (1) and expect `MeadowsMinLevel+1`.
  - `game-server/game-service/internal/game/forest_chests_test.go`: the "six levels" comment in `TestForestChest_FirstOpenRollsAtABandItemLevel` (now five); the cases use the constants.
  - `game-server/game-service/internal/game/field_population_test.go`: the boar stat table's "level 4" rows are explicit levels, not band reads; move them to the band's ceiling only if a test asserts the band.
- `game-server/game-service/internal/game/meadows_map.go`: the "levels 1–4" doc comment.

Not touched: any game-client file (no band is shown on the client), `internal/matchmaker`,
`internal/match_queue`, any migration or HTTP contract, FS text (the FS is a ledger; its stated
values are starting values). Sibling FS-C8VM7 / FS-3103M / FS-BDRTJ work may also edit
`monster_tuning.go`: touch only the three band constants.

## What to Build

The two bands move. Everything downstream already reads the constants:

- A field monster's level is uniform in its place's band (FS-X2F2H R28), so Meadows boars are
  level 1-2 and Forest zombies and ghosts, trail and clearing elites alike, level 8-12.
- Item level follows the kill's level (FS-X2F2H R31), so Forest drops rise to item level 8-12
  and Meadows drops fall to 1-2. **Accepted at scoping.**
- A Forest clearing chest draws its item level from the Forest band (FS-3QHQZ R19): now 8-12.
- Kill XP follows the monster's level (FS-BDA7X): the Forest pays more, the Meadows less.

## Acceptance Criteria

- [ ] `MeadowsMinLevel` 1, `MeadowsMaxLevel` 2, `ForestMinLevel` 8, `ForestMaxLevel` 12.
- [ ] Over many seeded rolls, every Meadows monster is level 1 or 2 and both levels roll; every Forest monster is level 8-12 and each of the five levels rolls.
- [ ] A Forest clearing chest's first open rolls at an item level in 8-12, one draw over the band's five levels.
- [ ] FS-X2F2H's and FS-3QHQZ's acceptance criteria still pass with the new values (their "4–9" and "1–4" readings are the bands' starting values). `make test` (and `make lint`, `make check`) green in `game-server/game-service`.

## Blocked By

I-3QHQZ-9 (shared test file only).

## Spec Reference

FS-X2F2H §E Requirement 36 (the tunable), D15 (fixed band per field), Requirements 28, 31, 53;
FS-3QHQZ Requirements 9, 17, 19 (the Forest band readers).
