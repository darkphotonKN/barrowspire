---
id: I-2325V-1
status: done
implements: FS-2325V
blocked_by: []
labels: [ready-for-agent]
title: "FS-2325V slice 1: guideline rewrite + isometric projection in hub and run (placeholder graphics)"
---
Implements FS-2325V §0, §A

**Wave 1. Runs in parallel with I-2325V-2** (no shared files: this slice touches the guideline,
`src/render/iso/`, and the two scenes; slice 2 touches only `tools/bake/`, `public/art/`,
`src/render/art/`).

## What to Build

The world moves onto the 2:1 isometric diamond while still drawn with today's placeholder
graphics. The game plays identically; only where things are drawn changes.

1. **Guideline first.** Rewrite `game-client/docs/design-guideline.md` Part I to the
   pre-rendered isometric medium.
   - Replace "Art Technique — Pixel Art", "Still pending on assets", "Perspective", "UI Chrome
     (align to pixel art)" and the Alagard revisit note.
   - Keep palette, gameplay-accent channels, readability floor and typography intact.
   - Update `docs/theming_plan.md` to match.
2. **`src/render/iso/`** provides:
   - `worldToScreen` / `screenToWorld` (exact inverses, 64×32 tile);
   - the footprint depth key (`x + y`);
   - projected camera bounds;
   - `WORLD_PX_PER_TILE`, calibrated from server entity sizes (player collision size, wall
     thickness, door width) so a delver spans roughly one tile, with the derivation commented at
     the constant.
3. **Migrate HubScene and BarrowspireScene.**
   - Every world draw position goes through `worldToScreen`.
   - World objects depth-sort by footprint.
   - The camera follows and clamps in projected space.
   - Out-of-diamond corners are a dark fill.
   - Placeholder rect walls and houses may be drawn as simple projected quads; art comes in
     slice 3.
4. **Gameplay distances on world positions.** Every `Phaser.Math.Distance.Between` call in BarrowspireScene
   (≈L2023, 2086, 2761, 2779, 2797, 3104, 3745; audit for more) measures world positions,
   never sprite positions. The same applies in HubScene.
5. **Pointer → world.** `pointer.worldX/worldY` (BarrowspireScene ≈L3101–3163) goes through
   `screenToWorld` before being sent as `target_x/target_y` or used for effect direction.
6. **8-way facing** from the velocity the client already renders (replacing 4-way
   `up/down/left/right`). Existing character textures may reuse the nearest of their 4 facings
   until slice 5.

## Acceptance Criteria

- [ ] `git diff main... -- game-server/` is empty.
- [ ] No WS action or payload field changes. `move {vx, vy}` sends exactly what it sends today
      for each key.
- [ ] Guideline Part I and `theming_plan.md` describe pre-rendered isometric art; carried-over
      sections are unchanged.
- [ ] vitest: `worldToScreen(screenToWorld(p)) ≈ p` and the reverse; depth-key ordering;
      camera-bounds corners.
- [ ] No gameplay distance computed from sprite `x/y` in either scene.
- [ ] Manual: clicking beside a known entity sends a target within one tile of that entity's
      world position.
- [ ] Manual: hub and run both render, move, collide (server-side), open doors, loot chests and
      end a run exactly as before.
- [ ] `npm run lint`, `npm run lint:fence`, `npm test` pass.

## Blocked By

None

## Spec Reference

FS-2325V §0 (boundary), §A.1–A.7. User stories 1, 3, 4, 5, 20, 21, 26, 27.

## TDD Approach

- RED: `iso.test.ts`: round-trip world→screen→world for a grid of points; origin maps to the
  diamond's top vertex; depth key orders `(1,1)` after `(0,1)`.
- GREEN: implement `src/render/iso/projection.ts`.
