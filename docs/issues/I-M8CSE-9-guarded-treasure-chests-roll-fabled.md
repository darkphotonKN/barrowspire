---
id: I-M8CSE-9
status: done
implements: FS-M8CSE
blocked_by: [I-M8CSE-8]
labels: [ready-for-agent]
title: "FS-M8CSE slice 9: guarded treasure-room chests on floors 6+ roll Fabled"
---
Implements FS-M8CSE §G

**`session.go` is not edited here.** `session.go:2053` opens the chest with
`s.rollChest(containerKindOf(targetEntity))` and is out of bounds, so the chest's standing crosses
that line inside the existing call (R35).

## Files owned

- `game-server/game-service/internal/components/guarded.go` (marks a treasure-room chest)
- `game-server/game-service/internal/game/guarded_chests.go`, `guarded_chest_test.go`
- `game-server/game-service/internal/game/container_roll.go` (`containerKindOf`, the roll-only kind), `container_roll_test.go`
- `game-server/game-service/internal/game/forest_chests.go` (`rollChest`)
- `game-server/game-service/internal/game/chest_loot.go`, `chest_loot_test.go`
- `game-server/game-service/internal/game/loot_tuning.go` (the rate)

## What to Build

A chest in a treasure room with guards placed at build rolls 0.1% x floor factor per item on floors 6+
(R32, R35). Mark it at `guardChests`. `containerKindOf` returns a roll-only kind for it. The stored
`ContainerComponent.Kind` stays `chest`, so the wire is unchanged, and an unlisted kind rolls chest odds
(FS-1D6BX D2). `rollChest` reads the kind and rolls at a Fabled-bearing drop.

Hall chests, sacks, ordinary chests and fallback-floor chests take no chance (R32, R35). A chest's
Fabled pick is still never a ring (R34).

**Fields keep no Fabled** (R33): `fieldChestRoll` is unchanged and its drop chances stay as they are.

## Acceptance Criteria

- [ ] A guarded treasure-room chest on floor 6+ rolls the R32 rate. On floor 5, or with no guards placed, or in a hall, it does not.
- [ ] Its serialized `kind` is still `chest`, and its item count and odds are a chest's.
- [ ] A Fabled pick from it is never a ring.
- [ ] `session.go` is unchanged by this slice. `go test ./...` in game-service passes.

## Blocked By

I-M8CSE-8

## Spec Reference

FS-M8CSE §G R32, R34, R35; user story 19.

## TDD Approach

- RED: a floor-6 guarded treasure chest at Fabled chance 1 yields a unique; a hall chest does not.
- GREEN: the mark, the roll-only kind and `rollChest`.
