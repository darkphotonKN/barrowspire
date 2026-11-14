---
id: I-TQZ5J-52
status: done
implements: FS-TQZ5J
blocked_by: []
labels: [ready-for-agent]
title: "FS-TQZ5J batch 6, slice 3: the mailbox's review leftovers (one wiring type, letterPanelState beside the store)"
---
Implements FS-TQZ5J §Change: Batch 6: the end row and the chat (R140)

## What to Build

`MailboxWiring` derived from `MailboxHudDeps` in `mailboxHud.ts`, imported by the slot from there;
`mailboxHud.ts` imports nothing of `uiSceneMailbox.ts`; `letterPanelState` in
`stores/letterPanelState.ts`.

## Acceptance Criteria

- [x] No import of `uiSceneMailbox` in `mailboxHud.ts` (pinned by test); the wiring type derived.
- [x] `letterPanelState` beside the store; the town reads it from there.
- [x] Full vitest, tsc, lint, lint:fence.

## Blocked By

None

## TDD Approach

- RED: a source test that `mailboxHud.ts` imports nothing of the slot; `letterPanelState`'s test from
  its new home.
- GREEN: the move.
