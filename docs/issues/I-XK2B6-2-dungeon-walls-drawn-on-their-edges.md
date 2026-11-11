---
id: I-XK2B6-2
status: open
implements: FS-XK2B6
blocked_by: [I-XK2B6-1]
labels: [blocked]
title: "FS-XK2B6 slice 2: a dungeon floor's walls, posts and wall lights are drawn on their wall edges (game-client)"
---
Implements FS-XK2B6 §A, §B, §C, §D, §G, §H

**Lane: agent (AFK).** Merges together with I-XK2B6-3 and I-XK2B6-4: alone it leaves the fog's
slabs 40 px off each wall and a strip of floor beyond each wall (FS-XK2B6 Edge States).

## Files owned

- `game-client/src/render/world/walls.ts`: pieces and posts for an edge run; `betweenPosts` and
  `withinPosts` removed. `planWalls` with no piece rule, `cutWall`, `cutExterior` and
  `INTERIOR_PARTITION` must give what they give today.
- `game-client/src/render/world/scene.ts`: `addWalls` only, if it must take the plan
- `game-client/src/scenes/BarrowspireScene.ts`: `buildDungeonWalls` only (baked pieces,
  placeholder blocks, lights, chunks, occluders). The `Fog` it builds keeps reading `wallRuns`,
  `wallRule` and `wallLayout` until I-XK2B6-3: leave those three compiling and unchanged, save
  the next line.
- `game-client/src/render/world/dungeon.ts`: `wallRule` loses its `betweenPosts` property; and,
  since ruling E1 (2026-11-11), `edgeHeight` and where `wallPlan` ends a run (R3, R4, R8), with
  their cases in `dungeon.test.ts`. Nothing else.
- `game-client/src/render/world/{walls,scene,runDressing}.test.ts`,
  `game-client/src/scenes/BarrowspireScene.test.ts`: dungeon cases only

No test of the hub, a field, a building or the perimeter is edited (R22).

## What to Build

A dungeon floor draws its walls from I-XK2B6-1's plan. Each run's pieces lie end to end along its
edge, two per cell, none trimmed, each piece's centre half a thickness inside its wall cell so the
face towards the walkable cell stands on the edge (R1-R3). A post stands at each run end (R4).
Each piece takes its run's height, and may be a lit kind only on a back run facing a room (R8, R9,
R13); a light is queued where its piece now stands. Back pieces and posts join the occluders
(R10). Every piece and post joins the ground chunk it stands in and is gated by the fog where it
stands (R15). A piece sorts by the corner of its footprint away from the cells its edge faces (R12, ADR-0074):
the front corner when its wall cell lies south or east of the edge, the back corner otherwise.
The placeholder blocks, drawn without the wall art, stand on the same edges at the same thickness
and heights. With no piece past a post left to drop, `betweenPosts`, `withinPosts` and the
placeholder filter go, with their tests (R25, R26). Dressing is not changed: pin that its plan for
the fixture is what it is today (R14).

## Acceptance Criteria

- [ ] On the fixture every run is cut into two whole pieces per cell (`keep` 1), none past a run's
      end, no two at one place, each centred half a thickness from its edge on the wall cell's
      side, none on a cell's centreline.
- [ ] The scene stands a sprite for every piece and post of the plan, back ones among the
      occluders, each added to the chunk at its own place.
- [ ] A lit kind appears only on a back run facing a room; its light is queued at the piece's
      place and its region is the one the run faces.
- [ ] Without the wall art, a placeholder block stands on every edge, as thick as the material and
      as tall as its run.
- [ ] `betweenPosts` and `withinPosts` appear nowhere in `src/`.
- [ ] `planRoomDressing` for the fixture and a fixed seed returns what it returns before this
      slice, and no dressing footprint is within 24 px of a drawn wall's face.
- [ ] The existing tests of buildings, the hub, fields and the perimeter pass unedited.
- [ ] `git diff` over `game-server/`, `tools/bake/` and `public/art/` is empty.
- [ ] `npx vitest run --maxWorkers=4 --minWorkers=1` and `npm run lint` in game-client pass.

## Blocked By

I-XK2B6-1. Blocks I-XK2B6-3 and I-XK2B6-5.

## Spec Reference

FS-XK2B6 §A R1-R7, §B R8-R10, §C R12, §D R13-R15, §G R21-R24, §H R25-R26; user stories 1-4, 6, 7,
10-14, 17, 19-21; Acceptance Criteria "Drawing", "Unchanged", and the wall plan's criteria on
heights and run ends. The owner's rulings E1 and E3 (2026-11-11) are built here: R8 and R12 as
ruled.

## TDD Approach

- RED: a run three cells long along a room's north edge gives six whole pieces whose centres lie
  half a thickness north of the edge, and none beyond its two corners.
- GREEN: cut an edge run on its own line; drop the between-posts filter.
- Then the scene: sprites, occluders, lights, chunks, placeholders.
