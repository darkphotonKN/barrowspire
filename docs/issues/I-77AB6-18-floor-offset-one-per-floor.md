---
id: I-77AB6-18
status: done
implements: FS-77AB6
blocked_by: [I-M8CSE-4]
labels: [ready-for-agent]
title: "Tune FS-77AB6: floor offset from 2 x (floor - 1) to 1 x (floor - 1)"
---
Tunes FS-77AB6

Values only: FS-77AB6 R21 names this offset as a starting value and no acceptance criterion changes.
It is sorted out of FS-M8CSE at lock (FS-M8CSE §D R16). Waits on I-M8CSE-4 only because both write
`monster_tuning.go`.

## Files owned

- `game-server/game-service/internal/game/monster_tuning.go` (`MonsterLevelPerFloor`)
- `game-server/game-service/internal/game/monster_population_test.go` and `chest_loot_test.go`, only where a value hard-codes the old step

## What to Build

`MonsterLevelPerFloor` goes from 2 to 1. It feeds monster levels and, through `areaLevel`, item levels.
Floor 10 is then +9, about 2.1x HP and damage, where +2 was +18, about 3.2x.

## Acceptance Criteria

- [ ] A floor-F monster is party level + (F - 1) + spread, at least 1; the Demon's and Blood Demon's follow the same offset plus their bonus.
- [ ] A chest's area level on floor F is highest in-play level + (F - 1).
- [ ] FS-77AB6's acceptance criteria still pass. `go test ./...` in game-service passes.

## Blocked By

I-M8CSE-4

## Spec Reference

FS-77AB6 §Requirements 21; FS-M8CSE §D R16.
