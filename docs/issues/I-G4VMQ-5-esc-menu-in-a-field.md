---
id: I-G4VMQ-5
status: open
implements: FS-G4VMQ
blocked_by: [I-R82NV-13]
labels: [ready-for-agent]
title: "FS-G4VMQ change slice: Esc in a field closes what is open, then opens the town's menu; Change character leaves the field for the roster (game-client)"
---
Implements FS-G4VMQ §Change: The ESC menu in a field world

## What to Build

The field's Esc runs the town's order (gear overlay, party panel, then the menu); the menu is the
town's (`showMenuPanel`, `hubMenuChoices`); *Change character* sends one `leave_hub` and
`world_left` starts `MainMenuScene`, an error is a passing notice; while open the menu owns the
keys and presses; it is re-centred on resize.

## Acceptance Criteria

- [ ] FS-G4VMQ § Change acceptance criteria, all five.
- [ ] Whole client vitest, `tsc --noEmit`, `npm run lint` pass.

## Blocked By

I-R82NV-13 (the party panel's Esc step)

## Spec Reference

FS-G4VMQ § Change: The ESC menu in a field world, C1–C5.

## TDD Approach

- RED: a field with nothing open opens a menu on Esc showing "Change character" and "Back  [Esc]".
- GREEN: the field's Esc, menu and leave listeners.
