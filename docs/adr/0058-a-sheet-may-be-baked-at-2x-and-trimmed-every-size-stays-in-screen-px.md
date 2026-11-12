# ADR-0058 — A sheet may be baked at 2x and drawn at half scale, its frames trimmed at bake time; every size stays in screen px

Status: accepted
Date: 2026-11-06
Scope: `game-client` only: the bake (`tools/bake/bake.mjs`, `page/baker.js`, `page/main.js`,
`page/catalogue.js`, `lib/downscale.mjs`, `lib/trim.mjs`, `lib/pack.mjs`), the sprite manifest
(`public/art/manifest.json`, validated by `src/render/art/manifest.ts`), and the client code that
draws or measures a baked sheet (`src/render/art/`, `src/render/markers/`, `src/ui/bustPortrait.ts`,
the scenes that dress a character sprite). Specified by [FS-HF0WW](../specs/HF0WW-2x-archer-walk-attack-leg-clearance-trim.md).
Amends: [ADR-0020](0020-game-canvas-art-is-pre-rendered-3d-baked-to-isometric-sprites.md) — Decision 5:
the manifest records, per sheet, frame size and anchor, and now also the sheet's `scale` and, for a
trimmed sheet, each frame's `trim`. The rest of ADR-0020 stands.
Builds on: [ADR-0056](0056-every-scene-camera-runs-at-origin-0-with-zoom-equal-to-render-scale.md)
(render scale up to 2), [ADR-0057](0057-the-client-runs-phaser-4-pixel-rounding-by-vertex-round-mode-masks-by-the-mask-filter.md)
(every quad corner rounded)
Amended by: [ADR-0076](0076-a-sheet-may-be-baked-at-1-5x-its-frame-and-trim-on-a-two-screen-px-grid.md) — Decision 1
(a sheet's `scale` may also be 1.5, its frame box on a two-1x-px grid) and Decision 3's grid (a
cut on `q` screen px, two at 1.5)

## Context

Decided by Nick: he approved trying the archer baked at 2x ("render 4x, downscale to 2x, keep the
look") on branch `spike/archer-2x`, then asked for the frames to be trimmed at bake time (archer
first, as a per-sheet switch), and on 2026-11-06 asked for the work to be brought into `main`.
Recorded without adversarial review: no `challenge-me` pass was run.

Forces:

- **Every sheet is drawn at 1x from a 2x render** (design guideline, "Linear filtering"): the bake
  renders at 2x and box-filters to 1x. Since FS-ZAJMH the canvas draws at the screen's density, up
  to render scale 2, so on a Retina screen every 1x sheet is upsampled 2x and the hero, the sprite
  the player looks at most, is soft.
- **Memory grows with the square of the scale.** The 1x archer decodes to about 22 MB of RGBA. At
  2x, with the new `walk_attack` clip, it is 137 MB on three 3940-wide atlas pages. Baking every
  sheet at 2x would multiply the whole catalogue's texture memory by four.
- **Most of a frame is empty.** A sheet's frame box holds every pose of every clip, the bow's sweep
  and the ground shadow included, so a single frame's pixels fill about a third of it: trimmed to
  its pixels, the 2x archer's frames cover 33.8 % of the area, one 2924×3844 page, 45 MB decoded.
  The PNG is about 6.1 MB either way.
- **Phaser has trimmed frames natively.** `Frame.setTrim` (what its TexturePacker parsers call)
  records a cut inside a larger frame; a sprite's size, origin and arcade body read the frame's
  `realWidth` / `realHeight`, and the renderer draws the cut at its offset
  (`TransformerImage.run`: `-displayOriginX + frame.x`). Unchanged in 4.2.1.
- **A crop on a trimmed frame is not kept.** `Frame.setCropUVs` cuts the crop down to its overlap
  with the frame's cut and stores that, and every frame change re-derives the crop from the stored
  one (`TextureCrop.setFrame` → `Frame.updateCropUVs`), so an animated portrait window shrinks as
  the clip plays. Same in 3.90 and 4.2.1 (`render/art/phaser.test.ts` runs it on the real Frame).
- **Everything outside the atlas is measured in screen px**: the crown, a quadruped's length, a
  light's offset, name plates and bars, the footprint, the run's arcade body, the menu figure's
  size and the portrait window. None of that may change because one sheet holds more px.

## Decision

1. **A sheet may be baked at `scale` px per screen px**, a whole number from 1 to 4 (today the
   archer alone, at 2). It renders at the supersample × `scale` over the same camera box and
   box-filters to `scale`×, so its frame is exactly `scale` times its 1x frame and its anchor, a
   fraction, is unchanged. The manifest records `scale`; absent is 1.
2. **Every size stays in screen px** (enforced for character and creature sheets only: the
   manifest validator rejects `scale` and `trimmed` on a sheet without a `walk` clip, see
   Consequences). The client draws a scaled sheet at 1/`scale`
   (`CharacterAnimator.artScale`, folded into `dress(sprite, size)`); markers divide it back out of
   the sprite's scale; the run's arcade body is resized to the size a 1x sheet gives it. The bake
   measures crown and length on the frames brought back to 1x. Code that reads `frameWidth` /
   `frameHeight` as screen px reads them through `sheetScale`.
3. **A sheet may be trimmed at bake time** (`trim: true` in the catalogue; today the archer alone).
   Each frame is cut to the box that holds its pixels, on whole screen px (multiples of `scale`);
   the atlas holds the cut, and the manifest marks the sheet `trimmed` and gives each frame its
   `trim {x, y, w, h}` inside the whole frame. The client registers the cut with `Frame.setTrim` at
   the whole frame's size, so a trimmed frame sizes, anchors, collides and draws as the whole frame.
   A reader that takes pixels from the atlas itself puts the cut back at its offset (the bust
   portrait, the review contact sheet); a crop on a trimmed sheet is set again after every frame
   change (`MenuFigure`).
4. **Both are opt-in per sheet.** The default stays a 1x, untrimmed sheet. Turning either on for
   another sheet is a catalogue change plus a check of that sheet's readers.

## Consequences

- **The hero is sharp at render scale 2 for about twice the archer's 1x memory**, not six times:
  22 MB → 45 MB decoded (137 MB untrimmed). The other sheets are untouched.
- **The guideline's "at 1x from a 2x render" gains an exception**, rewritten to name it.
- **A trimmed sheet is not pixel-identical to its untrimmed bake at every render scale.** Phaser 4
  rounds each quad corner on its own (ADR-0057), so where trim offset × sprite scale × render scale
  is not whole the cut is drawn up to half a backing px from where the whole frame would draw it,
  and that offset can change from one frame to the next. Measured on screen on 2026-11-06
  (FS-HF0WW § Verification): in the world, its silhouette and its portrait, identical at render
  scale 1 and 2; at 1.5 every frame differs, offset at most 0.5 backing px, changing by at most
  0.5 px between frames of one clip (on Phaser 3.90 it was 0.9 and 0.5); the menu hero, drawn at
  0.65, differs at every render scale (at most 0.87 px, 0.6 px frame to frame). Nick judges it in
  the browser check. A coarser trim grid (2 screen px) would make 1.5 exact but not 1.25, 1.75 or
  the menu's 0.65, so it is not done.
- **Only the character readers have been checked against a scaled, trimmed frame.** These
  readers ignore `scale` and `trim`, taking `frameWidth` / `frameHeight` (or a frame's size) as
  screen px of a whole frame:
  - the cursors (`render/cursors/cursors.ts:83`, the cursor image's size);
  - the item icons (`render/art/itemIcons.ts:145`, the icon's fit);
  - the container grid's icon fit (`ui/ContainerView.ts:597`) and the gear overlay's
    (`ui/GearOverlay.ts:565`), both from the sprite's frame size;
  - the signpost's name rise (`scenes/FieldScene.ts:790`, `scenes/HubScene.ts:1923`,
    `frameHeight × anchor.y`);
  - the hub fence crop (`scenes/HubScene.ts:1496-1502`, a crop from `frameWidth`);
  - the world's render-texture stamps (`render/world/scene.ts:235` and `:601`, a frame placed by
    its top-left from `frameWidth` and the anchor).

  None of them draws a character or creature. The manifest validator therefore accepts `scale`
  and `trimmed` only on a sheet with a `walk` clip (a character or creature sheet), so the bake
  fails before any of these readers meets one. Before either is turned on for a prop, ground,
  wall, icon or cursor sheet, those readers are fixed and tested against it, and the validator
  rule is widened.
- **Code-review can flag** any new read of `frameWidth`, `frameHeight` or a frame's pixels that
  ignores `scale` or `trim`.
- **The manifest validator holds the contract**: `scale` and `trimmed` only on a sheet with a
  `walk` clip, `scale` whole and at most 4, frame sizes multiples of it, `trimmed` only `true`,
  every frame of a trimmed sheet with a `trim` inside the frame on whole screen px, and no `trim`
  on an untrimmed sheet.
