---
id: I-3EBCA-4
status: open
implements: FS-HRH2J
blocked_by: [I-3EBCA-2]
labels: [ready-for-agent]
title: "FS-3EBCA slice 4: the character panel (C) and the inventory (I, B) open apart, each with an ×; Esc and Q close both; the stash keeps the left side (game-client)"
---
Implements FS-HRH2J §Change: Character and inventory apart (C1–C11, C14, C15)

## What to Build

`GearOverlay` keeps two open states, the inventory (right) and the character panel (left), each
drawn, hit-tested and closed on its own, with an × at each panel's top right; `EquipmentHud` and
`HubGear` gain the character panel's toggle (the hub loading the loadout for "From gear" when it
opens alone, no purse read); the hub, the run and the field bind `C` beside `I` / `B` under the
same guards; Esc's overlay step and `Q` close both; `E` reaches the world while only the character
panel is open; at the stash chest the character panel closes and `C` does nothing. The right
panel's title reads INVENTORY; the run's H panel and the web controls list name I / B Inventory
and C Character.

## Acceptance Criteria

- [ ] FS-HRH2J § Change acceptance criteria 1–8 and 10 (the extent is slice 5's).
- [ ] Whole client vitest, `tsc --noEmit`, `npm run lint` pass.

## Blocked By

I-3EBCA-2

## Spec Reference

FS-HRH2J § Change: Character and inventory apart; FS-VPD8Y and FS-7TGZ3 stubs.

## TDD Approach

- RED: `show()` opens the inventory alone (no CHARACTER title, no stats rows); `showCharacter()`
  the character panel alone; each × closes its own panel; `hide()` closes both; a stash open
  closes the character panel and refuses `C`; the hub's character-alone open loads REST and reads
  no purse; C in each world toggles the character panel and leaves the inventory as it was; one
  Esc closes both; equipping by right-click and E unchanged.
- GREEN: the two open states in `GearOverlay`, the drivers' toggle, the scenes' C binding.
