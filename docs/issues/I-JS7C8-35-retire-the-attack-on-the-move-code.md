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

## Built (2026-11-23, agent)

Checked first: `public/art/manifest.json` carries no `walk_attack`, `backpedal_attack`,
`walk_attack_offhand` or `backpedal_attack_offhand` (0 matches) at 91383e88. 22 files, 252 lines
added and 874 deleted. `npm run bake -- --check` read `bake: no changes` before and after, and no
manifest entry or atlas changed.

**Removed, client.**
- `animationSelect.ts`: `"walk_attack"` and `"backpedal_attack"` out of `CharacterAnimation`
  (now the four, `parry`, `claw`, `run`, `attack_offhand`). Also removed: `SwingClip`,
  `OffhandSwing`, `BACKPEDAL_PACE`, `CharacterState.walkAttack` and `.backpedalAttack`, the
  moving-swing branch (an attack is `attack` or `attack_offhand`, turned to the aim, moving or
  not), and the `movesAwayFrom` import.
- `facing.ts`: `movesAwayFrom` (nothing else read it, and it had no tests).
- `character.ts`: removed `SheetClips.walkAttack` and `.backpedalAttack`, `Swing.charge`,
  `charging` (field, `attack()` and `carry()`), the constructor's and the animator's flags, and
  `SWINGS`' four retired entries (now `attack` and `attack_offhand`). `holdMs` stays.
- `playerCombat.ts:241`: the warrior's charge passes `{ holdMs: CHARGE_MS }`.
- `manifest.ts`: removed `checkWalkAttack` and `clipSeconds`, which only it read.

**Kept, and why.** The mid-swing swap branch in `CharacterAnimator.show` and `swingClips` stay.
A remaining pair of swing clips still reaches them: a Berserker re-dressed mid off-hand swing
(`wearing`) onto a sheet whose motion swings the right hand (R30) goes from
`char_knight_berserker/attack_offhand` to `<new sheet>/attack`, and the branch carries the swing on
at the same point. Deleting it would restart that swing from key 0, a behaviour change. A new test
pins it: "should carry an off-hand swing on as the new sheet's attack, at the same point, when the
body is re-dressed mid-swing" (frame 3 to frame 3). Its comment now describes that case only.

**Removed, bake tool.**
- `clips.js`: removed `WALK_ATTACK_CYCLES`, `RUN_WALK_ATTACK_CYCLES`, `BACKPEDAL_ATTACK_CYCLES`,
  `BACKPEDAL_ATTACK_SPEED`, `withWalkAttack`, `CLASS_ANIMATIONS`, `RUNNING_CLASS_ANIMATIONS`,
  `backpedalCycle`, `attackOverLegs`, `walkAttackClip` and `backpedalAttackClip`. Also removed:
  the retired entries of `OFFHAND_OF` (now `{ attack: "attack_offhand" }`), `offhandPoses` (now
  takes the style alone) and `clipsFor`. `MERC_ANIMATIONS` is the four plus `parry`. `layerPoses`,
  `LOWER_BODY`, `offhandPose`, `handless` and `RUN_ANIMATIONS` stay. The header is reworded.
- `poses.js`: the walk-attack and backpedal cloth and calm branches, and `sizing: !spec.boxed`.
- `baker.js`: `bakeCharacter`'s `sizing` option, the `fit` box and its throw. No clip was
  `boxed`, so every pose already sized the frame and `fit` stayed empty.
- `main.js`: the `sizing` argument.
- Comments: `classStyles.js` (`KNIGHT_ATTACK_CLOTH` no longer cites `BACKPEDAL_ATTACK_SPEED`, and
  the four sheets' "Built without withWalkAttack" notes are reworded), `cast.js`, `anatomy.js` and
  `pace.js`. The `contact.mjs` header already said no class carries an attack on the move
  (I-JS7C8-34), so it is unchanged.

**Tests.**
- Deleted (they tested only the retired code):
  - `clips.test.mjs` "attacking on the move" (except the two `layerPoses` tests, now under their own
    describe) and the walk-attack and backpedal rows of "the run and the backpedal" (now "the run").
  - `animationSelect.test.ts`: the `walkAttack` and `backpedalAttack` rows and the R9, R11 and
    off-hand moving-twin rows.
  - `character.test.ts`: walk-attack, backpedal, R13 swap and off-hand moving-twin cases. The
    `walk_attack` clips are gone from the fixture manifest.
  - `manifest.test.ts`: the `walk_attack` duration describe.
  - `axe.test.mjs`: the `frameOf` no-op.
- Reworded and kept: every moving-attack case now expects `attack` or `attack_offhand` turned to
  the aim. The charge tests use `{ holdMs }` alone, and the real `CHARGE_MS` (470 ms) against a
  583 ms attack keeps the attack's window. The run, `layerPoses` and `attack_offhand` tests are
  kept.
- `classMotion.test.mjs`: the archer's shared-run digest now covers `{ RUN_ANIMATIONS, plain }`
  (`369e8170…`). The plain run's own keys read `3917fe5b…` both at 91383e88 (from a `git archive`
  copy) and after the change.
- Absence and RED-first:
  - `selectAnimation` rows for an attack moving toward the aim, at 90°, more than 90° and 135°,
    and the off-hand on the move and stepping back, were green before the deletion and stay green.
  - The existing "should give no sheet an attack on the move" manifest test stays.
  - New in `character.test.ts`: a sheet from an older bake that still carries all four retired
    clips plays `attack` and `attack_offhand` on the move. It was red before the deletion
    (`walk_attack`) and is green after (Edge States).
  - New in `manifest.test.ts`: a mismatched `walk_attack` is no longer read.

**Fixtures rebuilt (R155), each still failing its guard.**
- Cloak guard (`clearance.test.mjs`), replacing the `backpedal_attack` controls:
  - the knight's `attack` with the cloak hanging still (speed 0) reads **7.59 px on key 6**
    (the estimate was 7.6);
  - the archer's `walk` with the cloak hanging still reads **8.22 px on key 5**.
  - Against the 0.667 px limit at 1.5x, both fail, and `cloakClearanceError` names the clip and
    the frame. Also measured, as the sheets bake them: knight attack 0, walk 0.21, run 0; archer
    run 0.57.
- Mercenary "no cloak" control: now reads his own sheet's `run` (cloak: null, leg 0 px).
- Scapular control (`RUN_BEFORE`): now built on `{ ...ANIMATIONS, ...RUN_ANIMATIONS }`, the same
  14 fps run spec as before, so the reading is unchanged.
- Retired with their guards: `checkWalkAttack`'s three rejection rows, `attackOverLegs`' "lasts"
  throw, and baker.js' boxed-pose throw. No clip remains for any of them to guard.

**Left on purpose.** These name the retired clips, each saying they are gone, with an FS
reference:
- the absence tests in `animationSelect.test.ts` and `classMotion.test.mjs`' sheet-order tests,
  and the older-bake fixture in `character.test.ts` (`warriorLooks.test.mjs`' absence loop went
  with the review fixes, d1ad6e48);
- the doc comments in `animationSelect.ts`, `clips.js` and `classStyles.js`;
- the `contact.mjs` header.

**Checks.** `npx vitest run`: 380 files, 11672 tests passed. `npm run lint` showed 0 errors (the
existing warnings remain). `npm run lint:fence` verified, and `npx tsc --noEmit` was clean. Nothing
changed under `game-server/`, `src/api/generated` or any migration.
