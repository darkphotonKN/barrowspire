---
id: I-VHGE7-6
status: done
implements: FS-VHGE7
blocked_by: [I-VHGE7-5, I-VHGE7-3]
labels: [blocked]
title: "FS-VHGE7 slice 6: bake the blood demon sheet and the claw clip on both demons; the client draws the baked sheet (game-client art, contact-sheet gate)"
---
Implements FS-VHGE7 §E (Requirements 36–41)

**Author: agent. HITL gate:** the owner approves both contact sheets before this issue closes
(ADR-0021, design guideline *Characters / Enemies*).

> Coordination: the sibling worktree `inn-great-hall` also bakes props. Rebake from the merged
> tree, and never hand-merge `public/art/manifest.json`.

## What to Build

1. **Blood hide recipe** in `demonTone.js` (`DEMON_BLOOD_HIDE`, palette tokens only), held to the
   blood-hide clause by a unit test in `demonTone.test.mjs` (R36).
2. **Blood demon variant** of `demon()` in `demon.js`, the way `eliteBoar` varies the boar: the red
   hide, heavier horns, wings larger than the green demon's, the same body size (boss tier ≥ 1.8×).
   It keeps the tail and digitigrade legs. It is original and built in code; the reference is mood
   only (R36, R39).
3. **No mirrored skirt** on the variant. `MIRRORED_LEGACY` only shrinks, so the new sheet uses the
   current weighting and passes the clearance guard as itself (R37).
4. **`claw` clip** in `DEMON_ANIMATIONS` (`frames: 5, fps: 12, loop: false`): a one-arm raking
   swipe, 8 directions, on both sheets. The green demon's other clips are pixel-identical (R38).
5. Register `creature_blood_demon_base` in `cast.js` (group `boss`, `module: "demon"`) and the
   catalogue. Bake into `public/art/` (R41).
6. **Client switch:** `MONSTER_LOOKS.blood_demon` draws `creature_blood_demon_base` untinted.
   Remove I-VHGE7-3's placeholder token if nothing else uses it (R41).
7. **Contact sheets** for the owner: the blood demon × 8 directions × 5 clips, and the green
   demon's claw × 8 directions, at game scale (R40).

## Acceptance Criteria

- [ ] The FS §Acceptance Criteria "Art" items: recipe + test; blood sheet in 8 directions × idle/walk/attack/claw/death at boss tier, passing clearance without joining `MIRRORED_LEGACY`; green demon gains `claw` with its other clips unchanged.
- [ ] `monsterLook("blood_demon")` draws the baked sheet untinted. The run's `boss` group carries it.
- [ ] Every existing sheet is byte-identical after the rebake, apart from the atlas packing the manifest records.
- [ ] The owner has approved both contact sheets.
- [ ] `npm test` and lint: no new failures versus the branch point.

## Files expected to touch

- `game-client/tools/bake/page/characters/demon.js`, `demonTone.js`, `demonTone.test.mjs`
- `game-client/tools/bake/page/characters/cast.js`, `game-client/tools/bake/page/catalogue.js`
- `game-client/tools/bake/page/characters/clearance.js` (only if a new sheet must be listed elsewhere; never `MIRRORED_LEGACY`)
- `game-client/public/art/boss-*.png`, `game-client/public/art/manifest.json` (baked)
- `game-client/src/render/creatures/monsters.ts`, `monsters.test.ts`, `game-client/src/utils/canvasPalette.ts`
- `game-client/src/render/art/manifest.test.ts`

## Blocked By

- I-VHGE7-5: the guideline clause the red hide is built to.
- I-VHGE7-3: the `blood_demon` look this slice repoints at the baked sheet.

## Spec Reference

FS-VHGE7 §E R36–41; User Stories 3, 23; Acceptance Criteria "Art".

## TDD Approach

- RED: the `demonTone.test.mjs` case for the blood recipe, and a manifest test expecting
  `creature_blood_demon_base` with 5 clips and `creature_demon_base` with `claw`.
- GREEN: the recipe, the variant, the clip and the bake.
