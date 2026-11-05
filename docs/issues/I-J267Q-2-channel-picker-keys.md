---
id: I-J267Q-2
status: in-progress
implements: FS-J267Q
blocked_by: [I-J267Q-1]
labels: [ready-for-agent]
title: "FS-J267Q slice 2: Tab cycles the channel, the open list answers the arrows, Enter and Esc (game-client)"
---
Implements FS-J267Q §Requirements R5

## What to Build

- In the focused field, Tab picks the next pickable channel (wrapping), Shift+Tab the previous;
  the browser's focus move is prevented; while an input method composes the keys are its own.
- With the list open: ↑/↓ move the highlight over pickable rows (stopping at the ends), Enter
  picks and sends nothing, Esc closes only the list (the input stays open with its draft, the
  game's ESC menu never opens); Tab closes the list and picks the next channel.

## Acceptance Criteria

- [ ] Tab picks the next open channel and wraps; Shift+Tab the previous; default prevented;
      nothing while composing.
- [ ] With the list open: ↓/↑ over pickable rows only; Enter picks, sends nothing; Esc closes the
      list and leaves the input open with its draft.
- [ ] Every channel but the current closed: Tab stays.
- [ ] tsc, vitest, lint and lint:fence pass.

## Blocked By

I-J267Q-1 (the list it drives)

## Spec Reference

FS-J267Q §Requirements R5, its §Acceptance Criteria and the "every channel but the current one
closed" §Edge States entry.

## TDD Approach

- RED: `ChatInput` with a fake field: `keyDown("Tab")` moves area → world → party → whisper →
  area; with the list open, `ArrowDown` then `Enter` picks without sending; `Escape` leaves the
  input open.
- GREEN: the key routing in `ChatInput`, `preventDefault` for Tab in the DOM field.
