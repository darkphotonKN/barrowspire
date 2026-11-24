---
id: I-R4MYX-5
status: done
implements: FS-R4MYX
blocked_by: [I-R4MYX-4]
labels: [ready-for-agent]
title: "FS-R4MYX slice 5: game-client draws the chapel: aged unlit masonry, pews, altar, dais, lectern and two candelabra"
---
Implements FS-R4MYX §C Requirements 14–15, §E Requirements 23–25

**Lane: game-client code (agent).**

## What to Build

The chapel drawn as FS-R4MYX lays it out, in its own look, with its room shown only under a
lifted roof.

- `townHouseLook` returns, for the chapel (`isChapel`): the masonry sheets with no lit kind
  (`unlitSheets(MASONRY_WALLS)`) and **no stone cap** (R23), on the town's flagstone. The scene
  gives it the town's pitched roof and gables, which lift while the player is inside.
- **Aged** (R23): the chapel's wall pieces, door head and roof drawn under one weathering tint, a
  new canvas palette entry mixed from `BARROW` (no new token; the fence must stay green), its
  strength a named constant beside it for the owner to tune.
- Furnishings drawn as their props (B0H2D R19): `pew`, `altar`; a placeholder block without the
  sheet (the bake is I-R4MYX-8).
- `HUB_INDOOR_DRESSING` gains the chapel's dais (`dais`, **flat**, 130 × 200 centred (765, 1210)),
  lectern (`lectern`, (845, 1140)) and two `candelabra` ((805, 1145), (805, 1275)). The R15 test:
  a flat piece may lie under a furnishing, standing pieces may not (R14); the indoor threshold by
  face (I-R4MYX-4's).
- The candelabra light only while the chapel's roof is lifted, through the existing under-roof
  gate (R15); the chapel's walls carry no light.
- The interior hide rule (B0H2D R20) covers the chapel with no change: check it by test.

Expected files:
- `game-client/src/render/world/hubInteriors.ts`, `hubInteriors.test.ts`
- `game-client/src/render/world/walls.ts` (a capless masonry set, if `unlitSheets` keeps the cap)
- `game-client/src/utils/canvasPalette.ts` (the weathering entry) and its test, if any
- `game-client/src/scenes/HubScene.ts` (the chapel's tint and no cap; touch only
  `renderStructures` and the furnishing draw, I-R4MYX-6 owns the outdoor dressing draw)
- `game-client/src/render/world/scene.ts` only if `addBuildings` needs a tint or cap option

Not touched: `hubKeepOut.ts`, the graveyard, the fixed residents' mirror, bake sources, the server.

## Acceptance Criteria

- [ ] Vitest: `townHouseLook(chapel)` is unlit masonry with no cap; every other house unchanged.
- [ ] Vitest: the chapel's indoor dressing is inside its inner area, off its inner threshold, off
      every furnishing save the flat dais under the altar.
- [ ] Vitest: a furnishing wall of kind `pew` / `altar` maps to its sheet; without the sheet the
      placeholder block.
- [ ] The tint is a palette entry from `BARROW`; `npm run lint:fence` green.
- [ ] `npm test`, `npm run lint`, `npx tsc --noEmit` green.

## Blocked By

I-R4MYX-4 (`HUB_CHAPEL`, the chapel's furnishings mirror, the fixture by face; same files)

## Spec Reference

FS-R4MYX §C R14–R15, §E R23–R25; user stories 4–6, 12–14.

## TDD Approach

- RED: `townHouseLook` for the chapel's footprint returns timber; the dais under the altar fails
  the old R15 rule.
- GREEN: the chapel's look, the flat exemption, the dressing entries, then the scene's tint.
