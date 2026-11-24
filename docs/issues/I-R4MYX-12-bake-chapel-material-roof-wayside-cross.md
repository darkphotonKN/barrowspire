---
id: I-R4MYX-12
status: done
implements: FS-R4MYX
blocked_by: []
labels: [ready-for-agent]
title: "FS-R4MYX slice 12: bake the chapel's whitewashed limestone walls, slate roof, door head, wayside cross and the long pew"
---
Implements FS-R4MYX §H Requirements 36, 38, §I Requirements 41–42

**Lane: bake art (agent).** Owner feedback F6 (European church, whiter walls, crosses outside),
F1 (longer pews). Runs in parallel with I-R4MYX-11: the scene draws placeholders until these
sheets exist, and nothing in `src/` reads them until I-R4MYX-13.

## What to Build

A new wall material and roof set for the chapel, a door head, a wayside cross, and the pew
rebaked longer, all authored in code in `tools/bake` like the town's existing pieces (ADR-0020,
ADR-0021, `game-client/docs/design-guideline.md` Part I). Dark fantasy by age, not grey: colours
from `BARROW`, the whites mixed toward `vellum`, never pure white.

- **Walls, `chapel_` prefix:** whitewashed limestone aged in the bake: grime streaks down from the
  eaves, moss at the foot, patches where the lime fell away to the grey stone under it. Cut and
  sized as the `tower_` masonry pieces they stand in for (the masonry foot `WALL_FOOT.masonry`,
  `WALL_BACK` / `WALL_FRONT` heights, the same anchors and frame sizes):
  - `chapel_wall_back_{plain,pillar}_{x,y}`, `chapel_wall_front_{plain,pillar}_{x,y}` (inside
    faces: whitewash, a plain pilaster for `pillar`);
  - `chapel_wall_exterior_{plain,lancet,buttress}_{x,y}`: `lancet` a tall gothic pointed window
    of dark leaded glass, unlit, under a hood mould; `buttress` a stepped stone buttress;
  - `chapel_post_back`, `chapel_post_front`;
  - `chapel_door_head_{x,y}`: a pointed-arch portal head with a carved cross above, sized as
    `tower_door_head_{x,y}` so the existing door (`door_y`) sits under it.
- **Slate roof, `chapel_roof_` sheets**, cut and sized as the town's `roof_` pieces (one tile,
  `ROOF_RISE` a row, the same animations and anchors) so `planRoof` / `planGables` lay them
  unchanged: `chapel_roof_slope` (n/e/s/w; dark weathered slate, some slipped), `chapel_roof_ridge`
  (x/y; stone ridge tiles), `chapel_roof_gable_{x,y}` (whitewashed gable ends, each with a round
  rose window / oculus of dark glass and a stone cross finial on its apex, the finial's height
  over the ridge row noted for I-R4MYX-11's R39 allowance).
- **`wayside_cross`:** a tall weathered stone calvary cross on a stepped base, about a 40 × 40
  footprint, tall (an occluder).
- **`pew` rebaked at 20 × 100** (was 20 × 70): the same plain dark-oak bench with a back, long
  along y, back to the east, seat facing west.
- Every new sheet in a **resident** atlas group the hub draws without a scene change (the
  `chapel` group, or the architecture/building group the `tower_` and `roof_` pieces use;
  whichever the scene-art loading rules (FS-C4JWH) keep resident in the hub). No light on any.
- `bake.test.ts`'s mirrored dimensions unchanged (no new `WALL_FOOT` entry: the material is
  masonry-thick).

Expected files:
- `game-client/tools/bake/page/models/chapel.js`, `chapel.test.mjs` (the new pieces), and
  `building.js` / `tower.js` / `architecture.js` only to share wall, roof or gable helpers
- `game-client/tools/bake/page/catalogue.js`
- `game-client/public/art/manifest.json` and the regenerated atlas PNGs under `game-client/public/art/`
- `game-client/src/render/art/manifest.test.ts`, `sceneArt.test.ts`,
  `src/scenes/__snapshots__/PreloadScene.test.ts.snap` only where they enumerate sheets or groups

Not touched: `src/render/world/` and `src/scenes/HubScene.ts` (I-R4MYX-13), the server, `folk.js`.

Hotspot: `manifest.json` and the atlases are regenerated wholesale by the bake; one bake at a
time on the branch, never hand-merge the manifest, rebake.

## Acceptance Criteria

- [ ] The manifest carries every sheet listed above with frame sizes and anchors matching their
      `tower_` / `roof_` counterparts (a bake test compares them), `pew` at 20 × 100, in resident
      groups, none with a light.
- [ ] Built in code, no sourced models; `npm run bake -- --check` clean after the commit.
- [ ] Bake tool tests and client vitest (manifest tests included) green.
- [ ] No contact-sheet gate (charter): the owner looks in the browser (I-R4MYX-10).

## Notes (as baked)

- **The gable's frame deviates from its counterpart's** (recorded under FS-R4MYX R42):
  `chapel_roof_gable_x` frames 53 × 257, anchor (0.4906, 0.9377) (`_y` mirrored, x 0.5094),
  against `roof_gable_{x,y}`'s 50 × 202 at (0.5, 0.9208). The masonry thickness widens it and
  the cross finial lifts it: the finial stands about 55 px over the town gable's top, the
  height I-R4MYX-11's R39 chapel ridge allowance (73 px, derived from the frame) covers. Every other chapel building piece frames
  exactly as its `tower_` / `roof_` counterpart.
- **Apex-frame contract:** each gable animation has two frames. Frame 0 is the plain piece;
  frame 1 is the apex piece, the one `planGables` lays against the ridge (its first, k = 0),
  carrying its half of the rose window and its half of the cross. I-R4MYX-13 lays frame 1 at
  k = 0 and frame 0 for every other k.

## Blocked By

None

## Spec Reference

FS-R4MYX §H R36, R38, §I R41–R42 (and the look R23 describes); user stories 14, 31, 34.
