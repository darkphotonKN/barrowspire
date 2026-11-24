---
id: I-R4MYX-14
status: done
implements: FS-R4MYX
blocked_by: []
labels: []
title: "FS-R4MYX slice 14: bake the chapel's inner lancet, the crucifix and the two murals"
---
Implements FS-R4MYX §Change: The chapel's windows match inside and out, and its west wall carries the crucifix (§W-B W8–W11, W14)

**Lane: bake art (agent), AFK.** Nothing in `src/` reads these sheets until I-R4MYX-15.

## Files it expects to touch

- `game-client/tools/bake/page/models/chapelBuilding.js` and `chapelBuilding.test.mjs`: the inner
  lancet piece, reusing `LANCET` and the back-piece builder (`chapelWall`)
- `game-client/tools/bake/page/models/chapel.js` and `chapel.test.mjs`: `chapelCrucifix` and
  `chapelMural`. `hall.js` only to share the paintings' hang height and the facing helper, not to
  change them
- `game-client/tools/bake/page/catalogue.js` (`chapelBuildingSheets`, `chapelSheets`)
- `game-client/public/art/manifest.json` and the regenerated `chapel` atlas PNG(s) under
  `game-client/public/art/`
- `game-client/src/render/art/manifest.test.ts`, and `sceneArt.test.ts` /
  `src/scenes/__snapshots__/PreloadScene.test.ts.snap` only where they enumerate sheets

Not touched: `src/render/world/`, `src/scenes/` (I-R4MYX-15), the server.

Hotspot: the bake regenerates `manifest.json` and the atlases wholesale. Run one bake at a time on
the branch. Never hand-merge the manifest: rebake.

## What to Build

All three are authored in code (ADR-0020, ADR-0021), with colours from `BARROW` and the whites mixed
toward `vellum`.

- **`chapel_wall_back_lancet_{x,y}`** (W8):
  - What it shows: the chapel wall's inner face, whitewashed and aged as
    `chapel_wall_back_plain_*` is, pierced by a pointed window with a splayed reveal (jambs and
    sill widening into the room) and dark leaded glass.
  - The opening's sill, springing and half-width are the outward lancet's `LANCET`, so the window
    stands at the same height inside and out.
  - Frame size and anchor exactly as `chapel_wall_back_plain_{x,y}`, with two variants by seed
    and the same `PAINTED_SHADOW`.
  - Unlit, and the manifest declares no light. `_y` is baked but laid nowhere yet.
- **`chapel_crucifix`** (W9):
  - What it shows: a large dark-wood cross with a carved figure, aged (worn, cracked, the
    figure's paint mostly gone).
  - Hung like `painting`'s `e` facing, on a west wall's inner face, facing east, with one
    animation, `e`.
  - Centred at the paintings' hang height, with its top below `WALL_BACK`.
  - Indicative size: about 1.0 tile edges across the arms and 1.7 tall.
  - `shadow: false`, no light.
- **`chapel_mural`** (W10): two variant frames by index.
  - What they show: faded fresco panels painted on the plaster, with cracked plaster edges and
    flaked, muted colour. Variant 0 is a robed saint with a halo; variant 1 is the dead rising
    from their graves.
  - Faced `e`, centred at the paintings' hang height, with their top below `WALL_BACK`.
  - Indicative size: about 1.6 tile edges across and 1.3 tall.
  - `shadow: false`, no light.
- All three go in the resident `chapel` group (W11). Every non-chapel atlas keeps its bytes; the
  `chapel` atlas may reflow.

## Acceptance Criteria

- [ ] The manifest carries `chapel_wall_back_lancet_x` and `_y`, each framed exactly as
      `chapel_wall_back_plain_{x,y}` (frame size, anchor, two variants), and a test compares them.
- [ ] The manifest carries `chapel_crucifix` (animation `e`) and `chapel_mural` (animation `e`,
      two frames), both `shadow: false`.
- [ ] None of the three declares a light. All are in the `chapel` group.
- [ ] Every non-chapel atlas PNG is byte-identical to `main`. `npm run bake -- --check` is clean
      after the commit.
- [ ] Bake tool tests and the client vitest (manifest tests included) are green.
- [ ] No contact-sheet gate: the owner looks in the browser (I-R4MYX-16).

## Blocked By

None

## Spec Reference

FS-R4MYX §Change: The chapel's windows match inside and out, and its west wall carries the
crucifix. W8–W11 (the sheets) and W14 (no light); user stories 2, 5, 6, 7.
