---
id: I-KSD6K-2
status: open
implements: FS-KSD6K
blocked_by: [I-KSD6K-1]
labels: [blocked]
title: "FS-KSD6K slice 2: 12-16 Forest spawn points spread by the Forest's own spacing (game-service)"
---
Implements FS-KSD6K §B (Requirements 8–12), §Supersession

**Author: agent.** Server tuning only. No proto change; never touch `internal/matchmaker` or
`internal/match_queue`; start no backend service (tests only).

## What to Build

The Forest's standard monster population thins to about a third of today's density and spreads
out, without moving the Spire:

1. `ForestSpawnPointsMin/Max` (`internal/game/monster_tuning.go`) become 12/16.
2. A new `ForestSpawnSpacing` in the same Forest block of `monster_tuning.go` (starting 240 px,
   never below 120 px), with a comment citing FS-KSD6K R9 and why it is separate.
3. `forestSpawnPoints` (`internal/game/forest_population.go`) uses `ForestSpawnSpacing` instead of
   `MonsterSpacing`; update its doc comment.
4. `MonsterSpacing` stays 60: it is shared with the Spire's `spawnArea.open`
   (`monster_population.go`) and set by the movement spatial hash.
5. `ForestEntranceExclusion` stays 400. Who spawns, the 45 s respawn, elites-only-in-clearings,
   chests and level band are unchanged (R12).
6. `TestForestLayout_SpawnPoints` pins 12/16, 400 and `ForestSpawnSpacing`, and checks the
   spacing against `ForestSpawnSpacing`. If any seed places fewer than 12, lower
   `ForestSpawnSpacing` (floor 120) until every seed passes.

## Acceptance Criteria

- [ ] `ForestSpawnPointsMin/Max` are 12/16; `ForestSpawnSpacing` exists, is >= 120 px, and is the only spacing `forestSpawnPoints` uses.
- [ ] `MonsterSpacing` is 60 and every Spire spawn/population test passes unchanged.
- [ ] `TestForestLayout_SpawnPoints` passes on the new layout: every seed places 12–16 points, on open trail cells, off walls, outside clearings, >= 400 px from the entrance and >= `ForestSpawnSpacing` apart; same seed, same points.
- [ ] The elite clearing points and chest clearings are as FS-3QHQZ R15 assigns them.
- [ ] `go test ./...` and lint in game-service: no new failures versus the branch point.

## Files expected to touch

- `game-server/game-service/internal/game/monster_tuning.go`
- `game-server/game-service/internal/game/forest_population.go`
- `game-server/game-service/internal/game/forest_population_test.go`

## Blocked By

- I-KSD6K-1: the population is tuned and tested against the new 39 x 25 layout.

## Spec Reference

FS-KSD6K §B R8–R12; §Supersession row 3; User Stories 2, 3, 6, 8, 9, 22; Acceptance Criteria
(server) 7–8, 10; Decision log 1, 7, 8.

## TDD Approach

- RED: `TestForestLayout_SpawnPoints` asserts 12/16 and spacing >= `ForestSpawnSpacing` (fails: constants undefined / old values).
- GREEN: the new constants and `forestSpawnPoints` using `ForestSpawnSpacing`.
