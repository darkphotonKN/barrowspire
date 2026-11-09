---
id: I-M8CSE-7
status: done
implements: FS-M8CSE
blocked_by: [I-M8CSE-6]
labels: [ready-for-agent]
title: "FS-M8CSE slice 7: the floor factor lifts Spire kill drops above floor 5"
---
Implements FS-M8CSE §F

**Hotspot:** `loot_tuning.go`, one writer at a time.

## Files owned

- `game-server/game-service/internal/game/loot_tuning.go` (`floorFactor`)
- `game-server/game-service/internal/game/monster_drops.go`, `monster_drops_test.go`
- `game-server/game-service/internal/game/field_drops_test.go` (a pin only; `field_drops.go` is not changed here)

## What to Build

A Spire kill rolls its row's chance x the floor factor at `KillRecord.Floor`, capped at 100% (R28,
R29). The factor is applied at roll time in the Spire's kill consumer, so the rows are not rewritten.

**Fields are not touched: field drop chances stay exactly as they are** (R30, FS-X2F2H R31). They read
the same rows and do not take the factor. Sack and chest item odds do not change.

## Acceptance Criteria

- [ ] `floorFactor`: 1 on floors 1-5, 1.05 on 6, 1.25 on 10.
- [ ] Floor 10 rolls ghoul 10%, troll 18.75%, elite 62.5%, boss 100% with 2-3 items.
- [ ] A field kill rolls its row's chance x the place's drop factor, as before.
- [ ] `go test ./...` in game-service passes.

## Blocked By

I-M8CSE-6

## Spec Reference

FS-M8CSE §F R28-R30; user stories 17, 20.

## TDD Approach

- RED: a floor-10 ghoul kill at a roll of 0.09 drops; a Meadows boar at the same roll on the old threshold does not change.
- GREEN: the factor in the Spire's consumer.
