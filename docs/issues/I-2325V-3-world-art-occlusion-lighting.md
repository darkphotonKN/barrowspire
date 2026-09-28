---
id: I-2325V-3
status: done
implements: FS-2325V
blocked_by: [I-2325V-1, I-2325V-2]
labels: [ready-for-agent]
title: "FS-2325V slice 3: world art, occlusion and light-map in hub and run"
---
Implements FS-2325V §C

**Wave 2.** Needs the projection (slice 1) and the atlases and loader (slice 2). Can run
alongside I-2325V-4 if that slice keeps to the container UI.

## What to Build

Replace the placeholder world with the baked art, and light it.

1. **Ground** from ground tiles picked by hashing world tile coordinates (deterministic across
   clients). Flagstone inside house bounds (walls grouped by `house_id`, as the scene already
   derives them). Decals scatter deterministically.
2. **Walls**: server wall rects cut into one-tile pieces with corner posts and deterministic
   variants.
   - North- and west-facing sides are full height; south and east sides are the low cut-away.
   - Rects that aren't a whole number of tiles end in a trimmed piece.
3. **Roofs**: `indoorMask` behavior carried over as roof sprites that hide while the delver is
   inside and return on exit (same inside test as today).
4. **Interactables** (doors, escape doors, switches, containers) show the baked frame for their
   server state and swap on change. Interaction code is unchanged.
5. **Occlusion fade**: trees and tall props overlapping the delver with a greater depth key fade
   to ~40% alpha, then restore.
6. **Footprint hit-testing** for clickable world objects.
7. **`src/render/lighting/`**: a camera-fixed multiply render texture, refilled with the world's
   ambient each frame, with additive stamps per light source.
   - Sources are manifest-declared props in view plus the delver's torch pool, which replaces
     FS-W6BP1's overlay pool.
   - Off-screen sources are culled.
   - Flicker is time-based.
   - Flame particles and halos draw above the light-map.
   - Built once, never rebuilt, and reused across reconnect.
8. **Ambient per world type**: warm dusk in the hub, dark barrow in the run. The vignette stays,
   above the light-map and below the HUD.
9. **Readability floor**: an edge-of-canvas hostile stays readable in the run's darkest ambient;
   if not, ambient lifts.

## Acceptance Criteria

- [ ] `git diff main... -- game-server/` is empty; no WS payload field changes.
- [ ] Same place → same ground on two clients (seeded check or two-tab manual compare).
- [ ] Walls have cut-away fronts; roofs hide and return on entering and leaving a house.
- [ ] Door, escape door, switch and container frames track server state.
- [ ] Occluders fade and restore.
- [ ] Light-map shows declared sources plus the delver pool; hub ambient ≠ run ambient; the
      edge-hostile readability check passes.
- [ ] Missing sheet → placeholder for that entity, no crash.
- [ ] `npm run lint`, `npm run lint:fence`, `npm test` pass.

## Blocked By

I-2325V-1 (projection), I-2325V-2 (atlases + loader)

## Spec Reference

FS-2325V §C.1–C.11. User stories 2, 9, 10, 11, 12, 13, 14, 18.

## TDD Approach

- RED: `ground.test.ts`: the tile picker returns the same variant for the same world tile across
  calls and seeds per world. `walls.test.ts`: a 5.5-tile rect yields 5 full pieces and 1 trimmed
  piece, with the correct back/front height by side.
- GREEN: pure helpers in `src/render/` consumed by the scenes.
