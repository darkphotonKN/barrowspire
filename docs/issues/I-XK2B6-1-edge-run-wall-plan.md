---
id: I-XK2B6-1
status: open
implements: FS-XK2B6
blocked_by: []
labels: [ready-for-agent]
title: "FS-XK2B6 slice 1: a dungeon floor's wall plan is edge runs, heights and corner posts, as data (game-client)"
---
Implements FS-XK2B6 §A, §B, §I

**Lane: agent (AFK).** Pure data and maths, no Phaser. Nothing on screen changes in this slice:
the scene keeps drawing from `wallRuns` until I-XK2B6-2.

## Files owned

- `game-client/src/render/world/dungeon.ts`: the new plan, beside `wallRuns` and `wallRule`, which
  stay as they are for now (the scene and the fog still read them)
- `game-client/src/render/world/dungeon.test.ts`
- `game-client/src/render/world/walls.ts`: only to give each `WallSheets` its thickness (R2)

## What to Build

From a dungeon floor's map, the plan its walls will be drawn from (R27): every wall edge (R1),
gathered into edge runs from cell corner to cell corner (R3), each run with the line it stands on,
its two ends, the side its wall cells lie on, its height by that side (R8) and its material's
thickness; and one post at every run end, where the two walls' thicknesses cross, as tall as the
tallest run ending there (R4). A cell showing several edges gets one wall per edge (R6); a wall
cell with no walkable cell directly beside it gets none (R7). Heights and lights are answered by
the edge, never by the cell under a point (R9). Each material's thickness is written once, beside
its sheets, with the bake number it mirrors (R2): masonry 0.24 tile, timber 0.18. Read the number
from `tools/bake/page/models/{tower,architecture}.js`; do not edit those files.

## Acceptance Criteria

- [ ] On `dungeon.fixture.json` the plan holds exactly the 766 wall edges (195 north, 195 south,
      188 west, 188 east of their wall cell), and none where no wall cell and walkable cell share
      a side.
- [ ] Every edge is in exactly one run; every run is a whole number of cells long, on one cell
      line, all its edges facing the same way and one height. *(Amended by the owner's ruling
      E1 of 2026-11-11: a run also ends where its height changes.)*
- [ ] An edge whose wall cell lies south or east of the cell it faces is front; one whose wall
      cell lies north or west of it is front when that wall cell has a walkable cell directly
      north or west of it, back otherwise. A wall cell with walkable cells north and south (7 on
      the fixture) has a front edge on each side. *(Amended by the owner's ruling E1 of
      2026-11-11, FS-XK2B6 R8; this criterion first gave only south and east runs front, and the
      7 cells a front north edge and a back south edge.)*
- [ ] One post per run end, one per corner however many runs meet there, half a thickness to the
      wall side of the cell corner on each axis; back when any run ending at it is back.
- [ ] Either side of every doorway the two runs end 80 px apart; across every corridor cell the
      two facing walls are the corridor's walkable width apart.
- [ ] A wall cell with no walkable cell directly beside it is in no run.
- [ ] The plan is the same for the map's walls merged row by row and merged another way.
- [ ] A run reads as data: line, two ends, wall side, height, thickness.
- [ ] `npx vitest run --maxWorkers=4 --minWorkers=1` and `npm run lint` in game-client pass.

## Blocked By

None. Blocks I-XK2B6-2, I-XK2B6-3, I-XK2B6-4.

## Spec Reference

FS-XK2B6 §A R1-R7, §B R8-R9, R11, §I R27; user stories 2, 3, 4, 12, 16, 18, 19; Acceptance
Criteria "The wall plan".

## TDD Approach

- RED: a 3 x 3 room in a 5 x 5 grid gives four runs of three cells, north and west back, south and
  east front, and four posts at the room's corners, each half a thickness outside it.
- GREEN: edges from the grid, runs along each cell line, posts at run ends.
- Then the fixture counts, a doorway, a two-sided cell.
