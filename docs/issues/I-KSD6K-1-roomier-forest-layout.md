---
id: I-KSD6K-1
status: done
implements: FS-KSD6K
blocked_by: []
labels: [ready-for-agent]
title: "FS-KSD6K slice 1: the Forest generates at 39 x 25 cells with 3-cell trails (game-service level generation)"
---
Implements FS-KSD6K §A (Requirements 1–7), §Supersession

**Author: agent.** Server tuning only. No proto change; never touch `internal/matchmaker` or
`internal/match_queue`; start no backend service (tests only).

## What to Build

The Forlorn Forest's generator parameters grow to the roomier size, and everything that depends
on the map size is re-checked at it:

1. `levelgen.ForestParams` (`internal/levelgen/forest.go`): 39 x 25 cells of 80 px, `TrailWidth`
   3, and the starting values of R3 (`Branches` 4–7, `BranchSteps` 3–6, `ClearingRadius` 3,
   others as today). Tune until the 1 000-seed property test passes; set `WallBudget` to the
   logged max wall rects plus at least 20% headroom. Update the doc comment (it cites the old
   size and FS-3QHQZ R12; cite FS-KSD6K R1–R3).
2. `constants.ForestMapWidth/Height` (`common/constants/game.go`) become 3120/2000; update the
   comment above them.
3. `TestGenerate_ForestParams_EverySeedValid` also logs the mean open share of the map (R5).
4. Regenerate `testdata/forest-20261029.golden` with `-update`; the new picture is in the diff.
5. Re-check size-dependent placement (R6): the arrival point over 1 000 seeds with the 3-cell
   mouth (tune `forestArrivalInset` only if the test fails), entrance on the east edge, elite and
   chest clearing assignment unchanged.
6. Tests that pin the old size or need a property of the old params move with them: the
   `forest_map_test.go` size asserts, `forest_boot_test.go`, and
   `TestGenerate_FirstAttemptFails_RetriesDeterministically` (give it its own params if
   `ForestParams` no longer produces a first-attempt failure in seeds 0..99).

Spawn point counts and spacing are **not** this slice (I-KSD6K-2). If the 300-seed
`TestForestLayout_SpawnPoints` fails here only because of the bigger map, note it and leave the
population values to I-KSD6K-2; do not change `ForestSpawnPoints*` or `MonsterSpacing` here.

## Acceptance Criteria

- [x] `ForestParams` is 39 x 25 x 80 px, `TrailWidth` 3; `ForestParams.Validate()` and `TestForestParams_TrailFitsTwoBodiesSideBySide` pass.
- [x] `constants.ForestMapWidth/Height` are 3120/2000 and the boot test asserts the built Forest's size equals them.
- [x] `TestGenerate_ForestParams_EverySeedValid` passes over 1 000 seeds and logs max wall rects, retries and mean open share; `WallBudget` is >= 1.2 x the logged max.
- [x] The golden ASCII is regenerated and shows a branching-trail forest with clearings, not open ground.
- [x] Over 1 000 seeds the arrival point is on open ground, clear of walls by `PlayerRadius`, beyond the gate's range; the entrance is on the east edge.
- [x] The retry and too-small-map generator tests still exercise what they claim.
- [x] No `.proto`, generated code, matchmaker, match_queue or Meadows file changes.
- [x] `go test ./...` and lint in game-service: no new failures versus the branch point.

## Files expected to touch

- `game-server/game-service/internal/levelgen/forest.go`
- `game-server/game-service/internal/levelgen/generate_test.go`
- `game-server/game-service/internal/levelgen/testdata/forest-20261029.golden`
- `game-server/game-service/common/constants/game.go`
- `game-server/game-service/internal/game/forest_map_test.go` (and `forest_map.go` only if the arrival inset needs tuning)
- `game-server/game-service/internal/gameserver/forest_boot_test.go` (only if it pins the old size)

## Blocked By

None.

## Spec Reference

FS-KSD6K §A R1–R7; §Supersession rows 1–2; User Stories 1, 4, 5, 6, 7, 19, 20, 21, 26; Acceptance
Criteria (server) 1–6, 9–10; Decision log 1, 2, 5, 6, 13.

## TDD Approach

- RED: `forest_map_test.go` asserts the built Forest is 3120 x 2000 (and the constants match); `forest_boot_test.go` already asserts place size equals the constants.
- RED: the 1 000-seed property test at the new params (fails until branches, steps and wall budget are tuned).
- GREEN: `ForestParams` and the constants at the new values; golden regenerated.
