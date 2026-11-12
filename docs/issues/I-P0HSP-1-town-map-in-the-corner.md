---
id: I-P0HSP-1
status: open
implements: FS-P0HSP
blocked_by: []
labels: [ready-for-agent]
title: "FS-P0HSP slice 1: the town's minimap in the top-right corner: ground, edge with road gaps, solid buildings with doors cut, the party's dots (game-client)"
---
Implements FS-P0HSP §A, §B, §E, §G

## Files it expects to touch

- `game-client/src/ui/minimap.ts` + `minimap.test.ts`: the seam that lets the `Minimap` draw a world
  plan (ground, solid footprints, an edge line with gaps, marks, dots) as well as a dungeon floor's
  region grid; the run's drawing and tests unchanged.
- New `game-client/src/ui/townMap.ts` + test (name the implementer's call): the town's plan from a
  hub state's `walls` and `gates`, `HUB_WIDTH`/`HUB_HEIGHT`, `housesFrom`, `doorGaps`.
- `game-client/src/scenes/HubScene.ts` + `HubScene.test.ts`: build the minimap with the first state
  carrying the walls, feed it the party's dots, place it at the column's top, re-anchor on resize,
  destroy it with the scene.
- `TOP_RIGHT_HUD` (today exported from `scenes/BarrowspireScene.ts`) moved to a shared HUD module if
  the hub must not import the run scene; `BarrowspireScene.ts` imports it back.

## What to Build

In the town, a 216 × 108 minimap at the top of the top-right column (y 44, right-aligned on
`TOP_RIGHT_HUD`'s x), in the run minimap's look: the town's whole iso diamond in `minimapExplored`;
its edge a `minimapEdge` line with a 160 px road gap at each gate within its range of an edge (the
Spire, Forest and Meadows gates; none for the dev test room's); each town building's footprint
solid in `minimapEdge`, its door gap cut as a notch at least `MINIMAP_WORLD.doorNotch` (2) px deep,
no interior; the player's dot and the party members' dots (party store ids against
`other_players[].id`), no other players. Normal mode only in this slice (M is slice 3); no marks yet
(slice 2). No fog anywhere, no change to the world.

## Acceptance Criteria

- [ ] FS-P0HSP §Acceptance Criteria: the town's map (fill, edge and gaps, footprints and notches,
      no interior), from the golden's walls and the hub's gates.
- [ ] Party dots: self r 3, allies r 2, ringed; a non-party player draws nothing; no party, self only.
- [ ] The map redraws on a content change only (counted while walking the town).
- [ ] Placement at 1080 and 1280: top y 44, right edge on `TOP_RIGHT_HUD`'s x, re-anchored on resize;
      the clearances of §G.37 measured.
- [ ] The run's minimap tests pass as written; no new token; the token fence passes.
- [ ] Typecheck, lint and `npx vitest run --maxWorkers=4 --minWorkers=1` pass.

## Blocked By

None

## Spec Reference

FS-P0HSP §A.1–§A.4, §B.5–§B.9, §B.11–§B.13, §E.29–§E.30, §G.35–§G.37; User Stories 1, 2, 9–11,
18, 19, 23, 26, 29.

## TDD Approach

- RED: the town plan from the golden's walls has three solid footprints, each with one notch at its
  door gap; its edge runs have gaps at x 920–1080 on the north edge (Spire, (1000, 50), range 80),
  y 500–660 on the west (Forest) and y 280–440 on the east (Meadows), and none on the south for the
  dev gate at (120, 900).
- GREEN: the plan builder, then the minimap drawing it, then the hub scene placing it.
