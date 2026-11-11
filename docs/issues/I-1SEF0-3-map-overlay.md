---
id: I-1SEF0-3
status: open
implements: FS-1SEF0
blocked_by: [I-1SEF0-2]
labels: [ready-for-agent]
title: "FS-1SEF0 slice 3: the map overlay, the floor over the whole view at 40%, centred on the followed figure, moved not repainted (game-client)"
---
Implements FS-1SEF0 §C, §E

## Files it expects to touch

- `game-client/src/ui/minimap.ts` + test (the overlay look; `follow`, a position-only move).
- `game-client/src/scenes/BarrowspireScene.ts` + test (the per-frame follow of the camera's figure).
- `game-client/docs/design-guideline.md` ("Map overlay" bullet), `game-client/CONTEXT.md`
  ("Minimap", "Map overlay").

## What to Build

In the overlay mode the minimap's layers become a world-space map at 1/8 of the world's projection,
no backing, rim or vignette, the fill and the 2 px walls' line at 40%, glyphs and dots as enlarged at
full opacity, at depth 920, never interactive. Each frame it stands, on whole px, so the followed
figure's point on it lies on the figure; its map is redrawn only when the content changes.

## Acceptance Criteria

- [ ] FS-1SEF0 §Acceptance Criteria, the overlay items: its look, depth and input; its placement
      formula for the player and a watched teammate; its cost (redraws counted while walking, a
      frame-time measurement reported); rebuilt in mode after a floor change.
- [ ] The guideline's "Map overlay" bullet and `CONTEXT.md`'s terms; no gallery card.
- [ ] Headless captures of each mode at 1080 × 720 and 1280 × 720, looked at.
- [ ] Typecheck, lint and the full vitest suite pass.

## Blocked By

I-1SEF0-2

## Spec Reference

FS-1SEF0 §C.13–§C.20, §E.24–§E.26; User Stories 5–9, 18, 22–24.

## TDD Approach

- RED: in the overlay mode, `follow` of a figure at world f stands the layers at round((1 − 1/8)·worldToScreen(f)).
- GREEN: the overlay look in `setMode`, `follow`, then the scene calling it each frame.
