---
id: I-X2F2H-9
status: open
implements: FS-X2F2H
blocked_by: [I-X2F2H-1, I-X2F2H-7]
labels: [blocked]
title: "FS-X2F2H slice 9: Gentle Meadows looks like a cozy daylit meadow with a horizon (game-client art)"
---
Implements FS-X2F2H §G (Requirement 54), §H (Requirement 55)

**Author: agent.** Art is built in code and baked (ADR-0020, ADR-0021); any new prop sheet goes
on the same contact-sheet approval as everything else.

> Coordination: FS-3QHQZ's I-3QHQZ-5 and I-3QHQZ-7 bake into the same catalogue and add the
> Forest's look to the field scene. Keep the per-field look keyed by field id so the two do not
> collide; rebake from the merged tree.

## What to Build

1. **Per-field look keyed by field id**: the field scene picks its ground, ambient, dressing and
   backdrop from the `field` id in the store (slice 1), so FS-3QHQZ adds the Forest as one more
   entry.
2. **Ground**: the exterior theme's ground family (`OUTDOOR_GROUND`) recoloured to cozy, daylight
   greens; deterministic per tile and world seed as every world's ground is.
3. **Dressing**: sparse trees and rocks drawn exactly where the server's Meadows keep-outs are
   (read from the server's map data or a shared constant table, never placed by hand twice).
   Reuse `nature.js` models where they fit; new ones built in code.
4. **Horizon backdrop**: sky and distant hills behind the map's far edge, drawn under the world,
   moving with the camera at a slower rate; simple to draw.
5. **Daylight ambient**: the `field` ambient entry for the Meadows is daylight, per the daylit-field
   rule (I-X2F2H-7); hostile eyes and markers still read.
6. **The entrance**: a road leading off the west edge with a signpost reading the way home, at the
   server's entrance gate.

## Acceptance Criteria

- [ ] The Meadows draws daylit greens on the outdoor ground family; two clients see identical tiles.
- [ ] Every server keep-out has a tree cluster or rock on it, and no dressing blocks open ground the server lets players walk.
- [ ] A horizon backdrop is visible behind the far edge and parallaxes with the camera.
- [ ] The entrance reads as a road and signpost at the server's entrance gate.
- [ ] The look is selected by field id; an unknown field id falls back to the Meadows look without crashing.
- [ ] Any new baked sheet is on an owner-approved contact sheet.
- [ ] `npm test` and lint: no new failures versus the branch point.

## Files expected to touch

- `game-client/src/render/world/fieldLook.ts` (new: per-field look table) and test
- `game-client/src/render/world/ground.ts`, `ground.test.ts` (Meadows greens)
- `game-client/src/render/world/horizon.ts` (new) and test
- `game-client/src/render/lighting/lighting.ts` (the field ambient)
- `game-client/src/render/world/scene.ts`, `index.ts`
- `game-client/src/scenes/FieldScene.ts`, `FieldScene.test.ts`
- `game-client/tools/bake/page/models/nature.js`, `catalogue.js`, `public/art/*` (only if new props are needed)

## Blocked By

- I-X2F2H-1: the field scene and the server's Meadows map.
- I-X2F2H-7: the daylit-field rule.

## Spec Reference

FS-X2F2H §G R54; §H R55; User Story 18; Acceptance Criteria 25; Decision log D18, D19, D28.

## TDD Approach

- RED: the field look table returns the Meadows look for `gentle_meadows` and for an unknown id.
- RED: every Meadows keep-out maps to a dressing piece.
- GREEN: the look table, ground, dressing, backdrop.
