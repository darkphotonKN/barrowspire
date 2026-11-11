---
id: I-56CKV-2
status: open
implements: FS-56CKV
blocked_by: []
labels: [ready-for-agent]
title: "FS-56CKV slice 2: the top-right column re-ordered: the minimap at the top, the floor indicator and the escaped count under it at 12 px, closing up where no minimap is shown (game-client)"
---
Implements FS-56CKV §B

## Files it expects to touch

- `game-client/src/scenes/BarrowspireScene.ts` (`createUI`, `relayoutHud`, `minimapPlace`,
  `toggleMinimap`, the floor build and teardown that create and destroy `dungeon.minimap`, the
  floor label setter)
- `game-client/src/scenes/BarrowspireScene.test.ts` (the "minimap in the top-right column" and
  "the minimap (FS-SRA9J §E)" blocks, and the top-right HUD placement tests)
- `game-client/src/ui/minimap.ts`, `game-client/src/ui/minimap.test.ts` (`minimapRect` takes the
  column's top instead of the floor indicator's bottom)
- Recommended: a new pure helper, e.g. `game-client/src/ui/topRightColumn.ts` + test, that stacks
  the column (minimap shown or not, floor label or not) into rects, so the scene only applies them
  and the merge surface in `BarrowspireScene.ts` stays small.

## What to Build

Stack the top-right column from `anchorAt(TOP_RIGHT_HUD)`: the minimap's top at the column's top
when one is shown, the floor indicator 6 px under it, the escaped count 4 px under that; with no
minimap shown (no regions, map not in yet, M off) the floor indicator takes the top. A hidden
floor indicator closes up. Both lines at 12 px, padding 8 × 3, colours and backings unchanged.
Re-lay on resize, on M, on a floor built or left, and when the floor label changes; re-crispen the
texts.

## Acceptance Criteria

- [ ] FS-56CKV §Acceptance Criteria, the column items: order and gaps with a minimap at 1080 and 1280; 12 px and padding 8 × 3; closing up with no minimap shown in each of the three cases and with the floor indicator hidden; M re-lays both ways; resize re-anchors and re-crispens; no overlap with the fullscreen button, a 600 px top-centre notice or the target frame; the minimap's left edge ≥ 854 at 1080.
- [ ] FS-SRA9J's minimap tests that pinned "6 px under the floor indicator" are rewritten to this order, each citing FS-56CKV §B.
- [ ] Typecheck and `npx vitest run --maxWorkers=4 --minWorkers=1` pass.

## Blocked By

None

## Spec Reference

FS-56CKV §B.9–§B.13; User Stories 8–11, 14.

## TDD Approach

- RED: the column helper (or the scene test) stacks a 216 × 108 minimap at y 44 and the floor indicator's top at 158 at width 1080; with no minimap, the floor indicator's top at 44.
- GREEN: the helper, then the scene applying it at create, relayout, M and floor change.
