---
id: I-8RBQY-2
status: done
implements: FS-8RBQY
blocked_by: [I-8RBQY-1]
labels: [ready-for-agent]
title: "FS-8RBQY slice 2: world theme seam and the tower interior in the run scene (ground, partitions, perimeter, light, no roofs, stone fallback)"
---
Implements FS-8RBQY §0, §A, §B

Wires slice 1's sheets into the run scene behind a **world theme**, defaulting to `"tower"`, and
keeps today's look intact as `"exterior"`. Per-floor variation, dressing and the stairs are
slice 3. This slice draws one fixed tower look on every floor (the `middle` band's materials and
wall shares). Slice 3 makes them vary.

> Sequenced, not parallel: slice 3 edits `BarrowspireScene.ts`, `scene.ts`, `ground.ts`,
> `walls.ts` and `worldTheme.ts` after this one. Siblings are concurrently editing
> `game-server/**` and `src/render/effects/**`. This slice touches neither.

## Files owned

All paths under `game-client/src/`.

- `render/world/worldTheme.ts` + `worldTheme.test.ts` (new): the `WorldTheme` type
  (`"exterior" | "tower"`), the run scene's default constant (`"tower"`), and the per-theme
  descriptor (ground plan, wall sheet set, roofs on or off, indoor mask on or off, ambient,
  perimeter on or off, dressing on or off).
- `render/world/perimeter.ts` + `perimeter.test.ts` (new): the perimeter wall plan around
  `[0,1440]×[0,960]`.
- `render/world/walls.ts` + `walls.test.ts`: the variant table becomes a parameter (exterior's
  `KINDS` unchanged; tower back and front tables).
- `render/world/ground.ts` + `ground.test.ts`: the tower ground plan (flags in halls, planks
  under rooms, no grass or tuft decals).
- `render/world/scene.ts`: `addWalls` takes the theme's sheet set; a perimeter adder.
- `render/world/index.ts`: exports.
- `render/lighting/lighting.ts` + `lighting.test.ts`: the tower ambient.
- `render/markers/markers.test.ts`: the tower-ambient contrast case.
- `utils/canvasPalette.ts`: neutral stone fallback roles (token blends only).
- `scenes/BarrowspireScene.ts` (and `BarrowspireScene.test.ts` if it needs updating): theme
  wiring for ground, walls, roofs, indoor mask, `underRoof`, the HUD suffix, the ambient,
  perimeter build and teardown at `leaveFloor`, sconce and slit lights, and the
  `createMapBackground`/`metalFloor` fallback.

Not owned: `render/world/stairs.ts`, `render/world/hubKeepOut.ts`, `scenes/HubScene.ts`,
`render/effects/**`, `utils/theme.ts`, and every file slice 1 owns.

## What to Build

1. **Theme seam** (FS-8RBQY §A.1–§A.2): `worldTheme.ts` names the world theme and holds a
   descriptor per theme. The run scene reads the default constant. No UI, no config fetch, no
   wire field.
2. **Exterior unchanged** (§A.3): every exterior path goes through the descriptor but produces
   exactly today's ground, walls, roofs, indoor mask, HUD suffix and `AMBIENT.run`.
3. **Tower ground** (§B.1): halls in `ground_flags`, room floors (the `planFloors` grid) in
   `ground_planks`, and no grass or tuft decals.
4. **Partition walls** (§B.2): the same `housesFrom`/`cutWall`/`planWalls` geometry and cut-away
   rule, drawn with `tower_wall_*`/`tower_post_*` and the tower variant tables (back: plain,
   pillar, sconce, banner, cobweb; front: plain, pillar). Variant choice stays the per-piece
   hash.
5. **No roofs indoors** (§B.3, R1): no roof sheet or placeholder slab and no roof occluder; the
   indoor mask never shows; `underRoof` is false everywhere (trail glow and back-wall halos
   always shown); the HUD position line drops "| Indoor"/"| Outdoor". The floor label and card
   are unchanged.
6. **Doors and interactables kept** (§B.4): doors, entrance markers, chests, drop piles, escape
   door and switch are drawn as today.
7. **Perimeter wall** (§B.5, R2): planned wholly outside the play area; north and west runs in
   `tower_perimeter_back_*` with slits at a fixed deterministic spacing; south and east runs in
   `tower_perimeter_front_plain_*` only; corner posts; sorted by footprint; nothing painted
   beyond it. Built per floor and torn down in `leaveFloor`.
8. **Light** (§B.6): the tower ambient (darker than `AMBIENT.run` by relative luminance, mixed
   from tokens). Sconce and slit lights are stamped once per floor build via `LightMap.add`, with
   no halo gating. No per-frame texture rebuild.
9. **Readability** (§B.7): extend the marker contrast test to the tower ambient against the
   darkest tower ground mean, at 3:1 or better.
10. **Stone fallback** (§B.8, R4): with no manifest, partitions use the placeholder wall drawing
    (the perimeter may be skipped), and the ground fallback is a neutral dark stone fill from
    tokens. Remove the `metalFloor` tile, the viewport windows and stars, and the hull lights.
    Keep it minimal.

## Acceptance Criteria

- [ ] `worldTheme.ts` names `"exterior" | "tower"`; the run scene's default is `"tower"`.
- [ ] With `"exterior"`, the ground plan, wall sheets and variant table, roofs, indoor mask, HUD
      suffix and ambient equal today's (planner unit tests; checked once by hand in the scene).
- [ ] The tower ground plan has no grass or tuft decals; halls are `ground_flags` and room floors
      `ground_planks` (unit-tested).
- [ ] Tower partition pieces keep the cut-away rule and draw only the §B.2 variants
      (unit-tested on `planWalls`).
- [ ] Tower theme: no roof drawn or registered as an occluder; the indoor mask never shows;
      `underRoof` is false everywhere; no Indoor/Outdoor suffix; floor label and card unchanged.
- [ ] Every perimeter piece lies outside `[0,1440]×[0,960]`; north and west are back height with
      slits, south and east front height only; the plan is identical across calls
      (unit-tested).
- [ ] Perimeter and its lights are torn down in `leaveFloor` and rebuilt on the next floor.
- [ ] The tower ambient is darker than `AMBIENT.run` by relative luminance (unit-tested), and
      `markers.test.ts` holds 3:1 or better for it.
- [ ] Sconce plus slit fixed lights on a floor stay at or under 24 for the server's three-room
      layout (unit-tested on a fixture of the largest layout).
- [ ] The no-manifest fallback ground is neutral dark stone from tokens; `metalFloor`, the
      viewport windows, stars and hull lights are gone in both themes.
- [ ] No hex literal and no `Math.random` on the baked path in new code.
- [ ] On Node 22 (`export PATH=~/.nvm/versions/node/v22.13.1/bin:$PATH`), `npm test`,
      `npm run lint`, `npm run lint:fence` and `npm run bake -- --check` pass in `game-client/`.
- [ ] `git diff -- game-server/` shows nothing from this slice, and `src/types/gameState.ts` is
      unchanged.
- [ ] Hand-back describes the tower and exterior looks for the coordinator's visual check at
      integration (no owner HITL gate).

## Blocked By

- I-8RBQY-1 (the tower sheets and their manifest entries must exist).

## Spec Reference

FS-8RBQY §0 (boundary), §A (world theme seam, exterior unchanged, per-floor seam), §B (tower
ground, partition walls, no roofs per R1, doors kept, perimeter per R2, light, readability, stone
fallback per R4). User stories 1–7, 13–14, 17–19, 21, 23, 25–26.

## TDD Approach

- RED: `worldTheme.test.ts` expects the default `"tower"` and the descriptor fields;
  `perimeter.test.ts` expects every piece outside the play area with the north/west back and
  south/east front split; `ground.test.ts` expects no grass or tufts in the tower plan and
  today's plan unchanged for exterior; `walls.test.ts` expects only tower variants on tower
  pieces; `lighting.test.ts` expects the tower ambient darker than `AMBIENT.run`.
- GREEN: the descriptor, the planners and the scene wiring.
