---
id: I-KE075-1
status: open
implements: FS-KE075
blocked_by: []
labels: [ready-for-agent]
title: "FS-KE075 slice 1: a pure, seeded room-and-corridor generator in internal/levelgen with regions, shell walls and room roles (game-service)"
---
Implements FS-KE075 §A (Requirements 1–9), §B Requirement 12 (role assignment as layout data)

**Lane: agent (AFK), game-service (agreed in the charter).**

## What to Build

A new dungeon generator in `internal/levelgen`, next to the Forest's, with its own parameter set (72×48 cells of 80 px, 18–28 rooms from 4×4 to 10×8, corridors 2–3 wide, `round(0.2 × rooms)` extra edges). It places rooms by rejection sampling with a 2-cell gap and a 2-cell edge margin, joins them by an MST over room centres plus the shortest non-tree pairs as L-shaped corridors, cuts corridor cells into 4-connected segments of at most 16 cells, derives doorways and shell walls (8-adjacent non-walkable cells, merged by `merge.go`), validates reachability by BFS, and assigns room roles (start ≥ 5×5; switch, escape door, stairs in three rooms at least median walking distance from the start; 3–4 treasure rooms). Deterministic per seed with derived retry seeds, like `Generate`. Pure: no entities, no wire. Also exports a JSON golden of one seed's layout for the client fixture (slice 5).

## Files (expected)

- new `internal/levelgen/dungeon.go` (generator, params) and `dungeon_test.go`
- new `internal/levelgen/regions.go` (corridor segments, doorways) and its test
- new `internal/levelgen/roles.go` (room roles, walking distances) and its test
- `internal/levelgen/merge.go`, `validate.go` (reused; widened only if needed)
- new `internal/levelgen/testdata/dungeon_seed_*.golden.json`

## Acceptance Criteria

- [x] 1,000 seeds all give valid layouts meeting every §A bound (grid, room counts and sizes, corridor widths, reachability, doorways, edge ring)
- [x] Regions partition walkable cells; corridor segments 4-connected and ≤ 16 cells on the longer side; ids unique from 1
- [x] Walls are exactly the shell cells, merged without overlap; no void cell is a wall
- [x] Extra edges number `round(0.2 × rooms)`; at least one of the 1,000 layouts has a loop through four or more rooms
- [x] Roles: switch, door and stairs in three distinct rooms at ≥ median distance; 3–4 treasure rooms; start ≥ 5×5
- [x] Same seed → byte-identical layout, regions and roles; golden pinned
- [ ] `go test ./internal/levelgen/...` and `golangci-lint run` pass

## Verified (2026-11-06, review fix round 1, branch floor1/fix-KE075-server)

- `TestGenerateDungeon_Floor1Params_EverySeedValid` runs `validateDungeon` (grid, rooms, edges,
  regions, walls, doorways, roles, reachability) on 1,000 seeds: rooms 18..28, 917 layouts with a
  loop of four or more rooms, 78 needed a retry (max attempt 4 of 32). Regions and walls also by
  `TestCorridorSegments_PartitionIntoConnectedBoundedPieces`, `TestShellCells_EightAdjacentNonWalkable`
  and `TestGenerateDungeon_OneSeed_WalkableReachableAndNoWallOnVoid`; roles by
  `TestGenerateDungeon_Roles_FarDistinctAndTreasure`; determinism by
  `TestGenerateDungeon_SameSeed_ByteIdenticalJSON` and `TestGenerateDungeon_GoldenJSON`.
- Review M5/L1: sizes and the count are now drawn uniformly (`TestGenerateDungeon_RoomSizesDrawnUniformly`,
  `TestGenerateDungeon_RetriesKeepTheDrawnRoomCount`). Over 5,000 seeds: width 4..10 at
  14.8/14.7/14.3/14.3/14.1/14.0/13.9% (even 14.3%), height 4..8 at 20.4/20.2/19.9/19.8/19.6%
  (even 20%), count 18..28 each 8.5–10.0% (even 9.1%); 5.73 halls (W ≥ 8, H ≥ 6) per layout
  (was 3.82), 4.49 eligible; first attempt valid 92.4% (was 96.3%), 0.106 failed attempts per
  layout (was 0.040), no seed exhausted its retries. The golden was re-pinned; the client fixture
  `game-client/src/render/world/dungeon.fixture.json` is a copy and needs the same refresh.
- `go test ./internal/levelgen/...` and `-race` on it pass.
- **Not ticked: `golangci-lint run`.** Run over the whole module it fails on 7 errcheck findings
  in `cmd/server/main.go` (5) and `auth/middleware.go` (2), files untouched by FS-KE075 and
  unchanged since 48ece46c, where the same 7 are reported. `golangci-lint run` on `./internal/...`
  packages this slice touches is clean. The status stays open until the module-wide run passes.

## Blocked By

None

## Spec Reference

FS-KE075 §A.1–9 (the generator), §B.12 (roles computed from the layout). ADR-0061 Decisions 1–6.

## TDD Approach

- RED: a table test that one seed's layout has every walkable cell reachable and no wall on a void cell
- GREEN: the generator, region cut and shell merge until the 1,000-seed property test passes
