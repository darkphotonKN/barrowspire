---
id: I-1J1CB-19
status: open
implements: FS-1J1CB
blocked_by: [I-1J1CB-17, I-1J1CB-18]
labels: [blocked]
title: "FS-1J1CB slice 19: one re-bake of the Spellwarden's sheet with the planted idle and the heavy cast, box within 300×255, every other atlas byte-identical"
---
Implements FS-1J1CB §Change: The Spellwarden's long staff planted and swung heavy (R83–R85)

## What to Build

One `npm run bake` after slices 17 and 18. Only her atlas pages and her manifest entry change.

## Acceptance Criteria

- [ ] `git diff --stat public/art/` lists only `wizard_spellwarden-*.png` and `manifest.json`; the
      manifest's diff is her entry alone.
- [ ] Her frame box is at most 300×255 (growth: stop and escalate).
- [ ] Her walk, run and death frames are pixel-identical to main 4d56d258's (compared frame by
      frame from the two atlases).
- [ ] `npm run bake -- --check` is clean; `npm test` and `npm run lint` pass.

## Blocked By

I-1J1CB-17, I-1J1CB-18

## Spec Reference

FS-1J1CB §Change: The Spellwarden's long staff planted and swung heavy: R83, R84, R85.

## Files it expects to touch

`game-client/public/art/wizard_spellwarden-*.png`, `game-client/public/art/manifest.json`.
