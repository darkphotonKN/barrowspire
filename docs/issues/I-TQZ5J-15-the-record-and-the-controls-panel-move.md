---
id: I-TQZ5J-15
status: done
implements: FS-TQZ5J
blocked_by: [I-TQZ5J-14]
labels: [ready-for-agent]
title: "FS-TQZ5J phase 3, slice 3: the settlement record and the run's controls panel (H) move into the UI scene"
---
Implements FS-TQZ5J §Change: Phase 3: the gear, the container view, the settlement record and the controls panel (R50, R52, R54, R56–R59, R61, R62; the note on ADR-0083 2.3)

**Lane: AFK (agent).** game-client only.

## What to Build

- The run sends its record (`record`) as its view and open state; the UI scene draws it at the shared
  anchor, its Close playing `menu_click` before `close: record`, its hover `menu_hover` (R57).
- The controls panel is built by the UI scene in the run, toggled by H (refused under the menu and
  after the end), drawn at 1200 over the party panel, with a ground (R56, R59, R61, R62); the run binds
  no H.
- The run's end closes the controls panel silently (R58).

## Acceptance Criteria

- [x] The run builds no `SettlementRecord` or controls panel and binds no H.
- [x] The record's first open, copies, SETTLEMENT toggle, held town and Close as today (FS-GV8WN R19–R25,
      §Change: The settlement record scrolls; FS-WDM0X § Pass 2b E1–E5).
- [x] H opens and closes the controls panel as today, the ability's name the class's; a press on it is
      the panel's (R61).
- [x] Every record and controls test that read the run still passes, moved with the code.
- [x] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

I-TQZ5J-14.

## Spec Reference

FS-TQZ5J §Change: Phase 3 (R50, R52, R54, R56–R59, R61, R62, the note); FS-GV8WN §G; FS-WDM0X § Pass 2b.

## TDD Approach

- RED: the UI scene's record slot draws the run's record and sends `close: record` after `menu_click`;
  the controls slot toggles on H, refused under the menu and after the end.
- GREEN: the record and controls slots, the run's `record` sends and answers.
