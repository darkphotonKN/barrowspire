---
id: I-TQZ5J-53
status: done
implements: FS-TQZ5J
blocked_by: [I-TQZ5J-50, I-TQZ5J-52]
labels: [ready-for-agent]
title: "FS-TQZ5J batch 6, slice 4: chat moves into the UI scene, under the covered rule"
---
Implements FS-TQZ5J §Change: Batch 6: the end row and the chat (R125–R134)

## What to Build

`uiSceneChat.ts` (`UiChatSlot`, `chatWiring`) and `chatPiece.ts` (the window on the UI scene); the
world's `blockers().chat`; `UiState.typing` and `reportWorld`'s keyboard guard; the window's grounds and
the covered rule by Phaser's top-most hit; `keepsField`; the invite floor from the UI scene's window; the
worlds lose their windows, `panelTakes`, `layout()`; `coveredAt`, `overUi`, `MailboxHud.covers` and
`LetterPanel.covers` go.

## Acceptance Criteria

- [x] No world imports `ChatWindow`; the slot builds it per world and takes it down as it leaves (R125).
- [x] `mayOpen`/`keepsDraft` as each world's old rule (R126); `typing` reported; world keyboard off and
      back, the run's end order (R127, R128).
- [x] Grounds; the covered rule for press, move, release, wheel and hover; the record's wheel (R129, R130).
- [x] `keepsField`; the invite floor (R131, R132).
- [x] The chat's own tests pass as moved; full vitest, tsc, lint, lint:fence.

## Blocked By

I-TQZ5J-50 (the row must not meet the window first), I-TQZ5J-52 (the mailbox's types)

## TDD Approach

- RED: `uiSceneChat.test.ts` (the slot per world, the wiring's rules, typing reported, the floor);
  `ChatWindow.test.ts` (the covered rule by `currentlyOver`, the grounds, `keepsField`); `uiBridge`'s
  keyboard guard; the worlds' tests that no world builds a window.
- GREEN: the slot, the piece, the bridge's `typing` and `chat` blocker, the worlds' cuts.
