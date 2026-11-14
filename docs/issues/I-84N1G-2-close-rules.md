---
id: I-84N1G-2
status: open
implements: FS-84N1G
blocked_by: [I-84N1G-1]
labels: [ready-for-agent]
title: "FS-84N1G slice 2: another window opening closes the controls panel silently; Esc and Q close it first"
---
Implements FS-84N1G §Requirements C, E (R11, R12, R16–R19)

**Lane: AFK (agent).** game-client only.

## What to Build

- Once a frame, the UI scene hands the controls slot which windows are open (the menu slot, the gear's
  inventory, character panel and stash, the container view, the party panel, the record, the world's
  letter panel); one shut last frame and open now closes the panel, silently (R16).
- Esc's first step is the open controls panel, with `dialog_cancel` (R17).
- Q closes the open controls panel first, with `dialog_cancel`; else the gear, else the container (R18).

## Acceptance Criteria

- [ ] Each window opening closes the open panel within the frame, and the action plays only its own sound.
- [ ] A window already open as the panel opens leaves it open.
- [ ] Esc and Q close the open panel and nothing else, with `dialog_cancel`.
- [ ] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

I-84N1G-1.

## Spec Reference

FS-84N1G R12, R16–R19.

## TDD Approach

- RED: `escapeStep` with the controls open returns `controls`; the slot's `sync` closes on a window opening.
- GREEN: the step, the sync and the UI scene's update call.
