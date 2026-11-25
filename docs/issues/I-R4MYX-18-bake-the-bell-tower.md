---
id: I-R4MYX-18
status: done
implements: FS-R4MYX
blocked_by: []
labels: [ready-for-agent]
title: "FS-R4MYX slice 18: bake the bell tower, and drop the belfry sheet"
---
Implements FS-R4MYX §Change: The chapel moves to the far left and gains a bell tower (§T-F T24–T25, §T-C T17's sheet)

**Lane: game-client bake (agent).** Authored in code (ADR-0020, ADR-0021); no sourced art.

## What to Build

- `chapel_tower`: one prop sheet, one frame, the `chapel` group, framed round a 140 × 140
  footprint, anchor on its centre, no light, no baked ground shadow. The chapel's aged
  whitewashed limestone from the same material code as the `chapel_` walls; a solid lower stage
  with one slit lancet on the south face; a string course; an open belfry with a pointed opening
  on the south and east faces and a dark bronze bell seen inside; a slate pyramid spire with a
  cross a little off true (T24).
- Heights (tile edges), each a model test: masonry top 9.0 ± 0.5; each opening's and the bell's
  upper half above 7.8 (the chapel's ridge); the cross's top at least 2.5 above the east gable
  cross's (9.7). Indicative: sill 7.0, opening apex 8.7, bell 7.6–8.5, spire apex 12.4, cross
  top 13.2.
- `belfry` leaves the catalogue and the manifest; `models/chapel.js#belfry` and the helpers only
  it uses are deleted, with their tests (T17).
- Re-bake: the `chapel` atlas reflows, every other atlas keeps its bytes;
  `npm run bake -- --check` clean.

Expected files:
- `game-client/tools/bake/page/models/chapelBuilding.js` (or a new `chapelTower.js` beside it),
  its `.test.mjs`
- `game-client/tools/bake/page/models/chapel.js`, `chapel.test.mjs` (the belfry out)
- `game-client/tools/bake/page/catalogue.js`
- `game-client/public/art/manifest.json`, `public/art/chapel-0.png` (by the bake only)
- `game-client/src/render/art/manifest.test.ts`

Not touched: anything under `src/render/world`, `src/scenes`, `game-server`. May run **in
parallel with I-R4MYX-17**, in its own worktree: no file is shared. (`HubScene.test.ts` builds
its own manifest, and until I-R4MYX-17 lands a client without the `belfry` sheet draws nothing
for the old prop, FS-KYPQ9 §A.9.)

## Acceptance Criteria

- [ ] The manifest carries `chapel_tower` as above and no `belfry`; its source is
      `authored: tools/bake/page/models/…`.
- [ ] The height tests of T24 pass; colours are `BARROW` mixes only (`npm run lint:fence`).
- [ ] Every non-chapel atlas is byte-identical; `npm run bake -- --check` is clean.
- [ ] `npm test`, `npm run lint`, `npx tsc --noEmit` green.
- [ ] The commit notes the frame's size, anchor and drawn top above the origin, for I-R4MYX-19.

## Blocked By

None

## Spec Reference

FS-R4MYX §Change: The chapel moves to the far left and gains a bell tower: T24, T25, T17 (the sheet); user stories 4, 13.

## TDD Approach

- RED: `manifest.test.ts` asking for `chapel_tower` and no `belfry`; the model's height tests.
- GREEN: the model, the catalogue entry, the bake.
