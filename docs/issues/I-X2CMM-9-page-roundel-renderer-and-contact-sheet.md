---
id: I-X2CMM-9
status: done
implements: FS-X2CMM
blocked_by: []
labels: [ready-for-agent]
title: "FS-X2CMM slice 9: the page roundel renderer, the five pigment tokens, the 14 page pictures and their contact sheet"
---
Implements FS-X2CMM §I

**Author: agent**

## What to Build

ADR-0094 in code. No wiring into the book (slice 10 does that after the sheet).

- **Tokens.** Add `pigmentVerdigris`, `pigmentOchre`, `pigmentMadder`, `pigmentLapis`,
  `pigmentBone` to `BARROW` / `BARROW_HEX` in `src/utils/theme.ts` (muted mineral tones, none more
  saturated than `verdigris #5fa88a`), read only through a new `palette.bookPigment` in
  `canvasPalette.ts`. Keep `theme.test.ts` honest.
- **Renderer.** A new `src/ui/pageRoundel.ts` beside `knockout.ts`, reusing its supersampling at
  2× render scale and rebuild on a render-scale change: a dark ground disc, a bronze rim with
  ADR-0080's emboss, a glyph in one main pigment plus bone highlights; states `ready`, `locked`
  (`hudFaint` 0.6, rim unlit), `dim`, `hovered`; a 2.25 px line fallback in the main pigment.
  Sizes: about 44 px in the book, 28 px on the cast bar.
- **Pictures.** `src/ui/pageIcons.ts`: the 14 pictures of FS-X2CMM R45's table, keyed by page id,
  each with its pigment. Ultima Online fidelity: readable silhouettes, a little texture, no
  cartoon.
- **Contact sheet (R46).** A dev gallery sheet (pattern: `src/dev/gallery/treeColoursSheet.ts` +
  panel) drawing all 14 through the real renderer in ready, locked, recovering (a sweep at 40 %)
  and hovered, at render scales 1, 1.5 and 2; register the family in `src/dev/gallery/families.ts`.
  Also write a static PNG of the sheet to `docs/art/class-book-pages-contact-sheet.png` (render it
  headless, e.g. with the repo's existing bake/Playwright tooling, or a node-canvas mirror of the
  same picture data if the Phaser path cannot run headless) and report the path.

## Acceptance Criteria

- [x] The five tokens exist and are read only through `palette.bookPigment`; lint and the fence pass.
- [x] `pageRoundel` draws each state; unit tests cover the state→ink mapping and the fallback.
- [x] All 14 pictures exist, each with its R45 pigment.
- [x] The gallery card and a PNG contact sheet of all 14 in four states exist.
- [x] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

## Blocked By

None

## Spec Reference

FS-X2CMM §I R45–R46; ADR-0094

## TDD Approach

- RED: a locked roundel inks its glyph in `hudFaint`.
- GREEN: the renderer and the pictures.
