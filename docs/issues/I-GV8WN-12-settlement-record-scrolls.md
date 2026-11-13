---
id: I-GV8WN-12
status: done
implements: FS-GV8WN
blocked_by: []
labels: [ready-for-agent]
title: "FS-GV8WN slice 12: the settlement record lists every row in one wheel-scrolled area"
---
Implements FS-GV8WN §Change: The settlement record scrolls

**Author: agent.** Client only. No server change, no WS `settlement` payload change (R19), no
`LetterPanel` refactor, no thin-line rewording.

## What to Build

The record drops its cap and scrolls, end to end:

- **settlement.ts (S1):** `settlementRecord` returns every carried and lost row (unsafe ahead of
  consumed, as now). `RECORD_ROWS_SHOWN`, `carriedMore` and `lostMore` are removed from the module
  and `RecordView`.
- **Layout (S2–S4), pure and tested:** rows per first column `max(4, ⌈n/2⌉)`, column-major, a
  column as tall as its rows; a section's height (heading 20 + column height × 20 + 8; the empty
  carried line as today); the content height of both sections; the area height
  `min(content, 216, anchor.bottom − TOP_MARGIN − 198)`, never below 20 px; the offset clamp
  `[0, content − area]`; the thumb's rect (4 px wide in the right padding, length the share in
  view, at least 16 px, placed by the share scrolled), or none when it fits. Put these beside the
  record (exported from `SettlementRecord.ts` or `settlement.ts`), not in a new shared module.
- **SettlementRecord.ts (S3, S5):** the title band, status line, earned and delve lines, frame and
  CLOSE stay in the Container, placed as today, with the panel height `198 + area`. The headings and
  rows are camera-fixed Texts at screen positions in **one Layer** at `RECORD_DEPTH`, above the
  frame, masked **once** with `maskInView(layer, shape, scene.cameras.main)`; the shape is a
  `scene.make.graphics({}, false)` filled by `fillMaskArea` over the area's screen rect (follow
  `ChatWindow.ts` `shapeMask`, including the Layer's `scrollFactorX/Y: 0`). Do **not** mask the
  Container. Watch `viewport.onChange` for a new render scale and redraw the shape in place (as
  `LetterPanel.shapeBodyMask`); end the watch on `close()` and on scene end (`onSceneEnd`,
  `scenes/sceneEnd.ts`), since the scene drops the record on teardown without closing it. Scroll by
  moving the Layer's Texts (or one offset applied to them), never by rebuilding the panel.
- **Wheel (S6):** the blocker and the Close hit area each listen for the game-object `wheel`
  (`(pointer, dx, dy, dz, event)`): step `Math.sign(dy) × 24`, clamp, redraw the thumb, and always
  `event.stopPropagation()`, so the scene's `wheel` (chat window, gear overlay) is not emitted
  (Phaser 4.2.1 `InputPlugin#processWheelEvent`). Nothing else listens on the scene's `wheel` for
  the record.
- **Thumb (S7):** one Graphics above the Layer, `palette.frame`, no track, drawn only on overflow,
  redrawn on every scroll; no hit area.
- **State (S8):** a status-only `set()` keeps the offset (the existing status-line path); a new
  body opens at the top; `relayout()` keeps the offset, clamped to the new area; `close()` then
  `open()` opens at the top.
- Widen the record's `Stage` type only as far as it now needs (`make`, `cameras`, `events`), and
  extend the test stand-in in `SettlementRecord.test.ts` with a `layer`, `make.graphics`,
  `cameras.main` and the game-object `wheel` handler with a stoppable event.

## Files it expects to touch

- `game-client/src/ui/settlement.ts`, `game-client/src/ui/settlement.test.ts`
- `game-client/src/ui/SettlementRecord.ts`, `game-client/src/ui/SettlementRecord.test.ts`
- Reused, not edited: `game-client/src/render/viewport` (`maskInView`, `fillMaskArea`, `viewport`),
  `game-client/src/scenes/sceneEnd.ts` (`onSceneEnd`).
- Not expected: `BarrowspireScene.ts` (its `settlementRecord(payload)` / `new SettlementRecord(...)`
  calls keep their shape). If the scene has to change, say why in the PR.

## Acceptance Criteria

- [ ] A settlement with 11 carried and 3 lost items draws all 14 names and their marks, and no "and n more" text.
- [ ] `RECORD_ROWS_SHOWN`, `carriedMore` and `lostMore` no longer exist; `carried` and `lost` hold every row.
- [ ] Sections of up to 8 rows each draw every text at the same place and the panel at the same size as before.
- [ ] 9 rows lay out 5 + 4, 11 rows 6 + 5, column-major.
- [ ] The area is at most 216 px; the panel stays between 8 px from the top and its anchor, at most 414 px.
- [ ] A fitting record draws no thumb and a wheel moves nothing (but is still stopped).
- [ ] An overflowing record: a notch down moves the headings and rows up 24 px, the fixed parts stay; the offset stops at 0 and at the end.
- [ ] A wheel on the blocker or on Close calls `stopPropagation`; nothing is registered on the scene's `wheel`.
- [ ] One Layer, one `maskInView` per open, its shape filled by `fillMaskArea` over the area; a render-scale change refills the shape without a second mask; the watch is released on close and on scene end.
- [ ] The thumb: overflow only, `palette.frame`, in the right padding, length and place following the offset, no hit area.
- [ ] Confirmed copy keeps the offset; new body at the top; relayout keeps it clamped; close + reopen at the top.
- [ ] `npm run lint`, `npx tsc --noEmit` and `npm test` (game-client) pass.

## Blocked By

None.

## Spec Reference

FS-GV8WN §Change: The settlement record scrolls — S1–S8, every Acceptance Criterion but the
by-eye one, and its Edge States.

## TDD Approach

- RED: `settlement.test.ts` "should list every row, with no count of the rest" (replaces "should
  show the first rows of a long list and count the rest"); `SettlementRecord.test.ts` "should draw
  a record of 8 rows a section exactly as before" and "should scroll an overflowing record 24 px a
  notch over the panel, and stop the wheel there".
- GREEN: drop the cap, add the pure layout, move the sections into the masked Layer, wire the
  wheel and thumb.
