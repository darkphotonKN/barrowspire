---
id: I-V8FT3-2
status: open
implements: FS-V8FT3
blocked_by: [I-V8FT3-1]
labels: [blocked]
title: "FS-V8FT3 slice 2: a dungeon floor's wall shadows are painted flat into its ground (game-client)"
---
Implements FS-V8FT3 §E

**Lane: agent (AFK).** Ships on one branch with I-V8FT3-3 and I-V8FT3-4: painted shadows over the
old art darken every wall twice.

Respecced 2026-11-12 onto FS-XK2B6 (walls on the cell boundary, on main): a dungeon floor's walls
are the edge runs and posts of `wallPlan` / `dungeonWalls`, and its ground lies under walkable
cells only.

How the engine does it is in the FS's Facts ("The engine allows the flattening"): shapes drawn
opaque into a scratch texture, that texture drawn into the ground once at the bake's opacity. If
Phaser 4.2.1 turns out not to behave as its source reads, stop and escalate; do not fall back to
drawing shapes at 50% each.

## Files owned

- `game-client/src/render/world/scene.ts` (`GroundLayer`), `scene.test.ts`
- `game-client/src/render/world/wallShadows.ts`, `wallShadows.test.ts` (the cut at void)
- `game-client/src/scenes/BarrowspireScene.ts` (`buildDungeonWalls` only), `BarrowspireScene.test.ts`

## What to Build

- `GroundLayer` takes shadow shapes and paints them (R19-R23): opaque into a scratch surface per
  ground texture, laid on once at `BAKE`'s opacity and colour, the scratch then destroyed; over the
  ground already painted, with no repaint of its tiles; again on a ground repaint; never twice.
- A dungeon floor hands its edge runs' and posts' shapes to the ground when its walls are built
  (from the pieces `dungeonWalls` draws and the plan's posts, at the material's `thicknessPx`),
  cut at the walkable cells' edge: no shadow on a wall cell or the void (R23), the cut made in the
  scratch so a shadow over several cells has no seam; a shadow never makes a chunk's texture.
- Nothing follows the occluder fade (R24).

## Acceptance Criteria

- [ ] All shapes of one ground texture are drawn opaque into one scratch surface, and that surface
      is laid on the ground texture once, at `BAKE`'s shadow opacity and colour. Nothing draws a
      shape onto the ground at an alpha below 1.
- [ ] After painting, the scratch surface is destroyed; the scene's display list and texture
      manager hold nothing for shadows.
- [ ] A shape lying across two chunks is drawn into both from the same screen px.
- [ ] Painting shadows does not clear a ground texture or stamp a ground tile; asking for the same
      walls' shadows again paints nothing; a ground repaint paints them once more.
- [ ] On the sample floor the chunks with a texture are the same 65 before and after, and no
      shadow px is laid on a wall cell or the void: every px a shadow covers is in a walkable
      cell.
- [ ] Every shadow over walkable cells is laid whole: the cut takes only what lies on a wall cell
      or the void.
- [ ] A fading occluder changes no ground texture.
- [ ] Without the wall sheets (placeholder walls) or without the ground's art, no wall shadow is
      painted and nothing fails.
- [ ] `npx vitest run --maxWorkers=4` and `npm run lint` in game-client pass.

## Blocked By

I-V8FT3-1. Blocks I-V8FT3-3 and I-V8FT3-5.

## Spec Reference

FS-V8FT3 §C R13, §D R15-R16 (a dungeon run's foot), §E R19-R24; edge states "A shadow reaching
void", "A ground piece past an edge", "A run one cell long", "A straight wall that changes
height", "Walls before ground", "A new floor", "The scratch surface", "Chunks hidden far from the
camera"; user stories 1-4, 8, 11-13.

## TDD Approach

- RED: `scene.test.ts`: a ground handed two overlapping shapes draws both at alpha 1 into a scratch
  and stamps the scratch once at 0.5; a second ask stamps nothing.
- GREEN: the paint pass in `GroundLayer`, then the dungeon wiring.
