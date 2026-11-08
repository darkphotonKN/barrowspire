---
id: I-VHGE7-7
status: done
implements: FS-VHGE7
blocked_by: []
labels: [ready-for-agent]
title: "FS-VHGE7 slice 7: the blood demon's art is its own group, fetched when one first appears, with a stand-in until it lands (game-client)"
---
Implements FS-VHGE7 §F (Requirements 42-53), §C R27, R30, §E R41, § Amendment A1

**Author: agent.** Decision: ADR-0071, amending ADR-0059 Decisions 2 and 6.

> Coordination: the sibling worktree `inn-great-hall` also bakes props. Rebake from the merged
> tree, and never hand-merge `public/art/manifest.json`.

## What to Build

1. **Own group.** In `cast.js`, `creature_blood_demon_base` moves to group `blood_demon`. Rebake:
   `boss` re-packs to about 3 pages, `blood_demon-0..3` appear, and the bake removes the stale
   `boss-3..5` PNGs (R42).
2. **Table.** `sceneArt.ts` names `blood_demon` as an on-demand scene-scoped group, with its
   fetching archetype and stand-in. It must be in `SCENE_SCOPED_GROUPS` and in no scene's preload
   set. `dev_test_room` stays `creatures, boss` (R43, R51).
3. **Trigger.** The first snapshot listing a `blood_demon`, hidden or not, queues the group's
   missing pages once on the running scene's loader. No bar, no fade, no wire change (R44, R45).
4. **Stand-in.** Until the group is resident, the look is `creature_demon_base` under a new
   oxblood-family `canvasPalette` token citing FS-VHGE7. No placeholder, no missing-sheet warning
   (R46).
5. **Register and swap.** When every page is a texture, register its frames and animations, then
   re-dress each drawn blood demon on its own sprite with a new `CharacterAnimator` and the new
   sheet's size, crown and plate height. The sprite is never destroyed or hidden (R47, R48).
6. **Stop and failure.** A scene stop aborts in-flight pages as a preload's are. A failed page
   leaves the stand-in with one warning and no retry in that scene (R50). Eviction needs no new
   rule (R49).
7. **Coverage test.** A look on an on-demand group passes only with a stand-in on a group its scene
   holds (R52).
8. **Re-measure.** Headless browser, FS-C4JWH §F R22's way: the run's decoded atlas total with no
   blood demon and after one has appeared. Fill the "measured" column in FS-VHGE7 § Amendment A1
   (R53).

## Acceptance Criteria

- [ ] The FS §Acceptance Criteria "Client" items for the on-demand group, stand-in, swap, no bar, eviction, stop and failure.
- [ ] The FS §Acceptance Criteria "Art" items: the sheet on `blood_demon` pages, `boss` holding only `creature_demon_base`, no sheet's pixels changed by the move, and the measurement recorded.
- [ ] After a run with a blood demon, the next scene holds exactly its FS-C4JWH set, with no `art:blood_demon` texture or its animations left.
- [ ] `npm test`, typecheck, lint and lint:fence: no new failures versus the branch point.

## Files expected to touch

- `game-client/src/render/art/sceneArt.ts`, `sceneArt.test.ts`
- `game-client/src/render/art/phaser.ts`, `phaser.test.ts` (on-demand queue and registration), `artLoader.standin.ts`, `evict.test.ts`, `manifest.test.ts`, `library.ts` if the sheet lookup needs a quiet residency check
- `game-client/src/render/creatures/monsters.ts`, `monsters.test.ts` (stand-in look, swap)
- `game-client/src/utils/canvasPalette.ts` (the stand-in token)
- `game-client/tools/bake/page/characters/cast.js`, and `game-client/tools/bake/page/catalogue.js` if it records the group
- `game-client/public/art/boss-*.png`, `blood_demon-*.png`, `manifest.json` (baked)
- `docs/specs/VHGE7-blood-demon-and-demon-fire-claw.md` (the measured column only)

## Blocked By

None

## Spec Reference

FS-VHGE7 §F R42-53, R27, R30, R41; User Stories 29-35; Acceptance Criteria "Client", "Art"; Edge
States from "Blood demon on an open floor" on. ADR-0071.

## TDD Approach

- RED: `sceneArt.test.ts` expecting `blood_demon` on-demand, scene-scoped and in no preload set; a
  `monsters.test.ts` case for the stand-in look and for a swap that keeps the same sprite.
- GREEN: the table, the trigger, the stand-in, then the swap; rebake last.
