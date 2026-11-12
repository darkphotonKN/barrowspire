---
id: I-HF0WW-8
status: open
implements: FS-HF0WW
blocked_by: [I-JS7C8-13]
labels: [ready-for-agent]
title: "FS-HF0WW slice 8: a sheet may be baked at 1.5x (bake, trim grid, measures, validator, every sheetScale reader), and the archer re-baked at 1.5x once with the fast run (game-client)"
---
Implements FS-HF0WW §Change: Class sheets at 1.5x (R29–R38); ADR-0076

**Lane: agent (AFK), then HITL for the run.** The owner approved the archer at 1.5x after the
spike's side-by-side page (「感覺可以」, 2026-11-12). The spike (`spike/archer-1p5x`, 16adf4c4) is
throwaway: its real parts are ported here as fresh, tested work; `char_archer_2x`, the `archer2x`
group, `SPIKE_COMPARE_ART` and `/dev/archer` stay behind. The archer is baked **once**, with
I-JS7C8-13's fast run (the owner's run notes of 2026-11-12), so it is blocked by it.

## What to Build

1. The bake (ADR-0076 Decisions 2–4):
   - the baker's frame box as a pure function (`page/frameBox.js`): each side of the anchor
     rounded up to a multiple of `q` 1x px at a fractional scale, the frame `scale` times the 1x
     box, the anchor whole; `baker.js` uses it;
   - the trim grid (`lib/trim.mjs` `trimGrid(scale)`): `scale × q` sheet px; `bake.mjs` uses it;
   - `lib/downscale.mjs` at 1.5: an exact area filter (nearest ×q, then a `scale × q` box).
2. The client: the manifest validator takes 1, 1.5, 2, 3, 4 (`isSheetScale`), whole screen-px
   frames and trims on the `q`-screen-px grid; `MenuFigure`'s roster portrait keeps its crop on
   whole frame px at 1.5; every other `sheetScale` reader checked at 1.5 by a test.
3. The archer's catalogue entry at `scale: 1.5`; `npm run bake`; commit only the archer's pages
   and `manifest.json`. A contact sheet of every clip in 8 facings, with the old run beside the
   new (I-JS7C8-13).
4. Docs: the guideline's "Linear filtering" and `CONTEXT.md`'s sheet scale; the memory figures in
   FS-HF0WW § Change § Verification and I-JS7C8-12's VRAM gate.

## Acceptance Criteria

- [ ] Validator: accepts 1, 1.5, 2, 3, 4; refuses 1.25, 2.5, 3.5, 0.5, 5; at 1.5 refuses a frame
      not a whole number of screen px and a trim off the 3-sheet-px grid.
- [ ] `frameBox`: at 1.5 the frame and anchor are whole px, each side of the anchor a multiple of
      two 1x px, the frame exactly 1.5 times the 1x box; at 1 and 2 unchanged.
- [ ] `trimRect` at grid `trimGrid(1.5)` = 3: offset and size multiples of 3; lossless.
- [ ] `downscale(px, w, h, 1.5)` equals a hand-computed area filter.
- [ ] `sheetScale` readers at 1.5: `artScale` 2/3, `dress` sizes, markers' rise, the arcade body's
      60×60, the menu figure's scale, the roster portrait's crop whole frame px in its 44×56 window.
- [ ] The archer: `scale: 1.5`, trimmed, every clip, one page; every other atlas keeps its bytes;
      `npm run bake -- --check` clean.
- [ ] The resident-page tests that failed with the archer on two pages pass; the whole vitest suite
      is green; typecheck and lint pass.
- [ ] Memory recorded; guideline and `CONTEXT.md` updated.

## Blocked By

I-JS7C8-13 (the fast run's keys, so the archer is baked once)

## Spec Reference

FS-HF0WW §Change: Class sheets at 1.5x R29–R38, its acceptance criteria and edge states; ADR-0076.

## Files it expects to touch

- `game-client/tools/bake/page/frameBox.js` (new, + test), `page/baker.js`, `lib/trim.mjs`
  (+ test), `lib/downscale.mjs` (+ test), `bake.mjs`, `page/characters/cast.js`
- `game-client/src/render/art/manifest.ts` (+ test), `menuFigure.ts` (+ test), the readers' tests
- `game-client/public/art/archer-*.png`, `game-client/public/art/manifest.json`
- `game-client/docs/design-guideline.md`, `game-client/CONTEXT.md`
