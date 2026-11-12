# ADR-0076 — A sheet may be baked at 1.5x, its frame box and trim cut on a two-screen-px grid; the class sheets move to it

Status: accepted
Date: 2026-11-12
Scope: `game-client` only: the bake (`tools/bake/bake.mjs`, `page/baker.js`, `lib/downscale.mjs`,
`lib/trim.mjs`), the sprite manifest's `scale` (validated by `src/render/art/manifest.ts`) and the
client code that reads a sheet's scale (`sheetScale` and its readers). Not the server, the wire,
the atlas groups or when art is loaded (ADR-0059).
Specified by [FS-HF0WW](../specs/HF0WW-2x-archer-walk-attack-leg-clearance-trim.md)
`## Change: Class sheets at 1.5x`.
Amends: [ADR-0058](0058-a-sheet-may-be-baked-at-2x-and-trimmed-every-size-stays-in-screen-px.md)
Decision 1 (a sheet's `scale` is a whole number from 1 to 4) and Decision 3's grid (a cut on
whole screen px, multiples of `scale`). Its Decisions 2 and 4 stand unchanged: every size stays in
screen px, and both scale and trim are opted into per sheet.
Builds on: [ADR-0056](0056-every-scene-camera-runs-at-origin-0-with-zoom-equal-to-render-scale.md)
(render scale up to 2, fractional valid), [ADR-0057](0057-the-client-runs-phaser-4-pixel-rounding-by-vertex-round-mode-masks-by-the-mask-filter.md)
(every quad corner rounded to the backing px), [ADR-0059](0059-scene-scoped-atlas-groups-are-evicted-with-their-animations-once-the-next-scene-has-loaded.md)
(the class groups are resident)

## Context

Decided by Nick on 2026-11-12. FS-JS7C8's archer re-bake (I-JS7C8-12) added `run` and
`backpedal_attack` and grew his 2x sheet to two atlas pages, 84.70 MB of RGBA (+88 % over main,
against the +47 % estimated), with the three other classes still to follow. FS-JS7C8 "Open for the
owner" 2 put the VRAM choice to him. He agreed to the plan "if 1.5x is acceptable, all four classes
move to 1.5x", approved a spike (`spike/archer-1p5x`, 16adf4c4, 「好」), looked at its side-by-side
page of the archer at 1.5x and at 2x on his Retina screen and said 「感覺可以」: the 1.5x archer is
good enough. Recorded without adversarial review: no `challenge-me` pass was run.

Forces:

- **Memory grows with the square of the scale.** At 1.5x a sheet holds (1.5/2)² = 56 % of its 2x
  px. The spike's archer: one page, 3820×2720, 41.56 MB RGBA (PNG 5.75 MB), against two pages and
  84.70 MB (PNG 9.55 MB) at 2x. The four class groups are resident (ADR-0059), so every class
  sheet's px is held in every scene.
- **Crispness is bounded by the render scale.** The canvas draws at the screen's density up to
  render scale 2 (ADR-0056). Measured in the spike against the 2x archer: at render scale 2 the
  1.5x archer is 15–22 % softer, at 1.5 it is sharper (2x is drawn downsampled there), at 1 they
  are equal; no shimmer at any render scale.
- **Above render scale 2 nothing gains.** No screen draws a sheet at more than 2 backing px per
  screen px, so a scale between two whole steps above 2 buys memory and no detail.
- **A fractional scale puts edges between px.** A 1x frame box of odd width, an anchor on an odd
  1x px, or a trim offset on an odd screen px lands on half a sheet px at 1.5x: the frame size, the
  anchor and the cut would no longer be whole px in the atlas.
- **ADR-0058's trim grid of one screen px draws a cut off by up to half a backing px at render
  scale 1.5** (FS-HF0WW § Verification). Two screen px are three backing px at 1.5, so a cut on
  that grid lands whole at render scale 1, 1.5 and 2.
- **The manifest's screen-px measures read the frames at 1x** (`crown`, `length`); at 1.5x a 1x
  px is one and a half sheet px, which a whole-factor box filter cannot take.
- **The client already draws a sheet at 1/`scale`** through `sheetScale` (`CharacterAnimator.artScale`,
  markers, the run's arcade body, the menu figure). Only a reader that turns a screen px into a
  frame px and needs a whole px from it (the roster portrait's crop) depends on the scale being
  whole.

## Decision

1. **A sheet's `scale` is 1, 1.5, 2, 3 or 4**: a whole number of halves up to 2, a whole number
   above it. 1.5 is the only fractional scale; the manifest validator refuses any other (1.25,
   2.5, 3.5). Absent is still 1.
2. **At a fractional scale the frame box is cut on a grid of `q` 1x px**, `q` the least whole
   number that makes `scale × q` whole (2 at 1.5; 1 at a whole scale, where nothing changes): each
   side of the anchor is rounded up to a multiple of `q`, so the frame and its anchor are whole px
   at `scale`. The render is the bake's supersample × `scale` over that box (3x at 1.5),
   box-filtered SS×SS to `scale`× as every sheet is.
3. **The trim grid is `q` screen px**: a trimmed sheet's cut lies on multiples of `scale × q`
   sheet px (3 at 1.5: two screen px; 2 at 2x and 1 at 1x, as before). The validator requires a
   cut on that grid.
4. **The screen-px measures read the frame brought back to 1x by an exact area filter**: at a
   fractional scale, a nearest blow-up by `q` and then a `scale × q` box (at 1.5: ×2, then /3).
5. **Every reader of `sheetScale` works at 1.5**, and one that turns screen px into frame px
   keeps its result on whole frame px (the roster portrait's crop on the `q`-px grid).
6. **The four playable classes are baked at 1.5x**: the archer now, the knight, wizard and
   mercenary when each is re-baked with `run` and `backpedal_attack` (FS-JS7C8 slices 6–8). No
   other sheet's scale changes.

## Consequences

- **The class art costs a little over half its 2x memory.** The archer goes from two pages,
  84.70 MB, to one page (figures as baked in FS-HF0WW `## Change: Class sheets at 1.5x`
  § Verification). The class groups' resident total, and so every figure ADR-0059 Consequences
  gives ("about 200 MB on the menus, 223 in the hub …", estimates since out of date), falls by
  the difference; FS-JS7C8 R39's "+83 MB resident" estimate for the new clips falls with it.
- **The hero is softer at render scale 2 than at 2x**, 15–22 % by the spike's measure, and sharper
  at render scale 1.5. Nick judged it by eye and accepted it; a sheet that must be sharpest at
  render scale 2 can still be baked at 2.
- **ADR-0058's fractional-render-scale offset goes away for a 1.5x sheet** at render scale 1, 1.5
  and 2 drawn at its true size: frame, anchor and every cut sit on two-screen-px steps, whole
  backing px at each. The menu hero (its 1.3 menu scale, a sprite scale of 0.87 on a 1.5x sheet)
  is still off by up to a fraction of a px, as ADR-0058 describes.
- **The 1x frame box may grow by up to one 1x px each side** of the anchor (the rounding to `q`),
  so a 1.5x sheet's frame can be a px or two larger in screen px than its 2x bake; the anchor
  fraction may move by that px. Sizes outside the atlas stay screen px, so nothing in play moves.
- **The design guideline's "Linear filtering"** names the 1.5x sheets and why; `CONTEXT.md`'s
  sheet scale names 1.5.
- **During the transition the classes sit at two scales** (the archer at 1.5, the other three at 2
  until slices 6–8). The client reads each sheet's own scale, so nothing depends on them matching.
- **Code-review can flag** any reader that multiplies a screen px by `sheetScale` into a frame px
  without keeping it whole, and any `scale` other than the five above.
