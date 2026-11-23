---
id: I-JS7C8-35
status: open
implements: FS-JS7C8
blocked_by: [I-JS7C8-34]
labels: [ready-for-agent]
title: "FS-JS7C8 slice 35: retire the attack-on-the-move code now that no sheet carries it, client and bake tool, behaviour and every baked byte unchanged, each guard keeping a must-fail fixture (game-client)"
---
Implements FS-JS7C8 §Change: The knight's sprint, and the attack-on-the-move clips retired (R155)

**Lane: agent.** This is a deletion slice. No clip, key or pixel changes, and the bake is not re-run
for new art: `npm run bake -- --check` must stay clean. No game-server change. Start only once the
merged manifest has no sheet carrying `walk_attack`, `backpedal_attack`, `walk_attack_offhand` or
`backpedal_attack_offhand` (I-JS7C8-34). Check that first and stop if one does.

## What to Build

The list with file:line is in the FS, *Facts checked in code* → "The dead code once no sheet
carries them". Before deleting anything, grep for every name. Delete only what nothing kept reads.

1. **Client (`src/render/art/`).**
   - `animationSelect.ts`: `"walk_attack"` and `"backpedal_attack"` leave `CharacterAnimation`.
     `SwingClip` goes, and the off-hand clip is `"attack_offhand"` alone. Remove
     `CharacterState.walkAttack` and `.backpedalAttack`, the moving-swing branch (:157-160: an attack
     plays `attack`, or `attack_offhand` by hand, turned to the aim, moving or not),
     `BACKPEDAL_PACE` (:57-63) and the `movesAwayFrom` import. Update the doc comments.
   - `src/render/iso/facing.ts` `movesAwayFrom` (:44-52) and its tests go if nothing else reads it.
   - `character.ts`: remove `SheetClips.walkAttack` and `.backpedalAttack`, `Swing.charge` and
     the `charging` field (its only effect gated `walkAttack`), the constructor's and the
     animator's flags, and `SWINGS`' four retired entries. Remove the mid-swing swap branch in
     `show` (:365-370) and `swingClips` (:376-378) if no remaining pair of swing clips reaches
     them: a new swing replays from key 0 through `swingPending`. `holdMs` stays.
   - `src/render/combat/playerCombat.ts:242`: the warrior's charge passes `{ holdMs: CHARGE_MS }`.
   - `manifest.ts`: `checkWalkAttack` (:363-364, :396-411) goes.
2. **Bake tool (`tools/bake/`).**
   - `page/characters/clips.js`: remove `WALK_ATTACK_CYCLES`, `RUN_WALK_ATTACK_CYCLES`,
     `BACKPEDAL_ATTACK_CYCLES`, `BACKPEDAL_ATTACK_SPEED`, `withWalkAttack`, `CLASS_ANIMATIONS`,
     `RUNNING_CLASS_ANIMATIONS`, `backpedalCycle`, `attackOverLegs`, `walkAttackClip`,
     `backpedalAttackClip`, and the retired entries of `OFFHAND_OF`, `offhandPoses` and `clipsFor`.
     `MERC_ANIMATIONS` keeps `parry` without `withWalkAttack`. `layerPoses`, `LOWER_BODY`,
     `offhandPose`, `handless` and `RUN_ANIMATIONS` stay. Update the header comment (:1-3).
   - `page/characters/poses.js`: the walk-attack/backpedal cloth and calm branches (:20-31) go, and so
     does `sizing: !spec.boxed` (:45-46). `page/baker.js` loses `bakeCharacter`'s `sizing` option and
     its `fit` check (:254-298), and `page/main.js` the `sizing` argument (:135), but only if no clip
     anywhere is `boxed`.
   - Comments and header notes: `page/characters/classStyles.js` (the "Built without withWalkAttack"
     notes, `KNIGHT_ATTACK_CLOTH`'s mention of `BACKPEDAL_ATTACK_SPEED`), `cast.js` (:646-652),
     `anatomy.js` (:164), `pace.js` (:1-4), `lib/contact.mjs`.
3. **Tests.** Tests that tested only the retired code go: clips.test.mjs "attacking on the move"
   (:71-167) and the walk-attack/backpedal rows of "the run and the backpedal" (:413-583). Also
   axe.test.mjs's twin rows for the retired clips, warriorLooks.test.mjs's twin list,
   `animationSelect.test.ts`'s moving-swing and backpedal cases, `manifest.test.ts`'s `walk_attack`
   duration check (:279-302) and `BACKPEDALLING`, and `character.test.ts`'s walk-attack, backpedal
   and mid-swing swap cases. Tests whose subject stays are kept and reworded: `attack_offhand`, the
   run, `layerPoses`, the charge's `holdMs` (with the real `CHARGE_MS` against a 583 ms attack).
4. **Fixtures (R155).** Any guard whose must-fail fixture was built on a retired clip gets a new one
   on a kept clip, and that fixture must fail the guard. This covers the cloak guard's controls on
   `backpedal_attack` (clearance.test.mjs:551-566). *Estimate:* the knight's attack with the cloak
   hanging still (speed 0) read 7.6 px (classStyles.js `KNIGHT_ATTACK_CLOTH`). Measure it, and pick
   another kept pose if it no longer fails.
5. **Absence tests.** No manifest sheet carries the four retired clip names (`animationSelect.test.ts`
   or `manifest.test.ts`). `selectAnimation` with an attack while moving returns `attack` turned to
   the aim (and `attack_offhand` on the off hand).

## Acceptance Criteria

- [ ] RED first: the absence test and the moving-attack `selectAnimation` case are green before the
      deletion (the manifest already lacks the clips), and stay green.
- [ ] `git grep -nE "walk_attack|backpedal_attack|walkAttack|backpedalAttack|BACKPEDAL_|WALK_ATTACK_CYCLES|withWalkAttack|RUNNING_CLASS_ANIMATIONS|movesAwayFrom|charging"`
      in `game-client/src` and `game-client/tools` finds nothing, or only a comment saying the clips
      were retired (with the FS reference).
- [ ] `npm run bake -- --check` is clean, and every manifest entry and atlas is byte-identical to
      I-JS7C8-34's.
- [ ] Each guard that lost its fixture has a new one, and that fixture fails the guard.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence` and `npx tsc --noEmit` in `game-client` pass.
- [ ] No file under `game-server/`, `game-client/src/api/generated` or any migration changes.

## Blocked By

I-JS7C8-34

## Spec Reference

FS-JS7C8 §Change: The knight's sprint, and the attack-on-the-move clips retired: K4; R155; Edge States "The charge", "The Berserker's hands", "A sheet from an older
bake"; the Acceptance Criteria's "After the retirement" line. It also closes the wizard's Out of
Scope item and 's "Retiring the attack-on-the-move clips".

## Files it expects to touch

`game-client/src/render/art/animationSelect.ts`, `character.ts`, `manifest.ts` and their tests;
`game-client/src/render/iso/facing.ts` (+ test); `game-client/src/render/combat/playerCombat.ts`;
`game-client/tools/bake/page/characters/clips.js`, `poses.js`, `classStyles.js`, `cast.js`,
`anatomy.js`, `pace.js`, `clips.test.mjs`, `classMotion.test.mjs`, `clearance.test.mjs`,
`axe.test.mjs`, `warriorLooks.test.mjs`, `mageLooks.test.mjs`, `mercLooks.test.mjs`,
`archerLooks.test.mjs`; `game-client/tools/bake/page/baker.js`, `main.js`; `tools/bake/lib/contact.mjs`.
