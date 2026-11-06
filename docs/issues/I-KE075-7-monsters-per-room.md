---
id: I-KE075-7
status: open
implements: FS-KE075
blocked_by: [I-KE075-6]
labels: [blocked]
title: "FS-KE075 slice 7: floor 1's monsters are distributed per room: hall packs, elite treasure guards, corridor monsters, 45–70 in all (game-service)"
---
Implements FS-KE075 §C (Requirements 18–20)

**Lane: agent (AFK), game-service (agreed in the charter).**

## What to Build

Floor 1's population by room and role: none in the start room or within 350 px of a delver; a hall (≥ 8×6) that is not start or treasure holds 1 troll + 2–4 ghouls within 160 px of the troll; other rooms 0–3 rolled monsters; corridors 4–8 in all, one per segment at most; treasure rooms one elite (50%) or 2–3 elites (50%); the total held to 45–70 (top up into ordinary rooms ≤ 4 each, trim ordinary rooms then corridors). Levels, the 3% elite chance outside guards, the troll share and the 1% demon (in a far room, outside the 45–70) unchanged. ≥ 60 px apart, clear of containers and interactables, never on a doorway. Floors 2–3 unchanged.

## Files (expected)

- `internal/game/monster_population.go` (per-room distribution on a dungeon floor)
- `internal/game/monster_tuning.go` (named constants for the new counts)
- `internal/game/monster_population_test.go`

## Acceptance Criteria

- [x] Across 1,000 floor-1 builds: 45–70 monsters besides a demon; none in the start room or within 350 px of a delver; none on a doorway; ≥ 60 px apart
- [x] Every treasure guard is elite; every eligible hall holds 1 troll and 2–4 ghouls
- [x] Corridors hold 4–8, at most one per segment
- [x] Floors 2–3 populations unchanged (their tests pass as they are)
- [ ] `go test ./...` and `golangci-lint run` pass

## Verified (2026-11-06, review fix round 1, branch floor1/fix-KE075-server)

- `TestDungeonPopulation_TotalAndStartRoom`, `_EveryHallHoldsATrollPack`, `_TreasureGuardsAreElite`,
  `_CorridorsHoldFourToEightOnePerSegment`, `_OffDoorwaysClearAndApart`,
  `_EliteChanceAndTrollShareUnchanged` (1,000 builds each), `TestPlaceDungeonDemon_TheFarthestRoom`;
  floors 2–3 by the unchanged `monster_population_test.go`.
- After the room-size fix (I-KE075-1), over 5,000 floor-1 builds: mean 52.4 monsters (was 49.2),
  exactly 45 in 29.2% (was 45.2%), 46–49 15.7%, 50–54 19.2%, 55–59 16.7%, 60–64 11.1%,
  65–69 5.6%, exactly 70 2.5% (was 0.2%), none outside 45–70; 5.72 halls per build, 4.50
  eligible. The pile at 45 is the top-up floor: a floor whose rolls come in under 45 is topped up
  to exactly 45.
- game-service `go test ./...`, `go vet ./...` and `-race` on game pass.
- **Not ticked: `golangci-lint run`.** Run over the whole module it fails on 7 errcheck findings
  in `cmd/server/main.go` (5) and `auth/middleware.go` (2), files untouched by FS-KE075 and
  unchanged since 48ece46c, where the same 7 are reported. `golangci-lint run` on `./internal/...`
  packages this slice touches is clean. The status stays open until the module-wide run passes.

## Blocked By

I-KE075-6

## Spec Reference

FS-KE075 §C.18–20. ADR-0061 Decision 7.

## TDD Approach

- RED: a property test over 1,000 seeds for the total and the start room
- GREEN: the distribution
