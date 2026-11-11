---
id: I-XK2B6-3
status: open
implements: FS-XK2B6
blocked_by: [I-XK2B6-1, I-XK2B6-2]
labels: [blocked]
title: "FS-XK2B6 slice 3: the fog's wall slabs and posts stand on the wall edges (game-client)"
---
Implements FS-XK2B6 §F, §H

**Lane: agent (AFK).** Merges together with I-XK2B6-2 and I-XK2B6-4.

## Files owned

- `game-client/src/render/world/fog.ts`: `WallLayout`, `wallLayout`, `Half`, `halfOf`, `topOf`,
  and `Fog`'s constructor only so far as it takes the plan. The partition (`fogShapes`' strips and
  envelopes), the feather (`fogField.ts`), the fades and the gates' tint rule are not redesigned.
- `game-client/src/render/world/fog.test.ts`
- `game-client/src/scenes/BarrowspireScene.ts`: the `Fog` built in `buildDungeonWalls` only
- `game-client/src/render/world/dungeon.ts` and `dungeon.test.ts`: remove `wallRuns` and the
  per-cell `wallRule` once nothing reads them

## What to Build

The fog leaves clear a slab over each wall edge of I-XK2B6-1's plan, raised to that edge's height
plus `FOG.headroom`, and a post at each plan post, raised to its height plus `FOG.post` (R18). No
slab through a cell's middle, no post at a cell's centre, and no "half past the post" rule (R26).
What the code allows, read before starting: a cell's north and east edges are the two outer sides
of its right half and its west and south edges those of its left half, so an edge slab is one line
across a whole half (one per slope family, so a half can hold two); a cell corner lies on a
strip's side as a centre does, so a post is cut the same way. A corner is shared by four cells:
give the post to a wall cell's half, never a walkable one, so no veil is laid over it. A wall cell
bordering a region stays unveiled (R19). One veil per px, the soft edges, the fades, the head
clearance and the tint rule are unchanged (R20). The fog is still painted into canvas textures; no
mask is added (ADR-0057).

*(Amended 2026-11-12 for the owner's ruling E4, FS-XK2B6 R18: a slab stands over its edge's height
by its wall's top face and a post by its cap, worked out from the wall's thickness and the cap's
size, in place of `FOG.headroom` and the 14 px `FOG.post`.)*

If the partition cannot hold this without a redesign of `fogShapes`, stop and escalate with what
it does allow.

## Acceptance Criteria

- [ ] `wallLayout` gives a slab for every wall edge of the plan and a post for every plan post,
      and nothing else.
- [ ] With every region of the fixture unexplored, no fog px lies over any drawn piece or post,
      from its foot to its top: checked against the pieces of I-XK2B6-2, back and front.
- [ ] No two fog shapes overlap (the existing partition test, unedited in what it asserts).
- [ ] With one region visible, every other region's cell middle is fogged, behind a drawn wall's
      slab, or where a member's head could be, for every region in turn (FS-SRA9J's existing
      test).
- [ ] A wall piece's tint is that of the brightest region its wall cell borders; a wall cell
      between a visible and an unexplored region shows both its walls plain.
- [ ] `wallRuns` and the per-cell height rule are gone from `src/` if nothing reads them.
- [ ] `npx vitest run --maxWorkers=4 --minWorkers=1` and `npm run lint` in game-client pass.

## Blocked By

I-XK2B6-1, I-XK2B6-2. Blocks I-XK2B6-5.

## Spec Reference

FS-XK2B6 §F R18-R20, §H R26; user stories 8, 9; Acceptance Criteria "Fog"; Edge States "A wall
cell between two regions under different fog". Replaces "the wall on its cell's centreline" of
FS-SRA9J §C.13.

## TDD Approach

- RED: a room whose north wall cells hold one edge each: the layout has a slab on each cell's
  south side and none through its middle; the px above the edge up to the wall's top are clear.
- GREEN: slabs per edge and posts per corner from the plan; `topOf` takes an edge's line.
- Then the fixture sweeps.
