---
id: I-TQZ5J-51
status: done
implements: FS-TQZ5J
blocked_by: []
labels: [ready-for-agent]
title: "FS-TQZ5J batch 6, slice 2: the HUD's review leftovers (messages name their world, one wiring, the label over the card)"
---
Implements FS-TQZ5J §Change: Batch 6: the end row and the chat (R137–R139)

## What to Build

`HudMessage` carries its world and the slot drops one from a world not standing; `mountHud` takes the
builder and shares `hearHud` with the stand-in, which reads what it built from its own builder;
`UiHudSlot.piece` goes; the corner row's hover label at 1001.

## Acceptance Criteria

- [x] A late message from a world that has left draws nothing (R137).
- [x] `mountHud`'s relayout and end through its real wiring (R138); the stand-in shares the wiring.
- [x] The corner label stands over a card rebuilt down → up (R139).
- [x] Full vitest, tsc, lint, lint:fence.

## Blocked By

None

## TDD Approach

- RED: `uiSceneHud.test.ts` (the late message, `mountHud` on a stand-in scene and a viewport change),
  `cornerLabel`'s depth.
- GREEN: the world in each `hud` message, `hearHud`, the label's depth.
