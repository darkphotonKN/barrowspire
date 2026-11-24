---
id: I-R4MYX-3
status: done
implements: FS-R4MYX
blocked_by: []
labels: [ready-for-agent]
title: "FS-R4MYX slice 3: game-client draws and maps a town door cut in an east wall"
---
Implements FS-R4MYX §B Requirements 9, 11

**Lane: game-client code (agent).** Pure helpers and their tests, on fixtures of its own: it
does not read the golden, so it runs in parallel with the server slices.

## What to Build

Prove, and fix where it fails, that a door gap in a building's **east** wall is drawn and mapped
exactly as a south one is. Today every town door is in a south wall, so the y-axis path through
these helpers has never carried a town door.

- `doorGaps` finds an east-wall gap (it already scans every side): pin it with a test.
- Both looks (ADR-0036): the door in the gap (`gapDoor`, `door_y`, shut from outside, open from
  inside), the door head in the building type's sheets (`doorHead`: `door_head_y` for timber,
  `tower_door_head_y` for masonry), a jamb post at each wall end, and no wall piece or post
  standing in the gap (FS-MMA2H R8), for an 80 px gap in an east wall, timber and masonry.
- The indoor blackout's floor (`maskFloor`) stops at the threshold's middle for an east gap.
- The town minimap (`townMap` / `footprint`): a building with an east door is filled solid with
  the notch cut into its east side, `notchDepth` deep.
- Any helper found south-only is made face-agnostic, with the failing test kept as the regression.

Expected files:
- `game-client/src/render/world/buildingLooks.test.ts` (and `buildingLooks.ts` only if a fix)
- `game-client/src/render/world/walls.test.ts` (and `walls.ts` only if a fix)
- `game-client/src/render/world/blackoutMask.test.ts`
- `game-client/src/ui/townMap.test.ts`, `game-client/src/ui/worldMap.test.ts`
- `game-client/src/render/world/scene.ts` only if the door or head placement is wrong on y

Not touched: `hubKeepOut.ts`, `hubInteriors.ts`, the golden and its fixture, `HubScene.ts`, the
server.

## Acceptance Criteria

- [ ] Vitest: an east-wall 80 px gap yields one `DoorGap` on axis y, a `door_y` door shut outside
      and open inside, and its head in `door_head_y` (timber) / `tower_door_head_y` (masonry).
- [ ] Vitest: in both looks, posts stand at the two wall ends either side of the gap and no piece
      or post overlaps the gap.
- [ ] Vitest: the blackout floor and the minimap notch for an east door.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

## Blocked By

None

## Spec Reference

FS-R4MYX §B R9, R11; user stories 3, 4, 23.

## TDD Approach

- RED: a building fixture of five walls with its east wall cut round an 80 px gap; assert the
  door, head and posts.
- GREEN: whatever fix the y path needs, or none if it already holds (then the tests are the
  deliverable).
