---
id: I-M8CSE-3
status: done
implements: FS-M8CSE
blocked_by: []
labels: [ready-for-agent]
title: "FS-M8CSE slice 3: every Spire floor is a dungeon"
---
Implements FS-M8CSE §C

**Floor code hotspot:** one writer at a time on `dungeon_floor.go` and `session.go`. Treat
FS-KE075's generator, floor map, per-room monsters and A* as built, whatever its tracker says.

## Files owned

- `game-server/game-service/internal/game/dungeon_floor.go` (`dungeonParams`)
- `game-server/game-service/internal/game/session.go`: comments at `buildFloor` and `layBuildings` and `newMonsterAI`'s only, and only if they would be false. No logic. The owner's uncommitted `slog.Debug` removal stays as is.
- Tests in `internal/game` that pin floor 2 as a floor of buildings: `floor_size_test.go`, `floor_map_test.go`, `dungeon_floor_test.go`, `dungeon_fixture_test.go`, `floor_test.go`, `stairs_test.go`, `guarded_chest_test.go`, `interest_test.go`, `monster_population_test.go`, `monster_navigation_floor1_test.go`

## What to Build

`dungeonParams` returns floor 1's parameter set at every depth (R12, R13, charter default: it passes
the 1,000-seed gate). The generator, 45-70 population, guarded chests, A*, interest cut and floor map
already key on a layout existing (R14, charter default), so no depth check is added. Generation
failure keeps FS-KE075 R17 (R15, charter default). This supersedes FS-KE075's floor-2+ rules.

The client side needs no change: fog, the minimap and floor-map handling key on regions, and fog
goes with its floor (`leaveFloor`).

## Acceptance Criteria

- [ ] Floors 2 and 3 are built as dungeons with 45-70 non-boss monsters, from `DungeonFloor1Params`.
- [ ] On floor 2, a chest in a guarded room waits on its guards, a monster behind a wall paths to its target, snapshots are cut by interest, and the floor map carries regions.
- [ ] A forced generation failure on floor 2 builds a floor of buildings, logged, with its stairs.
- [ ] No `depth` condition is added to guarded chests, the AI, interest, fog or minimap code.
- [ ] `go test ./...` in game-service passes.

## Blocked By

None. Blocks I-M8CSE-4.

## Spec Reference

FS-M8CSE §C R12-R15; user stories 8-10, 24.

## TDD Approach

- RED: `dungeonParams(2)` returns the floor 1 set, true.
- GREEN: the depth check goes; the pinned-to-buildings tests move to their new truth.
