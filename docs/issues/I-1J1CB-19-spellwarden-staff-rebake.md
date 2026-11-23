---
id: I-1J1CB-19
status: done
implements: FS-1J1CB
blocked_by: [I-1J1CB-17, I-1J1CB-18]
labels: []
title: "FS-1J1CB slice 19: one re-bake of the Spellwarden's sheet with the planted idle and the heavy cast, box within 300×255, every other atlas byte-identical"
---
Implements FS-1J1CB §Change: The Spellwarden's long staff planted and swung heavy (R83–R85)

## What to Build

One `npm run bake` after slices 17 and 18. Only her atlas pages and her manifest entry change.

## Acceptance Criteria

- [x] `git diff --stat public/art/` lists only `wizard_spellwarden-*.png` and `manifest.json`; the
      manifest's diff is her entry alone.
- [x] Her frame box is at most 300×255 (growth: stop and escalate).
- [x] Her walk, run and death frames ~~are pixel-identical to main 4d56d258's~~ differ from main
      4d56d258's only by the bake's shadow-map texel shift (compared frame by frame from the two
      atlases; accepted, FS-1J1CB "Her other clips' shadow drift, 2026-11-23").
- [x] `npm run bake -- --check` is clean; `npm test` and `npm run lint` pass.

## Blocked By

I-1J1CB-17, I-1J1CB-18

## Spec Reference

FS-1J1CB §Change: The Spellwarden's long staff planted and swung heavy: R83, R84, R85.

## Files it expects to touch

`game-client/public/art/wizard_spellwarden-*.png`, `game-client/public/art/manifest.json`.

## Built (2026-11-23, agent)

One re-bake (de807ffb). `git diff --stat public/art/` lists `wizard_spellwarden-0.png` and
`manifest.json` only, the manifest's diff her entry alone; every other atlas byte-identical. Her
frame box is 291×243 at 1.5x (was 300×255). Her walk, run and death keep their keys byte for byte,
but their frames shift with the shadow map, which the bake sizes from the sheet's farthest pose:
walk 39,359 px differ (largest step 34/255), run 44,586 (36), death 39,393 (37), of them 11k–17k
opaque pixels on the figure stepping at most 6, 12 and 13. Accepted by the coordinator's ruling
(the owner told) and recorded in FS-1J1CB. `npm run bake -- --check` is clean; `npm test`,
`npm run lint` pass. Old and new pages (`old/`, `old-wizard_spellwarden-0.png`,
`new-wizard_spellwarden-0.png`) and the comparisons are under `game-client/tools/bake/review/spellwarden-staff/`.
