---
id: I-56CKV-7
status: in-progress
implements: FS-56CKV
blocked_by: []
labels: [ready-for-agent]
title: "FS-56CKV change: the enlarged minimap at the very top with the fullscreen button at its left, and the button's hover hint (game-client)"
---
Implements FS-56CKV §Change: Minimap at the top, fullscreen button beside it

## What to Build

Owner, 2026-11-12: "1.5倍地圖時全螢幕按鈕一樣要在地圖左側" and "hover時也有要提示文字". In a run, the
town and a field, the enlarged (1.5 ×) minimap stands at the very top of the top-right corner (y 10)
like the normal one, the fullscreen button at its left, top-aligned, 6 px off; the floor indicator
and the escaped count follow the enlarged map's bottom up (178, 203). Only the overlay and no map
keep the button in the corner. The button shows a hint, "Fullscreen" or "Exit fullscreen", on hover
and on keyboard focus: below it in the corner, to its left beside the map; no pointer events,
tokens only.

## Files it expects to touch

- `game-client/src/ui/topRightColumn.ts` + test: the enlarged map beside the button.
- `game-client/src/render/viewport/fullscreenButton.ts` + test: the hint's side from the place.
- `game-client/src/components/fullscreen.ts`, `FullscreenButton.tsx` + test, `src/app/globals.css`:
  the hint.
- `game-client/src/scenes/BarrowspireScene.test.ts`, `src/ui/worldMinimapController.test.ts`,
  `src/scenes/HubScene.test.ts`, `src/scenes/FieldScene.test.ts`: the enlarged positions and M.

## Acceptance Criteria

- [ ] FS-56CKV §Change: Minimap at the top, fullscreen button beside it, every Acceptance Criterion
      marked *(Amended 2026-11-12, enlarged beside)* or *(Amended 2026-11-12, hint)* but the
      browser check.
- [ ] Typecheck, lint and the full vitest suite pass.
- [ ] **Owner browser check (Nick):** a run's floor 1, the town and a field, at 1080 and 1280 wide,
      windowed and fullscreen, M through normal, enlarged and the overlay: the enlarged map at the
      very top with the button at its left and the floor line right under the map; the button in
      the corner over the overlay; the hint on hover and on Shift+Tab, beside the button and on
      screen; and whether the button over the boss frame's right end at 1080 enlarged is acceptable.

## Blocked By

None

## Spec Reference

FS-56CKV §Change: Minimap at the top, fullscreen button beside it, C3, C4, C5, C7, C8, C9 as
amended 2026-11-12.

## TDD Approach

- RED: `topRightColumn` at 1080 and 1280 with the enlarged map puts it at y 10, the button at its
  left and the floor indicator at 178; the run's, town's and field's M moves the button to the
  corner only for the overlay; the button renders its hint, its side by its place, and the CSS keeps
  it hidden until hover or focus, with no pointer events.
- GREEN: the corner beside the map in both modes; the hint's words, side and rule.
