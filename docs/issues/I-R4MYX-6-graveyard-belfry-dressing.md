---
id: I-R4MYX-6
status: done
implements: FS-R4MYX
blocked_by: [I-R4MYX-2, I-R4MYX-4]
labels: [ready-for-agent]
title: "FS-R4MYX slice 6: game-client lays the graveyard and the belfry as dressing"
---
Implements FS-R4MYX §F Requirements 27–30, 33

**Lane: game-client code (agent).**

## What to Build

The graveyard west of the chapel and the belfry by its door, as client dressing with no
collision, placed by data and held to tested rules.

- A data module for the graveyard (e.g. `render/world/hubGraveyard.ts`): the 16 headstones with
  their state (intact / weathered / broken) and variant, the 4 flower spots (3 fresh, 1 withered),
  the 2 fresh mounds, the stone cross, `tree_dead` and `tree_dead_snag`, and the six wall runs,
  per R28–R29 (or a layout passing the same tests).
- The belfry spot (1175, 1110), r 20, tall (R30).
- The low wall cut one tile at a time along each run like a fence (`fenceSegments`), a crumbled
  variant among the whole ones by a per-tile hash (same on every client).
- Tests (R27): every piece, every wall segment and the belfry clear K1–K8 against the golden's four
  buildings and the new paths, and the dev test room gate's range and arrival ((120, 900), r 80;
  (260, 900)); every piece but the wall inside the enclosure (x 220–610, y 1060–1410); the counts
  of R28 (16 stones: 7 / 6 / 3; 2 mounds; flowers 3 fresh, 1 withered); the south-east gap open
  and the gap path reaching it; no piece within 12 px of a mourner (the golden's Keener, Widower,
  Veteran) and each mourner 40–80 px east of their grave's head.
- `HubScene` draws them as the town's other dressing: sorted by footprint, tall pieces (cross,
  trees, belfry) join the occluders; a piece with no sheet draws nothing (FS-KYPQ9 §A.9).

Expected files:
- `game-client/src/render/world/hubGraveyard.ts` (new), `hubGraveyard.test.ts` (new)
- `game-client/src/render/world/hubKeepOut.ts` only if the belfry joins `HUB_DRESSING` there
- `game-client/src/scenes/HubScene.ts` (the outdoor dressing draw only; I-R4MYX-5 owns
  `renderStructures`)

Not touched: `hubInteriors.ts`, bake sources, the server.

## Acceptance Criteria

- [ ] Vitest: R27's rules and R28's counts hold for the data as committed.
- [ ] Vitest: wall runs cut into tile segments with a deterministic crumbled pattern.
- [ ] The scene draws the graveyard and belfry when their sheets exist and nothing when not.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

## Blocked By

I-R4MYX-2 (the mourners' points in the golden), I-R4MYX-4 (`HUB_SIZE`, the paths, the fixture by
face)

## Spec Reference

FS-R4MYX §F R27–R30, R33; user stories 14–18, 20, 21.

## TDD Approach

- RED: a stone placed 5 px from the Widower, and one on the graveyard spur.
- GREEN: the R28 layout; then the scene's draw.
