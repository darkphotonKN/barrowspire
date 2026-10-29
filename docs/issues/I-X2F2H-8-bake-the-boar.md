---
id: I-X2F2H-8
status: open
implements: FS-X2F2H
blocked_by: [I-X2F2H-7]
labels: [blocked]
title: "FS-X2F2H slice 8: the boar and the elite boar, baked on a quadruped rig variant (game-client art, contact-sheet gate)"
---
Implements FS-X2F2H §H (Requirement 61)

**Author: agent. HITL gate:** the owner approves the boar's contact sheet before this issue
closes (design guideline *Characters / Enemies*).

> Coordination: FS-3QHQZ's I-3QHQZ-5 and I-3QHQZ-6 also bake into `catalogue.js`, `cast.js` and
> `public/art/manifest.json`. Rebake from the merged tree; never hand-merge manifest JSON.

## What to Build

1. **Quadruped variant** on `createRig` as a creature-variant option (I-X2F2H-7's rule): horizontal
   spine, four legs, head and short tail chains. No existing build changes.
2. **The boar** (FS §H R61): built in code in the bake tool (ADR-0020, ADR-0021): low, heavy
   front, bristled ridge, tusks; natural hide materials per the amendment; ember-red eyes as the
   only emissive. Fodder tier by the quadruped size rule. 8 directions; clips `idle`, `walk`,
   `attack` (a lowered-head wind-up held long enough to read, then the charge and recovery) and
   `death` (topples onto its side, eyes go out).
3. **The elite boar**: a second sheet on the same build: bigger tusks, scars, darker bristle.
4. **Register** `creature_boar_base` and `creature_boar_elite` in the cast and catalogue; bake into
   `public/art/` with additive manifest entries.
5. **Client draw**: `MONSTER_LOOKS` gains `boar` (fodder); the monster roster draws the elite
   sheet for a monster with `elite: true` whose archetype has an elite sheet, and the base sheet
   otherwise (runs unchanged).
6. **Contact sheet** for the owner: both sheets × 8 directions × 4 clips at game scale.

## Acceptance Criteria

- [ ] Both sheets exist in the manifest with an `authored:` source, 8 directions and the 4 clips (manifest tests).
- [ ] The boar's size measures inside the fodder tier by the amendment's quadruped rule (test).
- [ ] An elite boar draws the elite sheet; an elite ghoul still draws as before.
- [ ] Existing creature sheets are byte-identical after the rebake, apart from atlas packing the manifest records.
- [ ] The owner has approved the contact sheet.
- [ ] `npm test` and lint: no new failures versus the branch point.

## Files expected to touch

- `game-client/tools/bake/page/characters/rig.js` (quadruped option), `rig.test.mjs`
- `game-client/tools/bake/page/characters/boar.js` (new) or `cast.js`, plus `clips.js` if clips are shared
- `game-client/tools/bake/page/catalogue.js`
- `game-client/public/art/creatures-*.png` and `manifest.json` (baked, additive)
- `game-client/src/render/creatures/monsters.ts`, `monsters.test.ts`
- `game-client/src/render/art/manifest.test.ts`

## Blocked By

- I-X2F2H-7: the guideline amendment the boar is built to.

## Spec Reference

FS-X2F2H §H R61; User Stories 17, 28; Acceptance Criteria 26; Decision log D20, D28.

## TDD Approach

- RED: manifest test for `creature_boar_base` / `creature_boar_elite` (directions, clips, source, size tier).
- RED: roster picks the elite sheet for an elite boar.
- GREEN: rig option, build, bake, register.
