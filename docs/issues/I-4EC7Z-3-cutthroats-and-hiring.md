---
id: I-4EC7Z-3
status: done
implements: FS-4EC7Z
blocked_by: [I-4EC7Z-2]
labels: [ready-for-agent]
title: "FS-4EC7Z slice 3: the Cutthroats' parley (hostile or a revealed door) and the hire entry point"
---
Implements FS-4EC7Z §D R14–R15, §F R24 (`cutthroat`), R27, R28

**Hotspot:** game-service `session.go`, monster sheets (`monster_tuning.go`), the serializer. One writer at a time.

## What to Build

- The `cutthroat` monster archetype and sheet (with a `look`), at the floor's monster level.
- The parley (R14): first talk → greeting, the 3 s draw; hostile → cutthroat monsters aggroed on
  the talker with the turn line; peaceful → the tip line and the nearest unopened secret door
  detected and `revealed: true` on its barrier (R28), or a lore line when there is none.
- `hire(group, hirer)` (R15): willing cutthroats become allies; `not_willing`, `already_hired`,
  `too_many_allies`; hiring cancels a pending draw. No client action.

## Acceptance Criteria

- [ ] FS-4EC7Z server criteria for §D R14–R15.
- [ ] `make test` and `make check` green.

## Blocked By

I-4EC7Z-2 (allies).

## Spec Reference

FS-4EC7Z §D R14–R15, §F R24, R27–R28.

## TDD Approach

- RED: with the draw forced hostile, 3 s after a talk the three cutthroats are monsters aggroed on the talker.
- GREEN: the parley timer and conversion.
