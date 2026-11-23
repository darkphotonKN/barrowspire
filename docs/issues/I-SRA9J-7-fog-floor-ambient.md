---
id: I-SRA9J-7
status: open
implements: FS-SRA9J
blocked_by: []
labels: [ready-for-agent]
title: "FS-SRA9J slice 7: on a floor with fog the light-map takes the run's ambient, floors 2-3 keep the tower's (game-client)"
---
Implements FS-SRA9J §Change: Lighter fog and lit regions, §F-C (F7–F9)

**Lane: agent (AFK), game-client.** The visible change: on floor 1 the region the party is in reads
clearly brighter; floors 2–3 look as before. ADR-0090 Decision 2; over FS-8RBQY §B.6–§B.7 on fog
floors only.

## What to Build

- `FOG_FLOOR_AMBIENT` in `render/lighting/lighting.ts`, equal to `AMBIENT.run`, its doc comment
  citing the Change, ADR-0090 and FS-8RBQY §B.7; exported through `render/lighting/index.ts` as
  `TOWER_AMBIENT` is. `TOWER_AMBIENT`, `AMBIENT` and `WORLD_THEMES.tower.ambient` unchanged.
- In `BarrowspireScene`: when a floor's fog is put up (`buildDungeonWalls`), the light-map's ambient
  becomes `FOG_FLOOR_AMBIENT` (`LightMap.setAmbient`, unused today); when the fog goes with its
  floor (`dropDungeon`), it returns to `this.worldLook.ambient`. At once, no fade.
- `render/markers/markers.test.ts`: the tower contrast case also runs with `FOG_FLOOR_AMBIENT` over
  the darkest tower ground mean at the canvas edge, at least 3:1. **If it fails, stop and report to
  the owner** (FS F9): do not change markers, the ambient or the threshold to pass it.
- `game-client/docs/design-guideline.md` "The readability floor", "The world may stay dark": one
  sentence naming the exception, on a fog floor the ambient is the run's as a look, the fog carrying
  the dark (FS-SRA9J §Change: Lighter fog and lit regions, ADR-0090).

## Files (expected)

- `game-client/src/render/lighting/lighting.ts`, `game-client/src/render/lighting/index.ts`
- `game-client/src/render/lighting/lighting.test.ts` (`FOG_FLOOR_AMBIENT` equals `AMBIENT.run`;
  the tower ambient still darker than it)
- `game-client/src/render/markers/markers.test.ts`
- `game-client/src/scenes/BarrowspireScene.ts` and `game-client/src/scenes/BarrowspireScene.test.ts`
  (the ambient on a fog floor after the fog stands, before it, on floors 2–3, after a climb)
- `game-client/docs/design-guideline.md`
- `worldTheme.test.ts` unchanged (it pins the tower theme's own ambient)

## Acceptance Criteria

- [ ] FS-SRA9J §Change: Lighter fog and lit regions, Acceptance Criteria "Ambient" rows, all of them.
- [ ] Floors 2–3 keep `TOWER_AMBIENT`; the fields and the hub are untouched.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence` and `npx tsc --noEmit` green.

## Blocked By

None

## Spec Reference

FS-SRA9J §Change: Lighter fog and lit regions: F7–F9 (charter default D3, D4), Edge States
"Arriving on floor 1", "Floor map not yet in", "A climb to floor 2", "Reconnect or a fresh scene",
"The lifted ambient fails the marker contrast floor". User stories 7–9, 12, 13. ADR-0090.

## TDD Approach

- RED: a scene test that after floor 1's walls and fog are built the light-map's ambient is
  `FOG_FLOOR_AMBIENT`, and after a floor-2 map it is `TOWER_AMBIENT`.
- GREEN: `setAmbient` calls where the fog is put up and dropped.
