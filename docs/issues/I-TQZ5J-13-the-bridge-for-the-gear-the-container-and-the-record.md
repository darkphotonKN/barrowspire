---
id: I-TQZ5J-13
status: open
implements: FS-TQZ5J
blocked_by: []
labels: [ready-for-agent]
title: "FS-TQZ5J phase 3, slice 1: the bridge carries the gear's, the container's and the record's data and requests"
---
Implements FS-TQZ5J §Change: Phase 3: the gear, the container view, the settlement record and the controls panel (R52–R54)

**Lane: AFK (agent).** game-client only. Nothing drawn moves in this slice.

## What to Build

- `UiState` gains `inventory`, `character`, `stash` and `container`; `reportUi` takes a part and
  merges it, and the world hears every change with what it was (R53).
- World → UI as plain data on the bridge: `gear(message)` (`seen`, `level`, `taken`, `openStash`,
  `close`), `container(message)` (`open`, `items`, `close`), `record(shown)`, `endPopped()`, told to
  the UI scene's screens (R52).
- UI → world requests: `equip`, `unequip` (by entity id), `take` (the item), `close: record` (R54);
  `answering` routes them. `WorldBlockers` gains `gear` (R55).
- The bridge's world-side face (`WorldUi`, `NO_UI`) carries the new calls.

## Acceptance Criteria

- [ ] A part reported merges into the UI's state; a change is heard by the world reported once,
      with the state before; no change, nothing heard.
- [ ] Each world → UI message reaches every screen listening, synchronously, and none after its stop.
- [ ] `answering` hands `equip`, `unequip`, `take` and `close: record` to the world's answers; one
      with no answer is ignored.
- [ ] No message type holds a function (the types).
- [ ] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

None (phase 2 is on the branch).

## Spec Reference

FS-TQZ5J §Change: Phase 3 (R52–R55); R10, R11; ADR-0081 D2, ADR-0082, ADR-0083 D3.

## TDD Approach

- RED: `uiBridge.test.ts`: a merged `reportUi` heard with its before; each new message to a screen;
  `answering` for the new kinds.
- GREEN: the bridge's types and `GameUiBridge`.
