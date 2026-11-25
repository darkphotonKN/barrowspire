---
id: I-4EC7Z-4
status: done
implements: FS-4EC7Z
blocked_by: [I-4EC7Z-3]
labels: [ready-for-agent]
title: "FS-4EC7Z slice 4: the contract entry point, the mark, its heading and Contract Settled"
---
Implements FS-4EC7Z §E R16–R21, §F R24 (`contract_mark`), R25, R27

**Hotspot:** game-service run-level state, monster AI (the mark's call and flee), combat (poison on
hit, the +15% damage), the serializer. One writer at a time.

## What to Build

- `takeContract(taker)` (R16) and run-level contract state.
- The mark (R17–R18): `contract_mark` archetype with two looks and server names, spawn rules,
  health scaled by living delvers, poison blades, the 50% call of three cutthroats once, the 25%
  flee to the farthest room and 20% heal once.
- Settled (R19): the taker's Contract Settled (+15% outgoing damage, kept across floors, lost on
  death); the mark drops nothing, gives an elite's experience. Lost (R20). The 5 s compass heading
  (R21).
- `contract` on the taker's `current_player`, `contract_settled` on the public state (R25).

## Acceptance Criteria

- [ ] FS-4EC7Z server criteria for §E.
- [ ] `make test` and `make check` green.

## Blocked By

I-4EC7Z-3 (the cutthroat archetype the mark calls).

## Spec Reference

FS-4EC7Z §E, §F R24–R25, R27.

## TDD Approach

- RED: a second `takeContract` in the same delve is refused `contract_taken`.
- GREEN: the run-level contract state.
