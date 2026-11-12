---
id: I-R82NV-13
status: done
implements: FS-R82NV
blocked_by: []
labels: [ready-for-agent]
title: "FS-R82NV change slice: the party panel closes on its × and on Esc, and stands centred at 18% of the view's height (game-client)"
---
Implements FS-R82NV §Change: The party panel closes on its × and stands nearer the middle

## What to Build

The × in the panel's title row closes it; Esc closes it in the town, a field and a run, in the
order C2 gives (the field's menu step lands with I-G4VMQ-5); the panel, its × and the DOM invite
field stand at `round((W − 300) / 2)`, `round(0.18 × H)` and follow view-size changes; the invite
prompts and the ready check step right of the panel's new right edge.

## Acceptance Criteria

- [x] FS-R82NV § Change acceptance criteria, all six (the field's menu after the panel: I-G4VMQ-5).
- [x] The tests that pinned `PARTY_PANEL_X` 280 / y 56 are rewritten to the centred place, each citing this change.
- [x] Whole client vitest, `tsc --noEmit`, `npm run lint` pass.

## Blocked By

None

## Spec Reference

FS-R82NV § Change: The party panel closes on its × and stands nearer the middle, C1–C7.

## TDD Approach

- RED: `partyPanelFrame` at 1080 × 720 puts the panel at (390, 130) with a close rect at its top right; PartyPanel draws "×" and a press closes it; `close()` reports whether it closed.
- GREEN: layout, panel, the store's `closePanel`, the scenes' Esc and relayout.
