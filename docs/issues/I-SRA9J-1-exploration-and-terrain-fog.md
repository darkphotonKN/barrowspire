---
id: I-SRA9J-1
status: open
implements: FS-SRA9J
blocked_by: [I-KE075-3, I-KE075-5]
labels: [blocked]
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

- [ ] Regions start unexplored, turn visible with a living member in them, explored after
- [ ] Other members uncover regions; dead and escaped do not
- [ ] Unexplored draws `palette.inkDeep` with its objects hidden; explored draws dim; visible draws in full
- [ ] A wall bordering a visible region draws in full
- [ ] Lights in non-visible regions are off
- [ ] The fog layer redraws only on a state change
- [ ] A floor change and a fresh scene reset exploration
- [ ] Floors 2–3 and fields have no fog; their screenshots still match FS-KE075's captures
- [ ] Typecheck and vitest pass

## Blocked By

I-KE075-3, I-KE075-5

## Spec Reference

FS-SRA9J §A.1, §B.2–7, §C.8–14. ADR-0063 Decisions 1–4, 6–7.

## TDD Approach

- RED: an exploration test: a member walking room A → corridor → room B leaves A explored, B visible
- GREEN: the module, then the fog layer and the scene wiring
