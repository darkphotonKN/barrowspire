---
id: I-3EBCA-6
status: done
implements: FS-G4VMQ
blocked_by: [I-3EBCA-5]
labels: [ready-for-agent]
title: "FS-3EBCA slice 6: the ESC menu, the inventory and the character panel wear the party panel's frame (game-client)"
---
Implements FS-G4VMQ §Change: The menu wears the party panel's frame (C1–C3); FS-HRH2J §Change: Character and inventory apart (C4, C16)

## What to Build

The party panel's frame (the carved ground and its ×, at its place) becomes one drawing,
`panelFrame`, that the party panel, the menu chrome (`showMenuPanel`: the town's, the field's and
the run's ESC menu, the Fall confirm) and the gear overlay's panels all call. The menu's × does
what Esc does; the overlay's × keeps its own hit test.

## Acceptance Criteria

- [x] FS-G4VMQ § Change acceptance criteria; FS-HRH2J § Change C16's.
- [x] Whole client vitest, `tsc --noEmit`, `npm run lint` pass.

## Blocked By

I-3EBCA-5

## TDD Approach

- RED: the party panel, `showMenuPanel` and the gear overlay each call `drawPanelFrame`; the
  menu's × closes it as Esc does; the overlay's × stands 12 px in.
- GREEN: `panelFrame.ts`, the three callers.
