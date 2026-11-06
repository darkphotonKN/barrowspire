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

- [ ] A* unit tests: shortest path, no diagonal through a blocked corner, deterministic ties
- [ ] System test on a fixture floor: a monster behind a wall reaches its target by path; on floor 2 the same setup chases straight
- [ ] At most one search per 0.5 s per chasing monster with a moving target
- [ ] Wander destinations are walkable cells within 150 px of home; leashing walks home by path
- [ ] Bench: floor-1 mean tick under 8 ms with 70 monsters chasing; figure recorded in the PR
- [ ] `go test ./...` and `golangci-lint run` pass

## Blocked By

I-KE075-6

## Spec Reference

FS-KE075 §D.21–27. ADR-0062. Brings pathfinding into scope for floor 1 (FS-77AB6 §Out of Scope).

## TDD Approach

- RED: an A* test on a hand-made grid with a blocked corner
- GREEN: the search, then the AI's use of it
