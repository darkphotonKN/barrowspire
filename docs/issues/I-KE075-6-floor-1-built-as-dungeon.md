---
id: I-KE075-6
status: open
implements: FS-KE075
blocked_by: [I-KE075-1, I-KE075-2, I-KE075-3, I-KE075-4, I-KE075-5]
labels: [blocked]
title: "FS-KE075 slice 6: floor 1 is built from the dungeon generator at 5760×3840 with room roles, start-room spawn, interactables, containers per room and walkable-cell sampling (game-service)"
---
Implements FS-KE075 §B (Requirements 10–17), §F Requirement 31 (regions on the map)

**Lane: agent (AFK), game-service (agreed in the charter).**

## What to Build

The floor build step chooses the generator by floor: floor 1 from the dungeon generator (seed drawn and logged), floors 2–3 exactly as today. Floor 1 is 5760×3840; its walls are entities from the shell rects; the party's arrival slots (including the expected members') are on walkable cells of the start room; switch, escape door and stairs stand on non-doorway cells of their rooms, through the occupied-area check; containers `clamp(round(rooms/2), 10, 14)`, a chest in each treasure room and one per room elsewhere (sack share as today); every spawn sampled from walkable cells inset by the body radius. The floor map now carries `cell_size` and `regions`. Monsters, until slice 7, are today's count and rolls, placed by walkable-cell sampling in non-start rooms. A generator failure falls back to a fresh seed, then to today's floor, with an error logged.

## Files (expected)

- `internal/game/session.go` (`buildFloor :3164`: generator choice, floor size)
- new `internal/game/dungeon_floor.go` (walls, roles to placements, sampling) and `dungeon_floor_test.go`
- `internal/game/party_spawn.go` (`gatherParty` on a dungeon floor)
- `internal/game/monster_population.go` (interim walkable sampling only)
- `internal/game/floor_test.go:281-283, 297-298, 336-340`, `stairs_test.go`, `party_spawn_test.go`, `session_test.go`, `integration_test.go`, `container_roll_test.go`, `monster_population_test.go`

## Acceptance Criteria

- [x] Floor 1 is 5760×3840 and built by the generator; floors 2–3 are 1440×960 and their tests pass unchanged
- [x] Roles placed: switch, door and stairs in three different far rooms; 3–4 treasure chests; every party slot in the start room
- [x] 10–14 containers, at most one per room outside treasure rooms
- [x] Every spawned body on floor 1 is on a walkable cell, inset by its radius
- [x] The floor map for floor 1 carries `cell_size` 80 and regions
- [x] A forced generator failure still starts the run and logs an error
- [ ] `go test ./...` and `golangci-lint run` pass

## Verified (2026-11-06, review fix round 1, branch floor1/fix-KE075-server)

- `TestDungeonFloor1_SizeAndCellSizePerFloor`, `TestDungeonFloor1_RolesPlaced` (40 seeds),
  `TestDungeonFloor1_PartySlotsInTheStartRoom`, `TestDungeonFloor1_ContainersPerRoom`,
  `TestDungeonFloor1_EveryBodyOnWalkableCells`, `TestDungeonFloor1_FloorMapCarriesCellSizeAndRegions`,
  `TestDungeonFloor1_GeneratorFailureStillStartsTheRun`, `TestDungeonFloor1_FallbackOnlyOnError`.
- Review L5: a fixture is never forced onto its room's centre. `TestDungeonFloor1_FixtureDrawsMiss_TheRoomIsSearched`
  (every random draw misses; the room's one free cell is found by search),
  `TestDungeonFloor1_FixtureRoomWithNoSpot_FreshSeedBuilt` and
  `TestDungeonFloor1_NoLayoutWithASpot_FloorOfBuildings` (injected all-doorway role rooms).
- Floor-1 `floor_map`: `TestDungeonFloor1_FloorMapAtMost128KB`, 200 builds, mean 18,218 B, largest
  22,908 B (limit 131,072 B).
- game-service `go test ./...`, `go vet ./...` and `-race` on game pass.
- **Not ticked: `golangci-lint run`.** Run over the whole module it fails on 7 errcheck findings
  in `cmd/server/main.go` (5) and `auth/middleware.go` (2), files untouched by FS-KE075 and
  unchanged since 48ece46c, where the same 7 are reported. `golangci-lint run` on `./internal/...`
  packages this slice touches is clean. The status stays open until the module-wide run passes.

## Blocked By

I-KE075-1, I-KE075-2, I-KE075-3, I-KE075-4, I-KE075-5

## Spec Reference

FS-KE075 §B.10–17, §F.31. ADR-0061 Decisions 6, 8, 10, 13. Supersedes FS-F6F88 §5 for floor 1.

## TDD Approach

- RED: a session test that floor 1's party slots all lie in the start room's cells
- GREEN: the floor build branch and the sampling
