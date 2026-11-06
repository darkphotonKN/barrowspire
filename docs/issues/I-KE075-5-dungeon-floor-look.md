---
id: I-KE075-5
status: open
implements: FS-KE075
blocked_by: [I-KE075-1, I-KE075-3]
labels: [blocked]
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

- [ ] Ground chunks are ≤ 2048 px; void is `palette.inkDeep`; no roof, stone cap, blackout or perimeter on a dungeon floor
- [ ] Wall-height unit tests over room and corridor fixtures: front for walkable north or west, back otherwise, front wins
- [ ] Panning the camera over the fixture keeps visible wall pieces, dressing and wall lights to chunks within one chunk of the view
- [ ] Dressing never stands in a corridor or within one cell of a doorway
- [ ] Floors 2–3 screenshots still match the slice-3 captures
- [ ] Typecheck and vitest pass; a headless frame-time sample on the fixture floor is recorded in the PR

## Blocked By

I-KE075-1, I-KE075-3

## Spec Reference

FS-KE075 §H.44–47, §H.49–50. ADR-0061 Decision 11. Art: FS-8RBQY sheets only.

## TDD Approach

- RED: a test that a wall with walkable cells both north and south is front
- GREEN: the dungeon module, chunks and the scene branch
