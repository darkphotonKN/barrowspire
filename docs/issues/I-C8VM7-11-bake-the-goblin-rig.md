---
id: I-C8VM7-11
status: done
implements: FS-Q14EV
blocked_by: []
labels: []
title: "Content: FS-Q14EV (for FS-C8VM7 §H): the goblin rig, blade and blade + shield, and its tiers"
---
Content: FS-Q14EV

8 sheets under the roster pipeline, as FS-C8VM7 §H R46-R48 name them.

**Type:** AFK (the owner reviews the results; the slice names its contact sheets in its report
and does not stop at them, FS-C8VM7 R48).

## Files expected to touch

- `game-client/tools/bake/page/characters/goblin.js` (new: the rig's builder on the shared rig, with its tones; plus its `.test.mjs`)
- `game-client/tools/bake/page/characters/cast.js` (8 `CAST` entries: `goblin`, `goblin_shield`, `goblin_cutthroat`, `goblin_cutthroat_shield`, `goblin_reaver`, `goblin_reaver_shield`, `goblin_warchief`, `goblin_warchief_shield`; groups `goblin`, `goblin_cutthroat`, `goblin_reaver`, `goblin_warchief` (two looks per group))
- `game-client/public/art/manifest.json` and the new groups' atlas pages
- `game-client/src/render/art/manifest.test.ts`

## What to Build

A goblin: little (fodder band, below a ghoul's height), green, ugly and sharp-eyed, holding a blade; the shield look adds a small shield in the off hand. Its `attack` reads as a slash and doubles as the dagger throw's pose. Each sheet `creature_<id>_base`, 8 directions × `idle`, `walk`, `attack`, `death`
at the standard rates, an `authored:` provenance line, deterministic, in its variant's group
(FS-C8VM7 R41). The higher steps are baked recolours of the step-0 look, deepening with the step.

## Acceptance Criteria

- [ ] The 8 sheets exist with 8 directions, the four clips, an `authored:` source and their variant's group; `manifest.test.ts` asserts it.
- [ ] At 1× in the 8 directions the look reads as R46 describes and stays in its size band.
- [ ] `npm run bake -- --check` exits 0; `npm test` passes.
- [ ] Contact sheets are in `tools/bake/review/` and named in the report.

## Bounds

Bake and art only (`game-client/tools/bake`, `game-client/public/art`, the manifest test). Built
in code on the shared rig, never sourced (ADR-0021); colours from existing `BARROW` tokens.

**Merge note:** every art slice edits `tools/bake/page/characters/cast.js` (the `CAST` list) and
regenerates `public/art/manifest.json`. Each variant packs in its own group, so atlases do not
reflow across slices, but the manifest and the `CAST` list conflict textually: land art slices
one at a time, and after rebasing on another art slice re-run `npm run bake` and re-commit the
manifest rather than hand-merging it.

## Blocked By

None

## Spec Reference

FS-C8VM7 §H R46-R48; §F R34 (size tier); §G R41 (groups); user stories 6-8, 30; acceptance criteria "Art".
