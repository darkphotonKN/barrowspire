---
id: I-KE075-8
status: open
implements: FS-KE075
blocked_by: [I-KE075-6]
labels: [blocked]
title: "FS-KE075 slice 8: on floor 1 monsters chase, wander and return by A* paths on the cell grid, repathing at most every 0.5 s (game-service)"
---
Implements FS-KE075 §D (Requirements 21–27)

**Lane: agent (AFK), game-service (agreed in the charter).**

## What to Build

An A* search over the floor's walkable cells: 8-connected, diagonal only when both orthogonal cells are walkable, costs 1 and √2, octile heuristic, deterministic ties. `MonsterAISystem` on a dungeon floor follows paths of cell centres when chasing (straight steer when sharing a cell or a legal neighbour), repaths only when the target changed cell or the path ran out and at most once per 0.5 s, picks wander destinations among walkable cells within 150 px of home and walks there by path, and walks home by path when leashing. A failed search falls back to the straight steer until the next one. The AI reads the grid through a narrow interface the session supplies. Floors 2–3 keep the straight chase. Aggro, leash, wind-up unchanged.

## Files (expected)

- new `internal/levelgen/astar.go` (or a small navigation package beside it) and its test
- `internal/systems/monster_ai.go` (path following, repath throttle, wander and return by path)
- `internal/systems/monster_ai_test.go`
- `internal/game/session.go` (hand the floor's grid to the AI system)
- `internal/game/run_tick_bench_test.go` (floor 1, 4 delvers, 70 chasing monsters)

## Acceptance Criteria

- [x] A* unit tests: shortest path, no diagonal through a blocked corner, deterministic ties
- [x] System test on a fixture floor: a monster behind a wall reaches its target by path; on floor 2 the same setup chases straight
- [x] At most one search per 0.5 s per chasing monster with a moving target
- [x] Wander destinations are walkable cells within 150 px of home; leashing walks home by path
- [x] Bench: floor-1 mean tick under 8 ms with 70 monsters chasing; figure recorded in the PR
- [ ] `go test ./...` and `golangci-lint run` pass

## Verified (2026-11-06, review fix round 1, branch floor1/fix-KE075-server)

- A*: `TestPath_AroundAWall_IsShortest`, `_BlockedCorner_NoDiagonalThroughIt`,
  `_Ties_AreBrokenDeterministically`, `_OpenGround_CostsTheOctileDistance`,
  `_RandomGrids_MatchDijkstra`, `_Floor1_EveryPairReachable`.
- AI: `TestMonsterAISystem_TargetBehindAWall` (grid and no grid),
  `_MovingTarget_SearchesAtMostEveryHalfSecond`, `_WanderDestination_IsAWalkableCellNearHome`,
  `_Leashed_WalksHomeByPath`, `TestMonsterNavigation_Floor1_FarthestMonstersReachTheDelver`.
- Review L8: every floor's AI rolls from the source the session was built with
  (`withMonsterRoll`); `TestFloorChange_MonsterAIKeepsTheInjectedRoll`, mutation-checked.
- Review L6: the bench places its 70 monsters through `placeOnRegion` on the rooms but the
  start, and the demon through `placeDungeonDemon`; the bench-only whole-floor ground is gone.
- Bench, `-benchtime 300x -count 3`, Apple M5 Pro: `BenchmarkRunTick_DungeonFloor1` (4 delvers,
  70 monsters all chasing, snapshots cut) 272.6 / 278.1 / 281.9 µs mean per tick, worst 4.26–4.52
  ms; `_DelversChangingCell` 450.4 / 450.8 µs mean, worst 4.39–4.50 ms. Under 8 ms.
- game-service `go test ./...`, `go vet ./...` and `-race` on game, systems and navigation pass.
- **Not ticked: `golangci-lint run`.** Run over the whole module it fails on 7 errcheck findings
  in `cmd/server/main.go` (5) and `auth/middleware.go` (2), files untouched by FS-KE075 and
  unchanged since 48ece46c, where the same 7 are reported. `golangci-lint run` on `./internal/...`
  packages this slice touches is clean. The status stays open until the module-wide run passes.

## Blocked By

I-KE075-6

## Spec Reference

FS-KE075 §D.21–27. ADR-0062. Brings pathfinding into scope for floor 1 (FS-77AB6 §Out of Scope).

## TDD Approach

- RED: an A* test on a hand-made grid with a blocked corner
- GREEN: the search, then the AI's use of it
