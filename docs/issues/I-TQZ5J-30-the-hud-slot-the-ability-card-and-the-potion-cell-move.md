---
id: I-TQZ5J-30
status: open
implements: FS-TQZ5J
blocked_by: []
labels: [ready-for-agent]
title: "FS-TQZ5J batch 5, slice 1: the HUD slot, and the ability card and the potion cell move into the UI scene"
---
Implements FS-TQZ5J §Change: Batch 5: the ability card, the potion cell and the HUD bars (R67–R73)

Numbered 30+ so as not to meet the ids the parallel batch-4 run takes on FS-TQZ5J.

## What to Build

The bridge's `hud(message)` (R68) and the UI scene's HUD slot (`uiSceneHud.ts`, its own file; the
pieces built on the UI scene by `hudPieces.ts`), built per world reported and taken down as it leaves
(R67, R69). The field's and the run's ability card and the run's potion cell are handed through it; no
world builds `AbilityHud` or `PotionHud`. The run still tells `abilityCard(up)` after the card, so the
controls badge keeps its card (R70).

## Acceptance Criteria

- [ ] `hud` crosses as plain data; `NO_UI` has it.
- [ ] The slot draws the card at `ABILITY_CARD_PLACE` in a field and the run, the cell right of the run's
      bars, nothing for a kind with no place in the world reported or with none reported; takes them
      down on a leave and builds anew for the next world; the card back to its corner on a relayout.
- [ ] A field and the run hand the card (greyed by the lockout and the parry, none for the dead, the
      escaped, the leave button); the run hands the cell; the badge stands over the card while it is up.
- [ ] No world scene imports `AbilityHud` or `PotionHud`.
- [ ] Full vitest, tsc, lint, lint:fence.

## Blocked By

None

## TDD Approach

- RED: `uiSceneHud.test.ts`: the slot builds the card at its place for a field and the run, none in the
  town, and takes it down on a leave; the world tests read the card off the bridge.
- GREEN: the slot, the bridge's `hud`, the worlds sending.
