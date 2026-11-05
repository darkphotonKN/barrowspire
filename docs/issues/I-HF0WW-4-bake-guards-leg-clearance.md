---
id: I-HF0WW-4
status: done
implements: FS-HF0WW
blocked_by: [I-HF0WW-3]
labels: []
title: "FS-HF0WW slice 4: the bake fails a character whose legs come through its garment, KNOWN_CLIPPING ratchet (game-client)"
---
Implements FS-HF0WW §C (Requirements 19–21)

**Lane: agent (AFK), retroactive.** Built on `spike/archer-2x`; the guard ran in the bake check
of 2026-11-06 on the rebased branch.

## What to Build

`characters/clearance.js`: per baked pose (every clip but the death), every leg vertex between a
garment's waistband and hem is cast out from the garment's axis and scored by how much further out
through the cloth it lies than at rest; over `CLEARANCE_PX` (2 screen px) fails the sheet's bake,
naming clip, frame and px. `KNOWN_CLIPPING` (troll, zombie, ghost, the trousered resident, the
spirewarden, the quartermaster) passes while it clips and fails once fixed. `window.bakeClearance`
reports the numbers without baking. The design guideline's "Legs stay inside the garment" rule.

## Acceptance Criteria

- [x] A sheet over the limit fails with its clip, frame and px; the old opposite-thigh weighting fails it and the fixed one passes (`clearance.test.mjs`).
- [x] A `KNOWN_CLIPPING` sheet that passes fails the bake, so the list only shrinks.
- [x] The full bake passes the guard on every character sheet (`npm run bake -- --check`, 2026-11-06).
- [x] `game-client/docs/design-guideline.md` carries the rule.
- [x] Tests pass.

## Blocked By

I-HF0WW-3

## Spec Reference

FS-HF0WW §C R19–R21; user stories 14–16.

## Commits

dad36090.
