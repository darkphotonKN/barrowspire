---
id: I-3103M-6
status: done
implements: FS-3103M
blocked_by: []
labels: []
title: "FS-3103M slice 6: bake the tome and the altar"
---
Implements FS-3103M §H

Art is built in code (ADR-0021, ADR-0020); colours from `BARROW` tokens only (ADR-0013); read
`game-client/docs/design-guideline.md` before modelling. The owner gates the look on a contact
sheet: attach it to the PR and stop for the gate.

## Files expected

- `game-client/tools/bake/page/models/interactables.js` (`tome()`, `altar(state)`)
- `game-client/tools/bake/page/catalogue.js` (a `tome` sheet, one still frame; an `altar` sheet with `dormant` and `burned` framed together, as the chest's states are)
- The bake's outputs under `game-client/public/` (manifest and the atlas pages it writes), regenerated, never hand-edited
- `game-client/src/render/art/manifest.test.ts` / `sceneArt.test.ts` only if they pin the group's sheet list

## What to Build

Two very minor, small props (R23): the Tome of Filth, a small grimy book lying on the floor; the
Altar of Consecration, a low stone altar, `dormant` and `burned` (scorch and ash), both states in one
frame box so the swap never moves the sprite. Packed in the run's resident interactables group, not
on demand (charter default). No client drawing in this slice.

## Acceptance Criteria

- [ ] The manifest lists `tome` (one frame) and `altar` (`dormant`, `burned`) in a resident group.
- [ ] Both are smaller than a chest on screen; no raw colour literals.
- [ ] A contact sheet of the three frames is attached for the owner's gate.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

## Blocked By

None. Blocks I-3103M-7.

## Spec Reference

FS-3103M §H R23; user stories 21, 23.
