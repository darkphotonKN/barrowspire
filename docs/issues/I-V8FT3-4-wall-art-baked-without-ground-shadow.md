---
id: I-V8FT3-4
status: done
implements: FS-V8FT3
blocked_by: [I-V8FT3-1]
labels: []
title: "FS-V8FT3 slice 4: wall pieces, posts, exterior pieces and door heads are baked with no ground shadow (game-client)"
---
Implements FS-V8FT3 §B

**Lane: agent (AFK), with a look at the review sheets at the end (Nick).** Ships on one branch with
I-V8FT3-2 and I-V8FT3-3: new art without the painted shadows leaves walls with none.

FS-XK2B6 (walls on the cell boundary) baked nothing: the three groups are as main has them. A
wall's thickness is `tools/bake/page/shadow.js` `WALL_FOOT`, which the models read and the client
mirrors once (`BAKE.WALL_FOOT`, named by each `WallSheets`); this slice changes no thickness.

Bake with `npm run bake`, commit the atlases and `manifest.json` with the catalogue change. This
rewrites three atlas groups: `architecture`, `tower`, `building`. If another branch re-baked one of
them, merge the models and the catalogue first and bake again; never resolve an atlas or the
manifest by hand.

## Files owned

- `game-client/tools/bake/page/catalogue.js` (the sheets of R4 and R5)
- `game-client/tools/bake/page/models/{tower,building}.js` (the frame-guide comments; a model only
  if R6 or R7 needs it)
- `game-client/tools/bake/lib/{contact,building}.mjs` if a review sheet needs it (R10)
- `game-client/public/art/{architecture,tower,building}-*.png`, `manifest.json`
- `game-client/docs/design-guideline.md` (R9)
- client tests that pin a wall sheet's frame size, if any

## What to Build

- Every sheet of R4 and R5 baked without the catcher; its meshes still cast on one another (R6).
- Frames and anchors as R7: a piece stands where it stood; a tower and an exterior piece still
  share the timber piece's frame.
- The guideline's exception (R9), dated, citing FS-V8FT3.

## Acceptance Criteria

- [x] The catalogue bakes every sheet of R4 and R5 with no ground shadow, and no other sheet's
      shadow setting changes.
- [x] Atlases outside `architecture`, `tower` and `building` keep their `sha256`; in those three,
      every sheet not named keeps its frame size and anchor in the manifest.
- [x] A tower piece's and an exterior piece's frame size and anchor equal the timber piece's.
- [x] `npm run bake -- --check` passes.
- [x] The design guideline carries R9's exception.
- [x] `npx vitest run --maxWorkers=4` and `npm run lint` in game-client pass.
- [ ] By eye (Nick): on the review sheets a wall piece's own faces look as before, and nothing of
      a shadow is left under a wall, a post or a door head.

## Blocked By

I-V8FT3-1 (it moves constants in the same model files). Blocks I-V8FT3-5.

## Spec Reference

FS-V8FT3 §B R4-R10; edge states "Between slices", "Merging with other re-bakes"; user story 16.

## TDD Approach

Art: no unit test drives a bake. Check the manifest diff (only the named sheets' frames change)
and `--check`.
