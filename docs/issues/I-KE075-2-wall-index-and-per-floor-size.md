---
id: I-KE075-2
status: open
implements: FS-KE075
blocked_by: []
labels: [ready-for-agent]
title: "FS-KE075 slice 2: a static wall grid index for collision on every run floor, and every map-size reader on the floor's own size (game-service)"
---
Implements FS-KE075 §B Requirement 11, §E (Requirements 28–30)

**Lane: agent (AFK), game-service (agreed in the charter).**

## What to Build

A uniform grid index over a run floor's wall and door rects, built at floor build and rebuilt on every floor change; `MovementSystem` tests only the rects in the buckets a mover's swept box covers, in today's order, so results are identical to the full scan. The session's map size becomes per floor, and every reader reads it: `CreateContainer` (`session.go:3455-3456`), `NewMovementSystem`'s defaults (`movement.go:30-35, 432-440`), `RunBounds` (`session.go:240-242`) and the clamp. No floor changes size yet (floor 1 is still 1440×960 until slice 6), so behaviour is unchanged everywhere.

## Files (expected)

- new `internal/systems/wall_index.go` and `wall_index_test.go`
- `internal/systems/movement.go` (query the index in the swept tests and depenetration)
- `internal/game/session.go` (index built in the floor build; per-floor `mapWidth`/`mapHeight`; `RunBounds`, `CreateContainer`)
- `internal/systems/movement_bounds_test.go`, `internal/game/run_tick_bench_test.go`

## Acceptance Criteria

- [x] Recorded mover traces on a run floor give identical positions with and without the index, tick by tick
- [x] The index is rebuilt on a floor change and holds no rect of the previous floor
- [x] Every map-size reader reads the session's size; a test with a non-default size catches a constant read
- [x] A test pins that 5760×3840 stays under the spatial-hash key's 255-cell limit
- [x] Existing movement and bounds tests pass unchanged; the tick bench is no slower on floor 2
- [ ] `go test ./...` and `golangci-lint run` pass

## Verified (2026-11-06, review fix round 1, branch floor1/fix-KE075-server)

- `TestMovementSystem_IndexedTrace_MatchesTheFullScanTickByTick` (today's size and floor 1's),
  `TestWallIndex_AnswersExactlyAsTheFullScan`, `TestMovementSystem_WallsChange_IndexHoldsOnlyTheNewFloor`,
  `TestRegenerateFloor_RebuildsTheWallIndex`, `floor_size_test.go` (RunBounds, CreateContainer, the
  clamp, the floor build), `TestFloorSize_FitsTheSpatialHash`, `TestSpatialHashRows`,
  `TestMovementSystem_ClampsToTheWorldsOwnBounds`.
- Tick bench, floor of buildings, 2 delvers, 14 monsters and a demon, `-benchtime 300x -count 3`,
  Apple M5 Pro: base 48ece46c (floor 1 was then buildings) 51.3 / 59.6 / 65.6 µs per tick; now
  `BenchmarkRunTick_FullFloor2` 41.6 / 43.3 / 43.4 µs per tick. No slower.
- game-service `go test ./...`, `go vet ./...` and `-race` on game and systems pass.
- **Not ticked: `golangci-lint run`.** Run over the whole module it fails on 7 errcheck findings
  in `cmd/server/main.go` (5) and `auth/middleware.go` (2), files untouched by FS-KE075 and
  unchanged since 48ece46c, where the same 7 are reported. `golangci-lint run` on `./internal/...`
  packages this slice touches is clean. The status stays open until the module-wide run passes.

## Blocked By

None

## Spec Reference

FS-KE075 §B.11 (per-floor size), §E.28–30 (index, identical answers, hash bound).

## TDD Approach

- RED: a trace test comparing indexed and full-scan collision on a fixture floor
- GREEN: the index and the movement system's use of it
