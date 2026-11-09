---
id: I-M8CSE-4
status: done
implements: FS-M8CSE
blocked_by: [I-M8CSE-2, I-M8CSE-3]
labels: [ready-for-agent]
title: "FS-M8CSE slice 4: each run rolls its Spire height"
---
Implements FS-M8CSE §A

**Hotspots:** `monster_tuning.go`, `session.go` and the floor code, one writer at a time. This is the
only slice that changes logic in `session.go`.

## Files owned

- `game-server/game-service/common/constants/game.go` (removes `RunFloorCount`)
- `game-server/game-service/internal/game/monster_tuning.go` (the odds table, and the `RunFloorCount` comment on `BloodDemonChanceByFloor`)
- `game-server/game-service/internal/game/factory.go` (`CreateMatchProgressEntity` takes the height)
- `game-server/game-service/internal/game/session.go`: `InitialSystems` (`:3200`), `buildFloor` (`:3296`), `layBuildings` (`:3392`) only. The owner's uncommitted `slog.Debug` removal stays as is.
- `game-server/game-service/internal/game/dungeon_floor.go` (`hasStairs` reads the run's height)
- Tests: `internal/game/floor_test.go`, `floor_size_test.go`, `floor_map_test.go`, `stairs_test.go`, `guarded_chest_test.go`, `dungeon_floor_test.go`, `monster_population_test.go`, and `internal/systems/rules_test.go` if `CreateMatchProgressEntity`'s signature reaches it

Not in this slice: anything under `internal/matchmaker`, `internal/match_queue`, `cmd/server/main.go` or
`internal/gameserver/server.go`.

## What to Build

Roll the height once, from the odds table in `monster_tuning.go`, using the session's spawn source,
and put it on `FloorComponent.Count` (R1-R3). Forcing a height means editing that table in a local
build, no dev flag (R2, charter default). `RunFloorCount` goes. Stairs and the guaranteed boss follow
the height (R4). The height stays off the wire (I-M8CSE-2).

## Acceptance Criteria

- [ ] A roll over a seeded source lands only in 3-10, and the table's weights sum to 100.
- [ ] The height does not change across floors.
- [ ] Depth equal to the height: no stairs, guaranteed boss. Below: stairs, on a dungeon and on a fallback floor. `regenerateFloor` still refuses past the top.
- [ ] `RunFloorCount` no longer exists anywhere.
- [ ] `go test ./...` in game-service passes.

## Blocked By

I-M8CSE-2, I-M8CSE-3

## Spec Reference

FS-M8CSE §A R1-R5; user stories 1, 2, 15, 22, 23.

## TDD Approach

- RED: `rollSpireHeight` over a seeded source stays in 3-10, and a run whose component says height 5 has no stairs on floor 5.
- GREEN: the table, the roll, and the readers moved off the constant.
