---
id: I-XK2B6-4
status: open
implements: FS-XK2B6
blocked_by: [I-XK2B6-1]
labels: [blocked]
title: "FS-XK2B6 slice 4: a dungeon floor paints ground under walkable cells only (game-client)"
---
Implements FS-XK2B6 §E

**Lane: agent (AFK).** Merges together with I-XK2B6-2 and I-XK2B6-3. May run beside them once
I-XK2B6-1 is in: it shares `dungeon.ts` and `BarrowspireScene.ts` with them but not a function.

## Files owned

- `game-client/src/render/world/dungeon.ts`: `RegionGrid.hasGround` and its comment
- `game-client/src/scenes/BarrowspireScene.ts`: `createGround` and `createMapBackground` only
- `game-client/src/render/world/{dungeon,ground}.test.ts`, and the dungeon ground cases of
  `game-client/src/scenes/BarrowspireScene.test.ts`

## What to Build

On a dungeon floor a ground piece is painted when the point it is placed by lies on a walkable
cell: today's test with the shell left out (R16). The placeholder stone follows the same test. A
ground chunk no walkable cell falls in has no render texture. What is left of a wall cell beyond
its walls shows `palette.inkDeep`, as the void does (R17): nothing new is drawn there. A floor of
buildings, the hub and the fields paint ground as today.

## Acceptance Criteria

- [ ] On the fixture a ground piece is planned for every tile of every walkable cell and for no
      tile of a wall cell or the void.
- [ ] A ground chunk with no walkable cell in it has no render texture; the count on the fixture
      is pinned by the test.
- [ ] Without the ground art, the placeholder stone lies under walkable cells only.
- [ ] The ground tests of the hub, the fields and a floor of buildings pass unedited.
- [ ] `npx vitest run --maxWorkers=4 --minWorkers=1` and `npm run lint` in game-client pass.

## Blocked By

I-XK2B6-1 (shares `dungeon.ts`). Blocks I-XK2B6-5.

## Spec Reference

FS-XK2B6 §E R16-R17; user story 5; Acceptance Criteria "Ground"; Edge States "A ground piece
wider than a tile". Replaces "under walkable and shell cells" of FS-KE075 §H.44.

## TDD Approach

- RED: `hasGround` is false at the middle of a wall cell beside a room.
- GREEN: the test is the cell's own walkability.
