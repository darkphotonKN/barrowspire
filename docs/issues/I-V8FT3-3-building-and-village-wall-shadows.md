---
id: I-V8FT3-3
status: done
implements: FS-V8FT3
blocked_by: [I-V8FT3-2]
labels: []
title: "FS-V8FT3 slice 3: buildings, the Inn's partition and walls of no house cast into the village's and a floor of buildings' ground (game-client)"
---
Implements FS-V8FT3 §F

**Lane: agent (AFK).** Ships on one branch with I-V8FT3-2 and I-V8FT3-4.

A floor of buildings is rare (built only when dungeon generation fails twice, FS-KE075 §B R17), so
its shadows are checked by test, not by play.

FS-XK2B6 (walls on the cell boundary) changed a dungeon floor's walls only: a building's, the
village's and a floor of buildings' walls are still cut along their rect's centreline by
`planWalls` (FS-XK2B6 R22), so their feet are centred on it (FS-V8FT3 R13). `wallFeet` and
`planWallShadows` take the material's thickness in world px (`thicknessPx(sheets)`).

## Files owned

- `game-client/src/render/world/wallShadows.ts`, `wallShadows.test.ts` (the building rule)
- `game-client/src/render/world/buildingLooks.ts` and its test, if the plan needs a look's heights
  from it
- `game-client/src/scenes/HubScene.ts` (`renderStructures`, `drawLooseWalls`, `partition`),
  `HubScene.test.ts`
- `game-client/src/scenes/BarrowspireScene.ts` (`updateWalls`, `drawRooms`),
  `BarrowspireScene.test.ts`

Not `GroundLayer`: I-V8FT3-2 built the paint pass; this slice only hands it shapes.

## What to Build

- A building's shapes (R26, R27): outside its footprint by its exterior look (four full sides,
  unbroken across a door gap), inside by its interior look (south and east cut away, a gap casts
  nothing), each cut at the footprint's edge.
- The Inn's partition (R25) and walls of no house (R28) cast as drawn.
- The hub and a floor of buildings hand these to the ground in the step that paints the houses'
  floors (R22, R29).

## Acceptance Criteria

- [x] For a building: no exterior-look shape reaches inside the footprint and no interior-look
      shape reaches outside it; outside, the shape of a wall with a door gap is unbroken across the
      gap; inside, the gap casts nothing.
- [x] The Inn's partition casts as a front wall, inside the Inn's footprint.
- [x] A wall of no house casts as a back wall.
- [x] The perimeter wall, roofs, caps, gables and door leaves give no shape.
- [x] The hub's ground and a floor of buildings' ground are each handed their shapes once, with
      the houses' floors; a room on a floor of buildings casts as a village building does.
- [x] `npx vitest run --maxWorkers=4` and `npm run lint` in game-client pass.

## Blocked By

I-V8FT3-2. Blocks I-V8FT3-5.

## Spec Reference

FS-V8FT3 §A R1, R3; §F R25-R29; edge state "Walls that change within a floor"; user stories 7, 9,
10.

## TDD Approach

- RED: `wallShadows.test.ts`: a 300 by 200 house with a door gap in its south wall; the east wall's
  outside shape is a back wall's, its inside shape a front wall's, neither crosses the footprint.
- GREEN: the building rule, then the two scenes' wiring.
