---
id: I-MAMHR-9
status: done
implements: FS-MAMHR
blocked_by: [I-MAMHR-8, I-MAMHR-3]
labels: [ready-for-agent]
title: "FS-MAMHR slice 9: the merc draws from its baked sheet everywhere"
---
Implements FS-MAMHR §H (Requirement 42), §G (Requirement 31)

**Lane: agent** (game-client). Only after the user approved I-MAMHR-8's contact sheet.

## What to Build

- `characterSheet("mercenary")` returns `char_mercenary_base` instead of the knight sheet.
- Every place a class draws from a baked sheet draws the merc from its own: the run, the hub, the
  roster, character creation and the loadout (through `characterSheet()` / `menuFigure` where they
  already route).
- The merc's placeholder texture stays only as the placeholder fallback the other classes keep.

## Acceptance Criteria

- [ ] `animationSelect` test: `mercenary` maps to `char_mercenary_base`.
- [ ] The run, hub, roster, creation and loadout show the baked merc.
- [ ] Client tests pass.

## Blocked By

I-MAMHR-8 (approved contact sheet), I-MAMHR-3 (the client knows the merc).

## Spec Reference

FS-MAMHR §H Requirement 42, §G Requirement 31; §Acceptance Criteria "Art (gated)" row 3.

## Files expected

- `game-client/src/render/art/animationSelect.ts` + `animationSelect.test.ts`
- `game-client/src/render/art/menuFigure.ts` (only if it does not already route through `characterSheet()`)
