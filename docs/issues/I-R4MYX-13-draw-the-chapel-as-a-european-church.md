---
id: I-R4MYX-13
status: done
implements: FS-R4MYX
blocked_by: [I-R4MYX-11, I-R4MYX-12]
labels: []
title: "FS-R4MYX slice 13: game-client draws the chapel in its own material: whitewashed walls, slate roof, pointed door head, wayside cross"
---
Implements FS-R4MYX §E Requirements 23–24, §F Requirement 30, §I Requirements 41–42 (client use)

**Lane: game-client code (agent).** Owner feedback F6.

## What to Build

The chapel drawn in I-R4MYX-12's sheets at I-R4MYX-11's place.

- `walls.ts`: a `CHAPEL_WALLS: WallSheets` (prefix `chapel_`, thickness `BAKE.WALL_FOOT.masonry`;
  back and front `plain` / `pillar`; outward `plain` / `lancet` / `buttress` with a variant
  table; no lit kind; no cap).
- `hubInteriors.ts` `townHouseLook`: the chapel's look is `CHAPEL_WALLS` on flagstone, with its
  roof set prefix; `CHAPEL_SHEETS` (unlit capless `tower_`) goes. The door head follows the
  prefix (`doorHead` → `chapel_door_head_y`): pin it with a test.
- `roofs.ts`: `planRoof` / `planGables` take the roof set's prefix from the house's look (`""`
  for the town, `"chapel_"` for the chapel); `RoofPiece` / `GablePiece` sheet types widen. The
  pieces' geometry is unchanged. `scene.ts` `addRoof` / `addGables` pass it, and their art check
  reads the prefixed sheet (without it, the placeholder roof).
- `HubScene.ts`: no chimney on the chapel (R23); the weathering tint off every wall piece, post,
  door head and gable (R23): either removed, with `palette.chapelWeathering` /
  `CHAPEL_WEATHERING` deleted from `canvasPalette.ts`, or kept on the chapel's roof slope and
  ridge pieces only. Developer's call; a test pins which parts carry a tint.
- The wayside cross (R41): a `PropSpot` (sheet `wayside_cross`, tall, indicative (1635, 1410),
  r 20) beside `HUB_BELFRY` in `hubGraveyard.ts`, at I-R4MYX-11's final door; K1–K8 test,
  off every path and threshold; drawn and occluding as the belfry is; nothing without its sheet.
- The pew draws its rebaked 20 × 100 sheet on its 20 × 100 furnishing rect (R24): a test that the
  furnishing maps to `pew` and its sprite stands on the rect.
- The interior is still lit by the two candelabra alone; the lancets carry no light (R15, R23).

Expected files:
- `game-client/src/render/world/walls.ts`, `walls.test.ts`
- `game-client/src/render/world/roofs.ts`, `roofs.test.ts`
- `game-client/src/render/world/scene.ts`, `scene.test.ts` (`addRoof` / `addGables`)
- `game-client/src/render/world/buildingLooks.ts` only if `doorHead` needs a change, `buildingLooks.test.ts`
- `game-client/src/render/world/hubInteriors.ts`, `hubInteriors.test.ts`
- `game-client/src/render/world/hubGraveyard.ts`, `hubGraveyard.test.ts` (the wayside cross spot)
- `game-client/src/scenes/HubScene.ts`, `HubScene.test.ts` (roof prefix, chimney, tint, cross draw)
- `game-client/src/utils/canvasPalette.ts` (the weathering entry removed or narrowed)

Not touched: the server, the golden, bake sources and the manifest, the layout data I-R4MYX-11
owns (except adding the wayside cross spot).

## Acceptance Criteria

- [ ] Vitest: `townHouseLook(chapel)` is `CHAPEL_WALLS` (prefix `chapel_`, masonry thickness, no
      lit kind, no cap, outward kinds `plain` / `lancet` / `buttress`); every other house
      unchanged.
- [ ] Vitest: the chapel's east door head is `chapel_door_head_y`; its roof and gables are
      `chapel_roof_slope` / `chapel_roof_ridge` / `chapel_roof_gable_x`, at the same positions and
      lifts the town set would have; the other houses keep `roof_`.
- [ ] Vitest: no tint on any chapel wall piece, post, door head or gable; the chapel has no
      chimney; the other houses keep theirs.
- [ ] Vitest: the wayside cross clears K1–K8 and the paths, is tall, and is drawn only with its
      sheet.
- [ ] Without the `chapel_` sheets: placeholder walls and roof (R23), no fallback to `tower_`.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

## Blocked By

I-R4MYX-11 (the chapel's final footprint and door, the paths, `hubInteriors.ts` and
`hubGraveyard.ts`), I-R4MYX-12 (the `chapel_` sheets, the roof set, `wayside_cross`, the long pew)

## Spec Reference

FS-R4MYX §E R23–R24, §F R30, §I R41–R42; user stories 14, 34.

## TDD Approach

- RED: `townHouseLook(chapel).sheets.prefix` is `tower_`; `planRoof(chapel)` names `roof_slope`;
  the chapel's wall pieces carry the weathering tint.
- GREEN: `CHAPEL_WALLS`, the roof prefix through the plan and the scene, the tint and chimney
  rules, the wayside cross spot.
