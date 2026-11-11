---
id: I-56CKV-1
status: open
implements: FS-56CKV
blocked_by: []
labels: [ready-for-agent]
title: "FS-56CKV slice 1: the minimap drawn candle-lit in stone: vignette, outlined regions, fixture glyphs, ringed dots, in its unchanged frame (game-client)"
---
Implements FS-56CKV §A, §E

## Files it expects to touch

- `game-client/src/ui/minimap.ts`, `game-client/src/ui/minimap.test.ts`
- `game-client/src/utils/canvasPalette.ts` (the `minimapExplored` / `minimapVisible` values; a
  `minimapEdge` token only if no existing one fits), and its test if a token is added
- `game-client/docs/design-guideline.md` ("UI Chrome": the Minimap bullet)
- Not `BarrowspireScene.ts`: the minimap's drawing is self-contained behind `MinimapStage`. If the
  vignette needs a canvas texture, widen `MinimapStage` and its one construction site in the scene
  by a single line.

## What to Build

Redraw the inside of the minimap, frame untouched. The backing and the 1 px brass rim stay exactly
as `drawMap` draws them today. Inside the rim, bottom to top: the region fills, explored a dark
stone and visible a step lighter; a 1 px edge along each seen region's footprint outline (the
union of its cells, a shared boundary drawn once); a soft `inkDeep` vignette strongest at the
rim's inside edge, drawn once per minimap, smooth at scales 1–2 and the same under both renderers
(a canvas texture's gradient, as `utils/atmosphere.ts` does, or fine steps; never
`fillGradientStyle`, which is WebGL only); then the switch, escape door and stairs as drawn glyphs
(a lever, an arch, a few steps) in `interactable` on a 1 px `markerStroke` ring, within 9 × 9 px.
The dots layer keeps today's rule (ally r 2, self r 3, 1 px `markerStroke` ring, self last), now
pinned by a test. Name the vignette's reach and edge alpha, the edge line and the glyph sizes as
constants. Add the "Minimap" bullet to the guideline's "UI Chrome".

## Acceptance Criteria

- [ ] FS-56CKV §Acceptance Criteria, the minimap items: frame unchanged and never drawn over; the vignette's ink, place, once-only draw and smoothness; the draw order; the fill and edge contrast ratios; outline edges (no edge between a region's own cells, a shared edge once); the three distinct glyphs, their size, ring, place and ink vs ring ≥ 3:1; the dots' radii, rings and order; size, inset, projection, content and redraw counts unchanged.
- [ ] No raw colour literal outside the palette files; the token fence passes.
- [ ] Headless captures at render scales 1, 1.5 and 2 on the fixture floor (explored and visible regions, all three fixtures found, two dots), checked by eye.
- [ ] The design guideline's "UI Chrome" has the Minimap bullet, marked "Added by FS-56CKV".
- [ ] No dev-gallery card or family added.
- [ ] Typecheck and `npx vitest run --maxWorkers=4 --minWorkers=1` pass.

## Blocked By

None

## Spec Reference

FS-56CKV §A.1–§A.8 (the look), §E.23–§E.24 (guideline bullet, no gallery card); User Stories 1–7, 20–23.

## TDD Approach

- RED: a `minimap.test.ts` case over the recording stage: after the rim's `strokeRect`, no call touches the rim's px; a two-cell-rect room draws its outline and no segment between its own rects.
- GREEN: the edge outline from the region's cells, then the vignette, glyphs and token values.
