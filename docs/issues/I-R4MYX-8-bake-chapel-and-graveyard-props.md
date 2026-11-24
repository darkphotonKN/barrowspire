---
id: I-R4MYX-8
status: done
implements: FS-R4MYX
blocked_by: []
labels: [ready-for-agent]
title: "FS-R4MYX slice 8: bake the chapel, belfry and graveyard props in code"
---
Implements FS-R4MYX §H Requirements 36, 38

**Lane: bake art (agent).** Runs in parallel with every code slice: the scene draws placeholders
(furnishings) or nothing (dressing) until these sheets exist.

## What to Build

Ten new prop sheets authored in code in `tools/bake` like the town's existing props (ADR-0020,
ADR-0021, `game-client/docs/design-guideline.md` Part I): dark fantasy, weathered, colours from
`BARROW`.

- Chapel: `pew` (20 × 70 footprint, long along y, back to the east, seat facing west), `altar`
  (30 × 80, long along y, stone with a dark cloth), `lectern` (about 20 × 20, a closed book),
  `dais` (flat, 130 × 200, a low stone platform's top and its front edge; drawn on the floor decal
  layer like `rug`).
- `belfry`: a weathered timber-and-stone bell frame with a dark bell under a little roof, topped by
  an iron cross bent a little off true; tall (an occluder); about a 40 × 40 footprint.
- Graveyard: `headstone` (variant frames: at least two **intact** shapes; **weathered** cracked,
  leaning and chipped; **broken stump**; all facing east), `grave_flowers` (**fresh** posy, the yard's
  one warm note; **withered** brown stems), `grave_mound` (50 × 28, raw dark earth),
  `stone_cross` (tall, lichened), `graveyard_wall` (one tile of low dry-stone along x and along y,
  **whole** and **crumbled**).
- Each in a **resident** atlas group (not one of `SCENE_ART`'s scene-scoped groups), so the hub
  draws it without a scene change (e.g. `interior` for the chapel's, `town` for the rest).
- Anchors and frame sizes so each prop stands on its footprint as the FS's rects give it.
- No light on any of them (the chapel's light is the existing `candelabra`).

Expected files:
- `game-client/tools/bake/page/models/` (a new `chapel.js`, or additions to `interior.js`,
  `town.js`, `nature.js`)
- `game-client/tools/bake/page/catalogue.js`
- `game-client/public/art/manifest.json` and the regenerated atlas PNGs under `game-client/public/art/`
- bake tool tests beside the models, where the existing ones test similar props

Not touched: `src/` (the scene, the mirror), the server, `folk.js` (I-R4MYX-9).

Hotspot: `manifest.json` and the atlases are regenerated wholesale by the bake. I-R4MYX-9 bakes
after this one, never in parallel; never hand-merge the manifest, rebake.

## Acceptance Criteria

- [ ] The ten sheets in the manifest with anchor, frame size, variants as listed, in resident groups.
- [ ] Built in code, no sourced models; `npm run bake -- --check` clean after the commit.
- [ ] Bake tool tests and client vitest (manifest tests included) green.
- [ ] No contact-sheet gate (charter): the owner looks in the browser (I-R4MYX-10).

## Blocked By

None

## Spec Reference

FS-R4MYX §H R36, R38; user stories 5, 13–17.
