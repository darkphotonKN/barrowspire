---
id: I-C8VM7-10
status: done
implements: FS-Q14EV
blocked_by: []
labels: []
title: "Content: FS-Q14EV (for FS-C8VM7 §H): bake the old families' eleven variant recolours"
---
Content: FS-Q14EV

Eleven sheets under the roster pipeline, as FS-C8VM7 §H R45, R47-R48 name them.

**Type:** AFK (the owner reviews the results; the slice names its contact sheets in its report
and does not stop at them, FS-C8VM7 R48).

## Files expected to touch

- `game-client/tools/bake/page/characters/cast.js` (eleven `CAST` entries, each in its variant's group: `ghast`, `ravener`, `ashen_archer`, `wight_archer`, `cave_troll`, `blood_troll`, `plague_thrall`, `blightborn`, `shade`, `phantom`, `banshee`)
- `game-client/tools/bake/page/characters/variantTones.js` (new: each variant's tone over its family's builder, from `BARROW` tokens; plus its `.test.mjs`)
- `game-client/tools/bake/page/characters/forlorn.js` (only if the thrall and wraith builders need a tone parameter)
- `game-client/public/art/manifest.json` and the new groups' atlas pages
- `game-client/src/render/art/manifest.test.ts`

## What to Build

Baked recolours (never a runtime tint) of their family's look, each a deeper shade with the
step: Ghast, Ravener (ghoul rig); Ashen Archer, Wight Archer (the Bone Archer's); Cave Troll,
Blood Troll (troll); Plague Thrall, Blightborn (the Barrow Thrall's); Shade, Phantom, Banshee
(the Spire Wraith's, its translucence kept). Each sheet `creature_<id>_base`, 8 directions ×
`idle`, `walk`, `attack`, `death`, an `authored:` line, in a group named by its id.

## Acceptance Criteria

- [ ] The eleven sheets exist with 8 directions, the four clips, an `authored:` source and their own group; `manifest.test.ts` asserts it.
- [ ] Each reads as its family at 1× and is distinguishable from the step below; tier-1 sheets are byte-identical to before.
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

FS-C8VM7 §H R45, R47-R48; §G R41 (groups); user stories 4, 30; acceptance criteria "Art".
