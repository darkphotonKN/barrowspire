---
id: I-TQZ5J-54
status: done
implements: FS-TQZ5J
blocked_by: [I-TQZ5J-53]
labels: [ready-for-agent]
title: "FS-TQZ5J batch 6, slice 5: the chat's sounds in the UI scene: one per press (MED1), two shut calls"
---
Implements FS-TQZ5J §Change: Batch 6: the end row and the chat (R135; FS-WDM0X § Amendment 2026-11-14)

## What to Build

A tab press with the list open plays `menu_tab` alone; `ChatInput.closePicker(byPlayer)` becomes
`closePicker()` (silent) and `dismissPicker()` (`menu_dropdown_close`).

## Acceptance Criteria

- [x] A tab press with the list open: `["menu_tab"]`, the list shut (R135).
- [x] Every other C1–C5 test holds.
- [x] Full vitest, tsc, lint, lint:fence.

## Blocked By

I-TQZ5J-53

## TDD Approach

- RED: `ChatWindow.test.ts` "a tab press with the list open plays menu_tab alone".
- GREEN: `pressPicker` shuts silently for a press on a tab; the two calls.
