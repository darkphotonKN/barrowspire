---
id: I-TQZ5J-10
status: open
implements: FS-TQZ5J
blocked_by: [I-TQZ5J-9]
labels: [blocked]
title: "FS-TQZ5J phase 2, slice 2: the invite prompt and the ready check move into the UI scene"
---
Implements FS-TQZ5J §Change: Phase 2: the party (R36, R38, R40, R44, R46 for the prompt and the ready check)

**Lane: AFK (agent).** game-client only.

## What to Build

- The UI scene builds the invite prompt in every world and the ready check in the town (R36).
- The interface carries `blockers().popups` and `layout().chatTop` (R38).
- Each shown prompt and the ready check stand an interactive ground under their buttons (R40); the
  field's and the run's `panelTakes` stop testing `invitePrompt.covers`.

## Acceptance Criteria

- [ ] No world mounts the prompt or the ready check; the ready check only in the town.
- [ ] They hide by `blockers().popups` and stack above `layout().chatTop`.
- [ ] A press on a prompt's or the check's ground reaches no world handler.
- [ ] Before/after screenshots against ecb92ba9: one and two prompts, a run's greyed Accept, the ready
      check (waiting, answered, the leader's), in each world they show, at 1, 1.5 and 2, windowed and
      fullscreen; pixel-equal but R46's cases.
- [ ] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

I-TQZ5J-9: the party slot and the bridge's blockers.

## Spec Reference

FS-TQZ5J §Change: Phase 2: the party (R36, R38, R40, R44–R46).

## TDD Approach

- RED: the party slot builds a prompt in each world and a ready check in the town only; the prompt's
  `hidden` reads `blockers().popups`, its floor `layout().chatTop`.
- GREEN: the slot's mount and the worlds' reports.
