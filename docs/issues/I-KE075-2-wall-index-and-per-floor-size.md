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

- [ ] Recorded mover traces on a run floor give identical positions with and without the index, tick by tick
- [ ] The index is rebuilt on a floor change and holds no rect of the previous floor
- [ ] Every map-size reader reads the session's size; a test with a non-default size catches a constant read
- [ ] A test pins that 5760×3840 stays under the spatial-hash key's 255-cell limit
- [ ] Existing movement and bounds tests pass unchanged; the tick bench is no slower on floor 2
- [ ] `go test ./...` and `golangci-lint run` pass

## Blocked By

None

## Spec Reference

FS-KE075 §B.11 (per-floor size), §E.28–30 (index, identical answers, hash bound).

## TDD Approach

- RED: a trace test comparing indexed and full-scan collision on a fixture floor
- GREEN: the index and the movement system's use of it
