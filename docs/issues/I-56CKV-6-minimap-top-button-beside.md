---
id: I-56CKV-6
status: open
implements: FS-56CKV
blocked_by: []
labels: [ready-for-agent]
title: "FS-56CKV change: the minimap at the very top, the fullscreen button to its left, the column's lines moved up with it (game-client)"
---
Implements FS-56CKV §Change: Minimap at the top, fullscreen button beside it

## What to Build

In a run, the town and a field, the normal minimap stands at the very top of the top-right corner
(y 10) with the fullscreen button to its left, top-aligned, 6 px off; the floor indicator, the
escaped count and the dev readout follow the map's bottom up. Enlarged, the button goes back to the
corner and the enlarged map stands under it at y 44, as today; the overlay and every world or floor
with no minimap keep the button in the corner. The scene hands the button its place with the
column's layout; a scene's end hands the corner back.

## Files it expects to touch

- `game-client/src/ui/topRightColumn.ts` + test: the corner by mode, the button's place.
- `game-client/src/render/viewport/fullscreenButton.ts` (+ new test): the place handed to the button.
- `game-client/src/components/FullscreenButton.tsx` + test, `src/app/globals.css`: the button at
  its place.
- `game-client/src/scenes/BarrowspireScene.ts` + test, `src/ui/worldMinimapController.ts` + test,
  `src/scenes/HubScene.test.ts`, `src/scenes/FieldScene.test.ts`.

## Acceptance Criteria

- [ ] FS-56CKV §Change: Minimap at the top, fullscreen button beside it, every Acceptance Criterion
      but the browser check.
- [ ] Typecheck, lint and the full vitest suite pass.
- [ ] **Owner browser check (Nick):** a run's floor 1, the town and a field, at 1080 and 1280 wide,
      windowed and fullscreen, M through normal, enlarged and the overlay: the map at the very top
      with the button at its left in normal; the button in the corner, the map under it, enlarged;
      the button in the corner over the overlay; the floor line and the escaped count right under
      the map with no gap above it.

## Blocked By

None

## Spec Reference

FS-56CKV §Change: Minimap at the top, fullscreen button beside it, C1–C8 (FS-ZAJMH R18, FS-1SEF0
§B.8 and §D.21, FS-P0HSP §G.35 point there).

## TDD Approach

- RED: `topRightColumn` at 1080 and 1280 with the normal map puts it at y 10 and the button at its
  left; the run scene's floor indicator stands at 124 under the normal map and M moves the button.
- GREEN: the corner by mode and the button's place in `topRightColumn`, the place's store, the
  button reading it, the scenes handing it.
