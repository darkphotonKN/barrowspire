---
id: I-ADR0057-1
status: done
implements: ADR-0057
blocked_by: []
labels: []
title: "ADR-0057 slice 1: every object rounded to the backing px under Phaser 4, set once in the viewport (game-client)"
---
Implements ADR-0057 §Decision (Pixel rounding)

**Lane: agent (AFK).** game-client only. Builds on the uncommitted Phaser 4.2.1 trial on
`feat/client-phaser-4`. Closes the two `PHASER4-TRIAL, NOT MIGRATED` markers in
`src/render/viewport/camera.ts`.

## What to Build

Under 4.2.1 WebGL no quad is rounded at any render scale: `keepOnPixelGrid` forces
`renderRoundPixels`, which only the canvas renderer reads, and it keeps the camera's own
`roundPixels` **off**, which is the flag `fullAuto` reads (`GameObject.willRoundVertices`). Make
rounding as 3.90 had it:

- A main camera on the pixel grid has `roundPixels` **on**. Phaser 4's `Camera.preRender` no
  longer floors scroll under `roundPixels`, so the reason `keepOnPixelGrid` kept it off is gone;
  keep the 1/rs scroll snap and drop the `renderRoundPixels` forcing for WebGL (keep whatever the
  canvas fallback still needs). Re-check `roundsPixels()` (read by the blackout's texture camera)
  so it still answers "this camera rounds".
- `roundAtAnyZoom` (a render texture's camera) sets that camera's `roundPixels` from `rounds()`
  each frame set-up, so `fullAuto` objects stamped into it round as the main camera does.
- **Every game object gets `vertexRoundMode = "fullAuto"`, once, centrally in
  `src/render/viewport`.** `vertexRoundMode` is assigned in `GameObject`'s constructor, so a
  prototype default does not work. Candidates, pick one and justify it in the code:
  the `ViewportFit` scene plugin listening to the scene's `ADDED_TO_SCENE`; or a wrap of
  `GameObject.prototype.willRoundVertices`. Whatever is chosen must also reach **container
  children** (`Container.addHandler` calls `addedToScene()` directly, no scene event),
  **objects made with `make.*(…, false)`** (mask sources, render-texture stamps). The dev
  gallery must compile under v4 (ADR-0057), its visuals not held to parity; it installs the same
  hook before its game, so it is rounded too. Scenes do not set `vertexRoundMode` themselves.
- Update the `Pixel grid` term in `game-client/CONTEXT.md` (it cites Phaser 3.90 dropping
  `roundPixels`) and the comment in `src/components/PhaserGame.tsx` if its wording no longer holds.

## Acceptance Criteria

- [ ] A headless-Chrome probe (as the trial's): a quad edge at a fractional world x lands on a
      whole backing px at render scales 1, 1.25, 1.5 and 2 (3.90 parity), for an Image, a Sprite,
      a Text, a container child, and an Image stamped into a render texture.
- [ ] FS-ZAJMH R4: on a still frame at 1.25 and 1.5 no sprite shimmers; a following camera's lerp
      steps still move it (no sticking), as in 3.90. Probe frames or pixel diffs recorded in
      `## Answer` below.
- [ ] Unit tests (next to `camera.ts` / `ViewportFit.ts`): a new object, a container child and a
      `make`-made object each end up `fullAuto`; a gridded main camera has `roundPixels` on and
      its scroll on the 1/rs grid; `roundAtAnyZoom` follows `rounds()`.
- [ ] No `vertexRoundMode` assignment outside `src/render/viewport` (grep).
- [ ] Both `PHASER4-TRIAL, NOT MIGRATED` markers in `camera.ts` are gone; the doc comments cite
      ADR-0057 instead of "a decision for ADR-0056".
- [ ] Frame rate at render scale 2 in the hub and a run holds as before (no noticeable drop;
      otherwise escalate).
- [ ] `npx tsc --noEmit`, `npm test` pass.

## Blocked By

None

## Spec Reference

ADR-0057 §Decision "Pixel rounding" (camera `roundPixels` on, `fullAuto` everywhere, set once,
parity at 1/1.25/1.5/2); FS-ZAJMH Edge States "Fractional DPR" (R4, no shimmer).

## Expected files

`game-client/src/render/viewport/camera.ts`, `camera.test.ts`, `ViewportFit.ts` (+ a new test),
possibly a new `src/render/viewport/rounding.ts` (+ test) exported from `index.ts`;
`game-client/CONTEXT.md` (Pixel grid); `src/components/PhaserGame.tsx` (comment only).

## TDD Approach

- RED: a test that an object added to a scene running the viewport plugin has
  `vertexRoundMode === "fullAuto"`, and that a gridded camera's `roundPixels` is true after
  `preRender`.
- GREEN: the central hook and the `keepOnPixelGrid` change.

## Answer

Headless Chrome (Playwright, system Chrome), WebGL, `antialias: true`, logical view 1080×720.
The probe bundles the real viewport modules (`ViewportFit` plugin, `keepOnPixelGrid`,
`followWith`, `roundAtAnyZoom`) three ways: **3.90** = HEAD sources + Phaser 3.90.0; **trial** =
HEAD sources + Phaser 4.2.1; **new** = this slice + Phaser 4.2.1. Texture: a solid 31×17 box at
scale 0.5 (2x art, ADR-0020), placed at world x = 100.3, camera scroll set to (3.3, 1.7) and
floored onto the grid.

**Left edge at a fractional world x** (first lit backing px; "blend" = a partly-covered px):

| rs | exact | 3.90 (all 5 kinds) | trial Image/Sprite/Text/child | new Image, Sprite, Text, container child, RT stamp |
|---|---|---|---|---|
| 1 | 97.3 | px 97, no blend | px 97 red 191 (blend) | px 97, no blend |
| 1.25 | 121.375 | px 121, no blend | px 121 red 191 (blend) | px 121, no blend |
| 1.5 | 146.45 | px 146, no blend | px 146 red 128 (blend) | px 146, no blend |
| 2 | 194.6 | px 195, no blend | px 194 red 128 (blend) | px 195, no blend |

The new left edge lands on the same px as 3.90 for all five kinds at all four scales. Right edge:
3.90 shifts the quad by its rounded top-left corner (`TransformMatrix.setQuad`), so a non-integer
width leaves the right edge blended (rs 1/1.25/1.5); Phaser 4 rounds every corner, so new makes
it hard. That is not parity: it is a known sub-px size delta the hook cannot undo. The right and
bottom edges move by up to 0.5 backing px from 3.90's, for text at rs 1.25 and 1.5 and for 2x
art of odd source size at rs 1, 1.25 and 1.5, where 3.90 blended them at 64/255 or 128/255 and
v4 draws them hard (review round 2, SP3). Nick accepts or rejects it in I-ADR0057-5. The RT stamp
is asked through the texture's camera: `roundPixels` true, rounds = true (trial: false); with
`rounds()` false it is false. All new objects read `vertexRoundMode = "fullAuto"` after drawing,
including the container child and the `make.image(…, false)` stamp.

**Follow and still frame (R4)**: target walks 90 frames left/up (1.37, 0.91 px/frame), 90
right/down, then stands; camera via `followWith`, lerp 0.1. 420 frames per run.

| rs | scroll stalls while walking (3.90 / new) | scroll off the 1/rs grid | still sprite while the camera moves (3.90 / new) | HUD sprite (3.90 / new) | last 60 frames |
|---|---|---|---|---|---|
| 1 | x 0, y 6 / x 0, y 6 | 0 / 0 | 16 px, 1 blended / 16 px, 0 blended | steady / steady | 1 scroll, 1 canvas hash, both |
| 1.25 | 0 / 0 | 0 / 0 | 20 px, 1 blended / 20 px, 0 blended | steady / steady | 1 / 1, both |
| 1.5 | 0 / 0 | 0 / 0 | 24 px, 1 blended / 24 px, 0 blended | steady / steady | 1 / 1, both |
| 2 | 0 / 0 | 0 / 0 | 31 px, 0 blended / 31 px, 0 blended | steady / steady | 1 / 1, both |

(The y stalls at rs 1 are whole-unit steps under a 0.91 px/frame walk, the same in 3.90.)
Before the matrix fix below, new showed a still sprite's width toggling 16/15, 20/19, 23/24 px
while the camera moved: Phaser builds the view matrix in `preRender` from the unfloored scroll,
and per-corner rounding exposes that (3.90's corner-shift hid it). `keepOnPixelGrid` now moves the
view matrices with the floored scroll; widths are steady.

**Frame cost at rs 2** (prerender→postrender, ms, median of frames 60–420, 3 runs each; images
following a moving camera; `performance.now()` is coarsened to 0.1 ms here):

| objects | trial (no rounding) | new (fullAuto + roundPixels) | 3.90 |
|---|---|---|---|
| 2000 | 0.8 / 0.8 / 0.6 | 0.8 / 0.9 / 0.7 | 0.5 / 0.5 / 0.5 |
| 8000 | 2.3 / 2.1 / 2.1 | 2.1 / 1.9 / 1.9 | 1.7 / 1.3 / 1.4 |

The rounding adds no measurable cost at up to 8000 quads, and every run held 60 fps (rAF cap).
Phaser 4 itself runs about 0.3–0.6 ms slower than 3.90 at 8000 quads in this setup, which is not
caused by this slice. Not measured: the real hub and run scenes (they need the backend); that is
left for I-ADR0057-5's browser check.
