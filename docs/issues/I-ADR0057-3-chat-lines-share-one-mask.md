---
id: I-ADR0057-3
status: done
implements: ADR-0057
blocked_by: [I-ADR0057-2]
labels: []
title: "ADR-0057 slice 3: the chat window's lines share one mask (game-client)"
---
Implements ADR-0057 §Decision (Masks: one shared mask per area)

**Lane: agent (AFK).** game-client only.

## What to Build

The trial gives every chat line its own mask filter (`maskInView(t, this.maskShape, …)` per
`Text` in `ChatWindow`), so a full chat history is that many filter passes per frame. Give the
message area **one** mask that every line sits under, through `maskInView`, never a direct
`addMask`.

- The lines go in one camera-fixed holder (a `Container` or `Layer`, whichever keeps depth
  `HUD_DEPTH`, scroll factor 0 and the existing hit tests: name hits, scrolling, the
  scrollbar) and the holder is masked once by the message-area shape. Note that a Container is
  context-focused, so it relies on `maskInView`'s origin correction; a camera-fixed one with no
  size is the case `maskInView`'s scroll-factor correction does *not* cover. Prove which one
  holds, by a probe at render scale ≠ 1 with the camera scrolled, before choosing.
- The holder is re-masked (or its mask's source swapped with `setGameObject`) when the message
  area is rebuilt (`buildMask` / a resize / fold), never stacked.
- Lines clipped at the message area's top and bottom exactly as 3.90 clipped them.

## Acceptance Criteria

- [ ] With N chat lines drawn there is one mask filter for the message area, not N (test counts
      `maskInView` / `addMask` calls or filters on the holder).
- [ ] Rebuilding the area (resize, fold/unfold, tab switch) leaves exactly one mask.
- [ ] Probe at render scale 1.5 in the hub with the camera scrolled away from 0: a line half out
      of the message area is cut at the area's edge, not offset by the scroll or by half a view.
- [ ] Clicking a name, scrolling and the scrollbar still work (existing `ChatWindow.test.ts`
      green, updated only where it asserted per-line masks).
- [ ] `npx tsc --noEmit`, `npm test` pass.

## Blocked By

I-ADR0057-2 (pins `maskInView`'s behaviour and tests; this slice may need a holder-shaped case
there).

## Spec Reference

ADR-0057 §Decision "Masks": "Where one area masks many objects (the chat window's lines), they
share one mask rather than one filter each"; §Consequences "Masks cost a filter pass each".

## Expected files

`game-client/src/ui/ChatWindow.ts`, `src/ui/ChatWindow.test.ts`; possibly
`src/render/viewport/mask.ts` + `mask.test.ts` if a holder needs a case `maskInView` lacks.

## TDD Approach

- RED: `ChatWindow` with three lines masks one holder once (fake scene counts mask calls).
- GREEN: lines added to the holder; one `maskInView` in the mask build.

## Answer

**Probe design.** Headless Chrome (Playwright on system Chrome), WebGL, `antialias: true`,
logical view 1080×720, harness under the session scratchpad (`probe57/chat/` for the holder
choice and the cost run, `probe57/fix1/` for review fix round 1). Each build bundles the **real**
`ChatWindow` and the real viewport modules, with Phaser's canvas renderer out of play:

- **3.90** = HEAD's tree (`git archive HEAD`, the per-line geometry masks) + Phaser 3.90.0;
- **v4** = this branch + Phaser 4.2.1, `roundEveryObject(Phaser.GameObjects)` installed as
  `PhaserGame.tsx` does;
- **v4 before** = the same, with the round-1 hook (`GameObject.prototype` only, so the Layer
  kept `safeAuto`), or with the clip drawn as one plain `fillRect` (before `fillMaskArea`).

40 messages (one wrapped over several rows, mixed Latin/CJK, so a line straddles the area's top),
the camera scrolled to (333.7, 251.3) and snapped to the 1/rs grid, 300 world rects behind.
Two readings per build: **text** (the chat as drawn) and **clip** (a white rectangle larger than
the message area put under the chat's own mask: into the Layer on v4, `setMask(chat.mask)` on
3.90, with no messages so nothing else sits under it). Compared per backing px against 3.90.

**Holder choice (I-ADR0057-3 slice run, `probe57/chat/runA.cjs`).** A Layer holds: at rs 1, 1.5
and 2, with the camera scrolled and moving, its lines stayed put (the clip neither slid with the
world nor landed half a view off). A Container was resampled; per-line filters too. Kept.

**Clip rows (review fix round 1).** 3.90's geometry mask is a stencil in the game's multisampled
canvas, so where the area's edge falls inside a backing px (rs 1.25, 1.5) that px is let through
by the share covered, not wholly or not at all. Phaser 4's mask filter multiplies by the mask's
alpha (`FilterMask-frag.js`) from a texture with no multisampling. `fillMaskArea`
(`src/render/viewport/mask.ts`) now draws the area in whole backing px, each edge row/column at
its share, and the window redraws it on a render-scale change alone. Edge px of the clip
reading (min channel, 255 = let through whole, ~20–32 = the panel, not let through; top and bottom
at logical x 400, left and right at logical y 600):

| rs | area (backing px) | top row: 3.90 / before / now | bottom row: 3.90 / before / now | left col: 3.90 / before / now | right col: 3.90 / before / now |
|---|---|---|---|---|---|
| 1 | y 497–669, x 15–425 | 497: 255 / 255 / 255 | 669: 20 / 20 / 20 | 15: 255 / 255 / 255 | 425: 26 / 26 / 26 |
| 1.25 | y 621.25–836.25, x 18.75–531.25 | 621: 199 / 255 / 199 | 836: 81 / 23 / 80 | 18: 83 / 24 / 81 | 531: 83 / 24 / 81 |
| 1.5 | y 745.5–1003.5, x 22.5–637.5 | 745: 143 / 32 / 143 | 1003: 139 / 255 / 139 | 22: 140 / 255 / 137 | 637: 140 / 21 / 137 |
| 2 | y 994–1338, x 30–850 | 994: 255 / 255 / 255 | 1338: 23 / 23 / 23 | 30: 255 / 255 / 255 | 850: 26 / 26 / 26 |

"Before" is the review finding: at 1.5 the clip ran one backing row and column late (rows
746–1003 against 3.90's 745 half, 746–1002, 1003 half). Now every edge row and column is let
through by the same share as 3.90, within 3/255.

Px within ±2 of the area differing from 3.90 by more than 8/255: rs 1: 3 (max 12, the divider
ornament below the area, not the clip); rs 1.25: 288 (max 19; before: 1454, max 60); rs 1.5: 344
(max 26; before: 1748, max 174); rs 2: 1 (max 12, same ornament).

**Remaining delta (rs 1.25 and 1.5 only).** All of it sits on the area's **top row, under the
tabs** (cols ~23–362 at 1.5), up to 26/255 darker than 3.90. There the tab row's own fill ends on
the same half-covered backing px the area begins on; 3.90 kept the tab fill's samples and the
mask's samples apart inside that px (multisampling), Phaser 4 can only mask the resolved px.
Elsewhere on that row (e.g. logical x 400) the clip matches 3.90 exactly. For real lines, the delta
scales with how much glyph lies in that one row. Not removable without multisampling the mask
pass; left for Nick (unticked box in I-ADR0057-5).

**Text sharpness and fidelity (review fix round 1, P1).** Phaser 4.2.1 builds `Layer` by copying
`GameObject`'s methods (`Mixins`, `utils/Class.js` `extend`), so the round-1 hook on
`GameObject.prototype` never reached it: the Layer stayed `safeAuto`, `Filters.js` 356–359 handed
its filter camera `roundPixels = false` (a Layer's `rotation` is undefined, so `onlyTranslated`
is `NaN === 0`), and every line in it was drawn unrounded. Now every prototype in
`Phaser.GameObjects` that owns `willRoundVertices` is wrapped (tested against the real 4.2.1
classes). Inside the message area (sharpness = mean |horizontal luminance step|; fidelity = mean
per-px difference from 3.90, and the best whole-px shift against 3.90):

| rs | 3.90 sharpness | v4 now: sharpness / mean diff / best shift | v4 before (Layer unrounded): sharpness / mean diff / best shift |
|---|---|---|---|
| 1 | 13.26 | 13.48 / 2.68 / 0,0 | 13.38 / 2.17 / 0,0 |
| 1.25 | 10.64 | 11.20 / 3.33 / 0,0 | 10.41 / 3.97 / 0,0 |
| 1.5 | 9.29 | 9.94 / 3.02 / 0,0 | 8.99 / 5.88 / 0,0 (−1,0 at 5.97: smeared half a px) |
| 2 | 7.56 | 7.61 / 1.57 / 0,0 | 7.56 / 1.28 / 0,0 |

At 1.25 and 1.5 the lines are now as sharp as 3.90's or sharper and twice as close at 1.5. The
floor at every scale, rs 1 included and the unmasked tab labels too, is Phaser 4's Text against
3.90's, not the mask: a line is 15.668 logical px tall, and Phaser 4 rounds each corner of its
quad (`TransformerImage` `Math.round`) where 3.90 shifted the quad by its rounded top-left corner
(`TransformMatrix.setQuad`), as I-ADR0057-1's Answer records for the right edge. That is why
rounding the Layer moves rs 1 and 2 slightly (2.17 → 2.68, 1.28 → 1.57). Everywhere: no line
offset by the scroll or half a view, still or moving.

**Cost (I-ADR0057-3 slice run, `probe57/chat/perfB.cjs`, rs 2, 40 messages, 400 world rects,
camera moving; medians over frames 60–660, three runs each; `sync` = a `readPixels` after each
frame so the GPU work is counted).**

| build | ms/frame median (sync=0) | ms/frame median (sync=1) | filter passes | mask captures | framebuffer binds | draw calls |
|---|---|---|---|---|---|---|
| per-line masks (trial) | 1.20 / 0.90 / 0.50 | 10.00 / 12.80 / 7.90 | 8 | 8 | 32 | 37 |
| one Layer mask (this slice) | 0.50 / 0.90 / 0.70 | 3.20 / 4.40 / 6.40 | 1 | 1 | 3 | 8 |
