---
id: I-1SEF0-2
status: open
implements: FS-1SEF0
blocked_by: [I-1SEF0-1]
labels: [blocked]
title: "FS-1SEF0 slice 2: the enlarged minimap, 324 × 162, drawn at its size with no blur, the column moving down with it (game-client)"
---
Implements FS-1SEF0 §B, §D

## Files it expects to touch

- `game-client/src/ui/minimap.ts` + test (a panel look per size: panel, inset, rim, glyph grid,
  edge and dot sizes; the vignette per size; `setMode`).
- `game-client/src/ui/topRightColumn.ts` + test (the minimap's size, not a flag).
- `game-client/src/ui/positionReadout.ts` + test if its rect changes shape.
- `game-client/src/scenes/BarrowspireScene.ts` + test (the column with the enlarged map).

## What to Build

In the enlarged mode the minimap is 324 × 162 at the column's top: grid lengths 1.5 × rounded to
whole px (inset 6, rim 2, glyphs 14 × 14 by nearest whole-px spans), the walls' line and the dots
1.5 × exactly, the vignette painted for that size; the floor indicator, the escaped count and the
readout keep their gaps under or inside it. Switching sizes redraws once.

## Acceptance Criteria

- [ ] FS-1SEF0 §Acceptance Criteria, the enlarged items: sizes and rounding; redraw once on a switch;
      the column at 1080 and 1280 (y 212, the gaps, the readout); the clearances, with the notice
      widths and the boss frame's 729 against 746.
- [ ] Typecheck, lint and the full vitest suite pass.

## Blocked By

I-1SEF0-1

## Spec Reference

FS-1SEF0 §B.8–§B.12, §D.21–§D.22; User Stories 2–4, 19–21.

## TDD Approach

- RED: `topRightColumn` with a 324 × 162 minimap at width 1080 puts the floor indicator's top at 212.
- GREEN: the column by size, then the minimap drawing at the enlarged look.
