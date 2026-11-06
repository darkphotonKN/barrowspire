---
id: I-SRA9J-1
status: done
implements: FS-SRA9J
blocked_by: []
labels: [ready-for-agent]
title: "FS-SRA9J slice 1: party-shared exploration by region and the fog layer over terrain, walls, lights and fixed objects on dungeon floors (game-client)"
---
Implements FS-SRA9J §A (Requirement 1), §B (Requirements 2–7), §C (Requirements 8–14)

**Lane: agent (AFK), game-client.**

## What to Build

A pure exploration module: given the floor map's regions and the party's living positions, each region's state (unexplored, explored, visible), resets on a new floor map or scene, nearest-walkable fallback for a position off the grid. A fog layer at `BLACKOUT.depth` drawn geometrically from region footprints raised over their shell walls, redrawn only on a state change: unexplored as `palette.inkDeep`, explored dimmed by a fixed share of it, visible clear. Walls take the brightest state of the regions they border; light sources in non-visible regions are off; containers, switch, escape door and stairs in unexplored regions are hidden (`setVisible(false)`), dim in explored ones. Only on floors whose map carries regions; floors 2–3 and fields unchanged.

## Files (expected)

- new `game-client/src/render/world/exploration.ts` and its test (pure)
- new `game-client/src/render/world/fog.ts` and its test
- `game-client/src/render/world/dungeon.ts` (region grid lookup from I-KE075-5)
- `game-client/src/render/world/floorLights.ts` (lights by region state)
- `game-client/src/scenes/BarrowspireScene.ts` (wire exploration to snapshots; hide fixed objects; reset on floor change)

## Acceptance Criteria

- [x] Regions start unexplored, turn visible with a living member in them, explored after
- [x] Other members uncover regions; dead and escaped do not
- [x] Unexplored draws `palette.inkDeep` with its objects hidden; explored draws dim; visible draws in full
- [x] A wall bordering a visible region draws in full
- [x] Lights in non-visible regions are off
- [x] The fog layer redraws only on a state change
- [x] A floor change and a fresh scene reset exploration
- [x] Floors 2–3 and fields have no fog; their screenshots still match FS-KE075's captures
- [x] Typecheck and vitest pass

## Evidence (2026-11-06, review fix round 1, branch floor1/fix-client)

- States: `exploration.test.ts` "exploration by region (FS-SRA9J §B)", "who uncovers a region
  (FS-SRA9J §B.3, §B.5)".
- Shades and walls: `fog.test.ts` "the fog over each region", "the fog and what stands up", "a
  wall piece under the fog"; scene "should hide the escape door, switch and stairs in unexplored
  regions…", "should hide the wall pieces near the view whose regions are all unexplored…".
- Review round 1, item 1 (fog leaking at doorways and behind walls): `fog.test.ts` "the fog over
  what lies behind a visible region". The reviewer's probe (one region visible at a time, every
  other region's cell middle) on the refreshed fixture: before, 52 of 52 states left unexplored
  cells clear, 534 cells, worst 24; 190 of them neither behind a drawn wall's slab nor under where
  a member's head could be. After: 344 cells clear in 48 states, every one of them behind a drawn
  wall's slab (80) or where a member standing in the visible region could have their head (264);
  0 otherwise. (On the old fixture: 413 clear in 37 of 40 states, 144 unexplained, before; 0 after.)
  No double cover and the visible-everywhere case still hold.
- Lights: scene "should light only the fixed lights in a visible region".
- Redraws: "should draw the fog at the blackout's depth, redraw it only when a region's state
  changes, and take it down with the floor"; fogcheck: 1 redraw per region change while walking.
- Reset: "should start a new dungeon floor unexplored, the party's regions visible at once".
- Floors 2–3: no fog is built on a floor of buildings (`Fog` is made only in
  `buildDungeonWalls`); identity captures as in I-KE075-5 (0.000% off by more than 24/255).
- Headless spot check (fogcheck, render scale 1, 1.5, 2): in a room, at its doorway, in the
  corridor beyond and in the corridor south of it; walls and the player clear, unexplored floor
  dark, explored dim, no page errors.
- Typecheck and vitest (240 files, 5,858 tests) pass.

## Blocked By

I-KE075-3, I-KE075-5

## Spec Reference

FS-SRA9J §A.1, §B.2–7, §C.8–14. ADR-0063 Decisions 1–4, 6–7.

## TDD Approach

- RED: an exploration test: a member walking room A → corridor → room B leaves A explored, B visible
- GREEN: the module, then the fog layer and the scene wiring
