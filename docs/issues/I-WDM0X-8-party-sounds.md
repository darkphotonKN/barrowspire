---
id: I-WDM0X-8
status: done
implements: FS-WDM0X
blocked_by: [I-TQZ5J-11]
labels: [ready-for-agent]
title: "FS-WDM0X § Change pass 2 (party): the party's invite, ready check and button sounds"
---
Implements FS-WDM0X §Change: Menu, dialog and notice sounds (pass 1), § Pass 2: the party (P1–P8)

**Lane: AFK (agent).** game-client only.

## What to Build

- `notify_important` as a new invite enters the party store (P1); `dialog_open` as a new ready check
  does (P2).
- `dialog_confirm` / `dialog_cancel` on the prompt's and the ready check's Accept / Decline (P3, P4).
- `menu_hover` / `menu_click` on the live party buttons and Travel; `menu_error` on a greyed one,
  which now takes its press (P5–P7).
- The panel's open and close unchanged (P8).

## Acceptance Criteria

- [x] Pass 2's criteria (P1–P8), each once per action.
- [x] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

I-TQZ5J-11: every party piece in the UI scene, where the one player is.

## Spec Reference

FS-WDM0X §Change: Menu, dialog and notice sounds (pass 1), § Pass 2: the party.

## TDD Approach

- RED: per piece over a fake player: a received invite, an opened check, each button's hover, press
  and greyed press play their one effect.
- GREEN: a `play` (and hover) on the pieces' deps, wired to the UI scene's player.
