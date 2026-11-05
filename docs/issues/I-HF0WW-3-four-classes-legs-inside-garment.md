---
id: I-HF0WW-3
status: done
implements: FS-HF0WW
blocked_by: []
labels: []
title: "FS-HF0WW slice 3: the four classes' legs stay inside their tunics and robes (game-client)"
---
Implements FS-HF0WW §C (Requirements 16–18)

**Lane: agent (AFK), retroactive.** Built on `spike/archer-2x`; re-verified on screen under
Phaser 4.2.1 on 2026-11-06.

## What to Build

`anatomy.js` `skirt()` follows each thigh on its own side, builds its follow from just under the
waistband, and pushes its swaying panels out by how far the legs reach (`pushPanels`, applied in
`clips.js` `applyPose`). Knight, archer, wizard and mercenary are re-baked with it; every other
sheet built on `skirt()` keeps `mirrored: true` (the old weighting) so its pixels do not move.

## Acceptance Criteria

- [x] The four classes measure 0.9–1.3 px at worst (the old weighting 4.6–12 px), under the 2 px limit.
- [x] Knight, wizard and mercenary walk frames on screen (64 each) differ from local main's and, at render scale 1, equal the re-baked frames within 1/255 (FS-HF0WW § Verification).
- [x] Every `mirrored` sheet is pixel-identical to before.
- [x] Tests pass; `npm run bake -- --check` reports no changes.

## Blocked By

None

## Spec Reference

FS-HF0WW §C R16–R18; user story 13.

## Commits

dad36090 (rig), 8bb9ad9c (art).
