---
id: I-KE075-5
status: done
implements: FS-KE075
blocked_by: []
labels: [ready-for-agent]
title: "FS-KE075 slice 5: the client draws a dungeon floor from its map: chunked ground, void, the wall-height rule, no buildings, near-camera walls, dressing and lights (game-client)"
---
Implements FS-KE075 §H (Requirements 44–47, 49, 50)

**Lane: agent (AFK), game-client.**

## What to Build

With a floor map that carries regions (the golden from slice 1, exported as a client fixture), the run scene draws: ground in render-texture chunks of at most 2048 px, painted only under walkable and shell cells, void as `palette.inkDeep`; wall pieces from the map's rects with the dungeon height rule (front when a walkable cell lies directly north or west, back otherwise, front wins; full pieces covering the player fade by the occluder rule); no building exterior, roof, stone cap, silhouette, indoor blackout or perimeter; run dressing inside rooms only, clear of doorways and corridors, at FS-8RBQY §C's density; wall lights on rooms' back walls; wall pieces, dressing and wall lights grouped by chunk and visible only within one chunk of the camera's view. Floors 2–3 keep exactly today's drawing (the ground is chunked there too, which at their size is one chunk).

## Files (expected)

- new `game-client/src/render/world/dungeon.ts` (region grid, wall-height rule) and its test
- new `game-client/src/render/world/chunks.ts` (chunk grid, visibility by camera) and its test
- `game-client/src/render/world/ground.ts`, `scene.ts` (chunked ground)
- `game-client/src/render/world/walls.ts` (height from the region grid on a dungeon floor)
- `game-client/src/render/world/runDressing.ts`, `floorLights.ts`, `perimeter.ts`, `worldTheme.ts`
- `game-client/src/scenes/BarrowspireScene.ts` (dungeon-floor branch: no houses, blackout or perimeter; chunk visibility on camera move)
- new fixture `game-client/src/render/world/dungeon.fixture.json` (from the levelgen golden)

## Acceptance Criteria

- [x] Ground chunks are ≤ 2048 px; void is `palette.inkDeep`; no roof, stone cap, blackout or perimeter on a dungeon floor
- [x] Wall-height unit tests over room and corridor fixtures: front for walkable north or west, back otherwise, front wins
- [x] Panning the camera over the fixture keeps visible wall pieces, dressing and wall lights to chunks within one chunk of the view
- [x] Dressing never stands in a corridor or within one cell of a doorway
- [x] Floors 2–3 screenshots still match the slice-3 captures
- [x] Typecheck and vitest pass; a headless frame-time sample on the fixture floor is recorded in the PR

## Evidence (2026-11-06, review fix round 1, branch floor1/fix-client)

- Chunks, void, no buildings: `BarrowspireScene.test.ts` "should paint the ground in chunks no
  larger than 2048 px, nothing on a void cell", "should leave void to the camera's background, the
  darkest ink", "should stand no building, roof, stone cap, blackout or perimeter wall on a
  dungeon floor". Review M4: "should make no ground texture for a chunk no walkable or shell cell
  falls in": 128 render textures, 116.8 MiB of RGBA (about 122 MB; 145.9 MiB with an 8-bit
  stencil) before, 71 and 64.8 MiB (81.0 MiB with stencil) after. Review L13: "should paint a
  dungeon floor's ground once as it is built, and not again as the party leaves it" (2 paints and
  1 on leaving before, 1 and 0 after), "should lay the placeholder floor without its art under
  ground cells only".
- Wall height: `dungeon.test.ts` "the dungeon wall-height rule (FS-KE075 §H.46)" over room and corridor floors.
- Panning: "should show wall pieces, dressing and wall lights only within one chunk of the view,
  as the camera pans".
- Dressing: `dungeon.test.ts` "where a room's dressing may stand" (no
  corridor, no doorway, nothing within one cell of one); review M1: the plan is the floor map's and
  every snapshot's fixtures alone, the same for every member, and a piece gives way to a container
  first seen by it (`dressingStandsBy`; the two scene tests above).
- The fixture is the levelgen golden's floor (`tools/fixtures/dungeon-fixture.mjs`, held by
  `dungeon.test.ts`); the doorway and room tests read the golden's rooms.
- **Floors 2–3 against the FS-KE075 captures:** `docs/fixtures/KE075-floors/floorcap.cjs`
  `MODE=new` against a `next dev -p 4095` of floor1/fix-client (7c233b70) and the local stack, then
  `cmp.cjs` against `floor{2,3}-base`, three runs: floor 2 stable base/new 552/550, 552/550,
  552/552 (only base 2, 2, 0: the player knight's idle frame, sprite and shadow); floor 3 650/650,
  650/650, 650/648 (the knight's idle frame and one halo's flicker); pixels off by more than
  24/255 0.000% every time (2–25% of pixels off by less: the torch flicker). `MODE=late` (the map
  withheld 2.6 s, then requested and built): floor 2 against its base capture, 0.000% off by more
  than 24/255. Dev server stopped and captures deleted afterwards.
- Frame time, headless Chrome at render scale 1 on the fixture floor (fogcheck), five spots:
  step mean 1.18–1.78 ms with the fog, 1.18–1.35 ms without it; frames vsync-bound at 16.67 ms
  mean, p95 ≤ 16.8 ms. Render scales 1.5 and 2: no errors.
- Typecheck and vitest (240 files, 5,858 tests) pass.

## Blocked By

I-KE075-1, I-KE075-3

## Spec Reference

FS-KE075 §H.44–47, §H.49–50. ADR-0061 Decision 11. Art: FS-8RBQY sheets only.

## TDD Approach

- RED: a test that a wall with walkable cells both north and south is front
- GREEN: the dungeon module, chunks and the scene branch
