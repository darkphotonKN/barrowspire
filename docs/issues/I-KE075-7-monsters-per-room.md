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

- [ ] Across 1,000 floor-1 builds: 45–70 monsters besides a demon; none in the start room or within 350 px of a delver; none on a doorway; ≥ 60 px apart
- [ ] Every treasure guard is elite; every eligible hall holds 1 troll and 2–4 ghouls
- [ ] Corridors hold 4–8, at most one per segment
- [ ] Floors 2–3 populations unchanged (their tests pass as they are)
- [ ] `go test ./...` and `golangci-lint run` pass

## Blocked By

I-KE075-6

## Spec Reference

FS-KE075 §C.18–20. ADR-0061 Decision 7.

## TDD Approach

- RED: a property test over 1,000 seeds for the total and the start room
- GREEN: the distribution
