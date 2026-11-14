---
id: I-WDM0X-9
status: open
implements: FS-WDM0X
blocked_by: []
labels: [ready-for-agent]
title: "FS-WDM0X § Change pass 2b (the run's end): dialog_open as the record or the resolved card pops up, and the end's buttons' sounds"
---
Implements FS-WDM0X §Change: Menu, dialog and notice sounds (pass 1), § Pass 2b: the run's end (E1–E7)

**Lane: AFK (agent).** game-client only.

## What to Build

- `dialog_open` once as the run's end pops up: the first of the resolved card and the settlement
  record in a run; nothing on a redraw, a later copy or a resize (E1, E2).
- SETTLEMENT: `dialog_open` bringing the record back, `menu_click` taking it down (E3).
- `menu_hover` / `menu_click` on WATCH THE DELVE, LEAVE THE BARROW (card, corner, row), SETTLEMENT and
  the record's CLOSE; `menu_error` on a dimmed LEAVE THE BARROW, which now takes its press (E4–E6).
- Every play by the run's `this.ui.play`, the UI scene's one player; nothing else changes (E7).

## Acceptance Criteria

- [ ] Pass 2b's criteria (E1–E7), each once per action.
- [ ] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

None.

## Spec Reference

FS-WDM0X §Change: Menu, dialog and notice sounds (pass 1), § Pass 2b: the run's end.

## TDD Approach

- RED: in `BarrowspireScene.test.ts`, over the run's heard sounds (`hearOn`): a settlement and a
  dead state, in either order, chime once; redraws chime nothing; each button's hover, press and
  dimmed press play their one effect.
- GREEN: the end's one chime in the run scene; the sounds in `worldButton`; a hover hook on
  `SettlementRecord`'s CLOSE.

## Where each sound plays (for the listening check)

| Sound | Piece | Trigger |
|---|---|---|
| `dialog_open` | settlement record / resolved card | the first of them to appear in a run (solo death, escape, a party death) |
| `dialog_open` | SETTLEMENT (row) | pressed while the record is down |
| `menu_click` | SETTLEMENT (row) | pressed while the record is up |
| `menu_hover` | WATCH THE DELVE, LEAVE THE BARROW (card, corner, row), SETTLEMENT, CLOSE | the pointer comes onto a live one |
| `menu_click` | WATCH THE DELVE, LEAVE THE BARROW, CLOSE | pressed |
| `menu_error` | LEAVE THE BARROW | pressed while dimmed (a leave unanswered) |
