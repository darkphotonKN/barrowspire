---
id: I-Q18Q3-8
status: open
implements: FS-Q18Q3
blocked_by: [I-Q18Q3-3, I-Q18Q3-4, I-Q18Q3-6]
labels: [blocked]
title: "FS-Q18Q3 slice 8: the owner judges the bar's icons and the bar in game from the contact sheet, up to one round of tweaks (Kranti)"
---
Implements FS-Q18Q3 §K (R39), Acceptance Criteria "The owner has approved the contact sheet"

**HITL gate.** Kranti looks at I-Q18Q3-3's contact sheet and the bar's captures from I-Q18Q3-4 and
I-Q18Q3-6 (in a run and a field, 1080 and 1280, render scale 1, 1.5 and 2). An agent makes the one
round of tweaks he may ask for, in `game-client/src/ui/abilityIcons.ts` (icons) and
`game-client/src/ui/AbilityBar.ts` (the wells' detail) only, then re-shoots the same set with the
suite green. A second request is a new change, not this slice.

## Files it expects to touch

- `game-client/src/ui/abilityIcons.ts`, `game-client/src/ui/AbilityBar.ts` (tweak round only)

## What to Build

Nothing at first. Present the sheet and captures. Apply at most one round of tweaks.

## Acceptance Criteria

- [ ] Each icon reads as its ability at render scale 1, 1.5 and 2; no specks, no vanished cuts, no
      accidental faces (ADR-0080's check).
- [ ] Lit, greyed and active read apart; the greyed icon never brightens under the pointer.
- [ ] The bar reads serious and medieval beside the XP bar and the corner row, in a run and a field.
- [ ] Tweak round: round 1 ☐ (at most one). It re-shoots the set and keeps
      `npx vitest run --maxWorkers=4 --minWorkers=1`, `npx tsc --noEmit` and `npm run lint` green.
- [ ] The owner approves.

## Blocked By

- I-Q18Q3-3 (the icons and their sheet)
- I-Q18Q3-4 (the bar)
- I-Q18Q3-6 (the sweep, so the cooling state is on the sheet)

## Spec Reference

FS-Q18Q3 §K R39, §C R13–R17; Edge State "Render scale 1"; User Story 28.
