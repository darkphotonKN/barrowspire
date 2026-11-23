---
id: I-SRA9J-6
status: done
implements: FS-SRA9J
blocked_by: []
labels: [ready-for-agent]
title: "FS-SRA9J slice 6: a region is visible while a living member is within two walkable steps of it (game-client)"
---
Implements FS-SRA9J §Change: Lighter fog and lit regions, §F-B (F3–F6)

**Lane: agent (AFK), game-client.** The visible change: at a doorway the room ahead, and in a
corridor the next segment, is already clear. ADR-0090 Decision 1 (amends ADR-0063 Decision 2).

## What to Build

- In `Exploration` (`render/world/exploration.ts`): a region is visible while a living, in-play
  member's cell reaches one of its cells within two 4-connected steps over walkable cells
  (`RegionGrid.walkable`); the member's own region as before. A member's cell is the cell their
  position lies in, or off every walkable cell the nearest walkable one among the eight (the same
  pick `regionAt` makes, §B.7). Regions reached become explored as any visible one (§B.4); a tiny
  segment's group lights when any region of it is reached (`seenTogether`).
- The regions within reach of a cell are fixed for the floor: work them out once (at construction
  or the first time a cell is stood on) and look them up in `see`; `see` still returns whether any
  region changed state, so the fog and lights redraw only then.
- `shows` keeps its text: a monster or drop pile in a visible region (now including reached ones) is
  shown; within 400 px as before.
- Doc comments on `Exploration`, `see` and the module header cite the Change and ADR-0090.

## Files (expected)

- `game-client/src/render/world/exploration.ts`
- `game-client/src/render/world/exploration.test.ts` (new cases; the existing "A → corridor → B"
  and "changed state" cases updated where reach now keeps a region visible)
- `game-client/src/scenes/BarrowspireScene.test.ts` only if its fog-redraw count walks a member past
  a region edge the reach now moves
- no change expected in `fog.ts`, `ui/minimap.ts` or the scene's `explore` (they read `state`)

## Acceptance Criteria

- [ ] FS-SRA9J §Change: Lighter fog and lit regions, Acceptance Criteria "Reach" rows, all of them.
- [ ] `SHOWN_WITHIN` is still 400 and `regionAt` unchanged.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence` and `npx tsc --noEmit` green.

## Blocked By

None

## Spec Reference

FS-SRA9J §Change: Lighter fog and lit regions: F3–F6 (charter default D2), Edge States "At a
doorway", "Two corridor segments meeting", "Parallel corridors…", "A member pressed against a
wall's edge", "A monster in a region reached early". User stories 3–6, 10, 11. ADR-0090.

## TDD Approach

- RED: on a hand-made grid (room, doorway, corridor), a member two corridor cells from the room's
  doorway cell makes the room visible; at three it does not.
- GREEN: the per-cell reach table and its lookup in `see`.
