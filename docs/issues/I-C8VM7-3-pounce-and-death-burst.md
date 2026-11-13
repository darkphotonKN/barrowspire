---
id: I-C8VM7-3
status: done
implements: FS-C8VM7
blocked_by: [I-C8VM7-2]
labels: []
title: "FS-C8VM7 slice 3: the Ravener's pounce and the Blightborn's death burst"
---
Implements FS-C8VM7 §B (R11, R15-R17)

**Type:** AFK. **Hotspot:** `monster_tuning.go`, `monster_ai.go`, `combat.go` (after I-C8VM7-2).

## Files expected to touch

- `game-server/game-service/internal/components/monster.go` (leap state; a pending burst on a corpse)
- `game-server/game-service/internal/game/monster_tuning.go` (R11's pounce and burst numbers on `ravener`, `blightborn`)
- `game-server/game-service/internal/systems/monster_ai.go` (the pounce: wind-up, clear-line check, leap, landing)
- `game-server/game-service/internal/systems/monster_death.go` (the burst's fuse on a corpse; removed with the corpse or floor)
- `game-server/game-service/internal/systems/combat.go` (the landing area; the burst's snapshotted hit credited to the Blightborn)
- `game-server/game-service/internal/serializer/state_serializer.go` (a corpse's pending `burst`)
- Tests: `internal/systems/monster_ai_test.go`, `monster_death_test.go`, `combat_test.go`

## What to Build

- **Pounce (R15):** with a ready pounce and a target 120-300 px away in sight, the Ravener winds
  up 0.5 s at the point fixed at the start, checks the straight line is clear at its body radius,
  leaps there over 0.3 s colliding with nothing, then its 60 px area lands at × 1.5. A blocked
  line calls it off with the cooldown spent. It never leaves walkable cells.
- **Death burst (R16):** a Blightborn dies as every monster (one kill record, drops, experience,
  corpse), then after 0.8 s its 110 px burst lands once on the corpse at × 2.0 its (elite)
  damage snapshotted at death; a delver it kills is credited to the Blightborn. A floor change
  first removes it.
- **Wire (R17):** `action: ability` through the pounce's wind-up and leap; `ability` with kind
  `pounce` or `burst`, its centre, radius and `remaining`; a dead Blightborn carries its burst.

## Acceptance Criteria

- [ ] A pounce with a clear line ends at the aimed point and hits there; a blocked one is called off, cooldown spent; the Ravener never ends off walkable cells.
- [ ] A Blightborn's death records one kill, then its burst lands once after 0.8 s centred on the corpse at × 2.0 (elite) damage; a delver it kills is credited to it; a floor change before the fuse removes it.
- [ ] Two overlapping bursts each land.
- [ ] The state carries `ability` for a pending pounce or burst per R17.
- [ ] `make test` and `golangci-lint run` pass in game-service.

## Bounds

Never touch `internal/matchmaker` or `internal/match_queue`. No migrations, no HTTP contract
change, no kill or match stats (the burst's kill goes through the existing kill record only).

## Blocked By

I-C8VM7-2

## Spec Reference

FS-C8VM7 §B R11, R15-R17; §Edge States (bursts, pounce); user stories 10, 11; acceptance criteria "Server" 10-11.

## TDD Approach

- RED: a Blightborn killed beside a delver hurts them 0.8 s later, once; a Ravener facing a wall-blocked line does not leap.
- GREEN: the corpse's fuse and burst; the leap.
