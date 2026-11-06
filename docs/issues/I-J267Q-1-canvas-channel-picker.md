---
id: I-J267Q-1
status: in-progress
implements: FS-J267Q
blocked_by: []
labels: [ready-for-agent]
title: "FS-J267Q slice 1: the channel picker drawn on the canvas and picked with the pointer (game-client)"
---
Implements FS-J267Q §Requirements R1–R4, R6–R8

## What to Build

The input row's browser element becomes the text field alone; the channel picker moves onto the
canvas in the chat window's own look.

- The picker: the current channel's name and a `▾` in its colour, the divider beside it and the
  row's frame, drawn on the canvas; the same face idle and typing (R1, R2).
- Pressing it opens the input (unless something else owns the keys) and toggles a list that
  opens upward over the chat lines, never over the field: near-black ground, fine brass frame,
  the shown channels in their colours, a hover highlight, closed channels dim and unpickable,
  Trade absent (R3).
- A release on a pickable row picks it through `ChatInput.pick` and keeps the field focused; a
  press outside closes the list; the picker and the open list are covered by the window, so a
  press there never moves or attacks (R4).
- The list closes with the input, on typing and on a change of the logical view (R6).
- The field's accessible name is `Chat — <Channel>`, kept in step with every channel change (R7).
- Crisp at the render scale; the picker hides with the field; the list with it (R8).

## Acceptance Criteria

- [ ] The browser element holds the text field only; no `<select>` is made.
- [ ] The picker reads the current channel in its colour with a `▾`; the divider is on the canvas.
- [ ] Pressing the picker opens the input and a list above the input row, inside the message
      area, not over the field; rows Area, World, Party, Whisper in their colours; Trade absent;
      a closed channel dim and inert on release.
- [ ] Releasing on World with `hi` typed leaves `#hi`, the picker on World, the list shut, the
      field focused.
- [ ] A press outside the list closes it; `covers` holds for the picker and the open list.
- [ ] The field's accessible name is `Chat — <Channel>` after each channel change.
- [ ] The picker hides with the field while an overlay owns the keys; the list closes then.
- [ ] Palette tokens only; tsc, vitest, lint and lint:fence pass.

## Blocked By

None

## Spec Reference

FS-J267Q §Requirements R1–R4, R6–R8, with their §Acceptance Criteria and §Edge States;
supersedes FS-WJGFJ's 2026-10-31 R28 picker and R26 idle-row notes.

## TDD Approach

- RED: `chatWindowLayout` places the picker, the field's slot right of it, and the list's rows
  above the input row; `ChatWindow` with a fake field: a press on the picker opens the input and
  the list, a release on World picks it, a press outside closes it.
- GREEN: layout functions, a canvas picker in the window, the DOM factory without the select.
