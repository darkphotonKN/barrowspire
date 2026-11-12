---
id: I-56CKV-8
status: in-progress
implements: FS-56CKV
blocked_by: []
labels: [ready-for-agent]
title: "FS-56CKV change: a map mode icon in the minimap's bottom-left with a hover hint, a press doing what M does, and the dev readout moved to the top-right (game-client)"
---
Implements FS-56CKV §Change: Map mode icon

## What to Build

Owner, 2026-11-12: "右上角地圖左下角多加小icon hover顯示可以切換大小或是模式(M)". In a run, the town
and a field, a small amber nested-squares glyph stands 4 px inside the minimap's bottom-left
corner, normal and enlarged; with the overlay up, left of the fullscreen button in its corner.
Hovered it brightens and shows "Map mode (M)" beside the map in the fullscreen hint's look (the
canvas item tip's ground); a press steps the mode exactly as M does, under M's guards, and is never
an attack. The dev readout moves to the map's top-right (FS D8, amended before the build: the
bottom-right corner is too small on floor 1).

## Files it expects to touch

- `game-client/src/ui/minimapModeIcon.ts` + test (new): the glyph, its place per mode, hit area,
  hover hint and press.
- `game-client/src/ui/topRightColumn.ts` + test: the icon's place with the corner.
- `game-client/src/ui/positionReadout.ts` + test: the top-right.
- `game-client/src/ui/minimap.ts`, `src/ui/itemTip.ts`: the glyph's rects and the tip's ground shared.
- `game-client/src/ui/worldMinimapController.ts` + test: the town's and field's icon.
- `game-client/src/scenes/BarrowspireScene.ts`, `HubScene.ts`, `FieldScene.ts` + tests: built,
  placed, pointer routed, guards.
- `game-client/docs/design-guideline.md`, `game-client/CONTEXT.md`.

## Acceptance Criteria

- [ ] FS-56CKV §Change: Map mode icon, every Acceptance Criterion but the browser check.
- [ ] Typecheck, lint and the full vitest suite pass.
- [ ] **Owner browser check (Nick):** a run's floor 1, the town and a field, at 1080 and 1280 wide,
      each mode: the icon's glyph and place (bottom-left of the map; beside the fullscreen button
      in the overlay), the hint on hover, a click stepping the mode as M does, the readout in the
      map's top-right; and whether the overlay's place beside the button reads well.

## Blocked By

None

## Spec Reference

FS-56CKV §Change: Map mode icon, D1–D9.

## TDD Approach

- RED: the icon's box per mode at 1080 and 1280 (`topRightCorner`), none without a map; its hit
  area and glyph; the hint's words, place and look; a press = M with each scene's guards and the
  stored key, never an attack; the readout's top-right.
- GREEN: `minimapModeIcon.ts`, the corner's place, the scenes' routing, the readout's corner.
