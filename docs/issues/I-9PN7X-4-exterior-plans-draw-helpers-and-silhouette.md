---
id: I-9PN7X-4
status: done
implements: FS-9PN7X
blocked_by: []
labels: [ready-for-agent]
title: "FS-9PN7X slice 4: building exterior plans, draw helpers with placeholders, and the silhouette"
---
Implements FS-9PN7X §B, §E, §F.2–§F.4, §G.1

**Author: agent** (charter: agent lane, client). Built against the sheet names FS §F pins, so it
needs no baked art and runs in parallel with I-9PN7X-1. No scene changes: nothing on screen moves
until I-9PN7X-5 and I-9PN7X-6 wire it.

## What to Build

The scene-agnostic toolkit both scenes wire: what a building's two looks are made of, how to draw
them (art or placeholder), and the silhouette.

1. **Wall sheets** (`walls.ts`): `WallSheets` gains the exterior variant table and the dark
   opening sheet stem (and the cap sheet for masonry; timber has its roof).
   `TIMBER_WALLS.exterior` = plain/brace/window, `MASONRY_WALLS.exterior` = plain/pillar
   (§F.2); the `TOWER_BANDS` tables inherit them by spread, so `worldTheme.ts` needs no edit.
2. **Exterior plan** (pure, `walls.ts` or new `src/render/world/exterior.ts`): for each building,
   its south/east walls cut as exterior pieces (`{prefix}wall_exterior_{kind}_{axis}`, height
   back) on exactly the footprint `cutWall` gives the cut-away pieces (§B.2), and full-height back
   posts at the front corners. The existing `planWalls` output for callers is unchanged; the
   new plan groups pieces by building and look (exterior-only, interior-only, both) so a scene can
   swap them.
3. **Stone cap plan** (pure, `planCap(house)`): one-tile `tower_cap` pieces covering the room rect
   at `BAKE.WALL_BACK`, sorted by footprint like roof pieces; overhang allowed (§F.3).
4. **Door gaps and dark openings** (pure): `doorGaps(walls)` finds each gap between two collinear
   wall segments of one building (the hub's 50 px south gap) from the walls, never a constant;
   a dark-opening spot for a gap or for a door rect (`DoorState`) with axis and sheet
   (`{prefix}door_dark_{x|y}`) (§B.5). Test against the client town mirror
   (`hubTownGolden.ts` / `hubKeepOut` fixture walls, which carry the gaps).
5. **Cover test** (`occlusion.ts`): `coveredBy(subject, pieces)` over the shipped `occludes`
   (§E.1).
6. **Draw helpers** (`scene.ts`): add, beside `addWalls`/`addRoof` (unchanged for their current
   callers), helpers that build a building's exterior parts, cap and dark openings and return
   them grouped per building so a scene can toggle looks. Without a manifest or a sheet: a
   full-height placeholder block, a flat slab at the wall top (like `placeholderRoof`), a flat
   `palette.inkDeep` quad over the gap (§B.7), with one warning per missing sheet. Exterior parts
   are **not** added to `Occluders` (§E.4).
7. **Silhouette** (new `src/render/world/silhouette.ts`) [charter default, §E.3]: a dim, tinted
   copy of a given body sprite's current texture frame, kept on its position each frame, drawn
   above every building piece (world band) and below the blackout (500), markers and HUD; shown
   only when told it is covered. Tint is a canvas token at reduced alpha; record the token and
   alpha chosen here. Player only (§E.2) is the caller's rule, not the helper's.

## Files (expected)

- `game-client/src/render/world/walls.ts` + `walls.test.ts`
- `game-client/src/render/world/exterior.ts` (new) + `exterior.test.ts` (new)
- `game-client/src/render/world/occlusion.ts` + `occlusion.test.ts`
- `game-client/src/render/world/scene.ts` (additive helpers; existing exports' behaviour unchanged)
- `game-client/src/render/world/silhouette.ts` (new) + test where the logic is pure
- `game-client/src/render/world/index.ts` (barrel exports)

Not touched: `HubScene.ts`, `BarrowspireScene.ts`, `worldTheme.ts`, `blackout.ts`/`indoors.ts`
(I-9PN7X-2), the bake, `game-server/**`. Shared with nobody while open: if a later slice needs a
change in `scene.ts` or `walls.ts`, it lands after this one.

## Acceptance Criteria

- [ ] Exterior pieces of a wall share each cut-away piece's `at`, `depthAt`, `keep` and axis; sheet
      names match FS §F.2 for both types; `planWalls` output is unchanged (existing tests green).
- [ ] Front-corner posts in the exterior look are back posts.
- [ ] `planCap` covers the room rect with whole tiles at `WALL_BACK`; deterministic.
- [ ] `doorGaps` finds the three hub door gaps from the town mirror walls, none for a gapless
      building; dark-opening spots carry the right axis and sheet.
- [ ] `coveredBy` unit-tested (overlap and depth both required).
- [ ] Draw helpers fall back to placeholders per §B.7 and never register building parts as
      occluders (test with a stub art library).
- [ ] The silhouette helper copies the frame, follows the position, and shows/hides on command;
      its tint is a canvas token (token fence green).
- [ ] No scene file changes; on Node 22, `npm test`, `npm run lint`, `npm run lint:fence` pass in
      `game-client/`.
- [ ] `git diff -- game-server/` is empty.

## Blocked By

None. Runs in parallel with I-9PN7X-1, I-9PN7X-2, I-9PN7X-3.

## Spec Reference

FS-9PN7X §B.1–§B.5, §B.7 (types, full-height sides, posts, cap, dark openings, placeholders),
§E.1, §E.3, §E.4 (cover test, silhouette method, buildings leave the fade), §F.2–§F.4 (pinned sheet
names), §G.1 (unit tests). User stories 5, 6, 26, 27.

## TDD Approach

- RED: `exterior.test.ts` for exterior pieces on the cut-away footprint, `planCap`, `doorGaps` on
  the town mirror; `occlusion.test.ts` for `coveredBy`.
- GREEN: the plans, then the draw helpers against a stub art library, then the silhouette.

## Silhouette record (§E.3)

The silhouette is a flat fill of the player's current body frame in `palette.markerSelf` (brass)
at alpha 0.45 (`SILHOUETTE_TINT`, `SILHOUETTE_ALPHA`), masked to the part of the body the covering
pieces actually cover (a bitmap mask under WebGL; the canvas renderer ignores masks and fills the
whole body).
