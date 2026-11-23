---
id: I-JS7C8-21
status: open
implements: FS-JS7C8
blocked_by: []
labels: [ready-for-agent]
title: "FS-JS7C8 slice 21: one sprint, shared: the archer's keys held by digest, the sprint's legs, lean and 16 fps defined once, the mercenary's run on them, his pace held (game-client bake tool)"
---
Implements FS-JS7C8 §Change: The mercenary's sprint and trailing sword (R92–R96, R103's digest)

**Lane: agent.** Keys and their tests only; no bake in this slice (the one bake is I-JS7C8-24).
Branch `feat/run-merc-sprint` (M9). No game-server change; `RUN_PACE` and `animationSelect.ts`
are not touched. His sword arm keeps today's run carry in this slice; I-JS7C8-23 replaces it.

## What to Build

1. **Guards first (R92, R103).** Before anything moves, add digest tests, taken at `2018f786`, of
   the archer's run keys (`clipsFor(ARCHER_STYLE, ARCHER_SHEET.animations).run`) and
   `ARCHER_SHEET`, and of the mercenary's idle, walk, attack, death and parry keys. Put them beside
   the digests in `classMotion.test.mjs` (:982-1003). They stay green through every later slice.
2. **The sprint in one place (R93).** Move `ARCHER_SPRINT_STEP` (classStyles.js:182),
   `ARCHER_SPRINT_LEAN` (:165) and the 16 fps run spec inside `ARCHER_SHEET` (:233) into one
   shared definition, named for the sprint. `ARCHER_STYLE.run` (:248) and `ARCHER_SHEET` read
   it; her digests do not move. Seam: `style.run.legs` and `style.run.lean` (clips.js:366-367).
   No new `runCycle` parameter. `RUN_STEP`, `RUN_LEAN`, `RUN_ARM`, `RUN_ELBOW`, `RUN_COUNTER`,
   `RUN_ANIMATIONS` and `RUNNING_CLASS_ANIMATIONS` are unchanged.
3. **His run on it (R94).** `MERCENARY_STYLE.run` (:334) takes the sprint's legs and lean. His
   sheet's `run` spec becomes the sprint's (16 fps, `speed` 2.5). His sheet may still carry
   `walk_attack` and `backpedal_attack` in this slice; I-JS7C8-24 drops them.
4. **His pace (R95, escalated).** Option (a), the default until the owner picks: `measurePace` at
   16 fps on his rig and style is within 180–220 and within 3 px/s of `RUN_PACE` (measured 196.58
   at `2018f786`). Record the measured value in this issue. Do not change `RUN_PACE`. If the
   owner picks (b) or (c) at I-JS7C8-25, that comes back here.
5. **Retire his shared fast-run rows (R96).** Move the mercenary out of `CLASSES`' run describe
   (classMotion.test.mjs:279-500) into a describe of his own sprint, as the archer's is
   (:838-980). That retires the 10° lean, the sword arm's pump bands, the raised blade and
   `runBlade`, the head check, the cross-in, "shared legs key for key" and the 14 fps pace for him.
   The knight and the wizard keep those tests unchanged. Replace his "unchanged" sheet-and-clips
   digest (:996) with item 1's digests. His sword-in-the-torso check and the normal-grip test
   (:592-628) stay on his run.

## Acceptance Criteria

- [ ] RED first: the archer's and the mercenary's digests are committed green against
      `2018f786`. His sprint tests are red against today's run: lean 9.96–10.26° (needs 19–21°
      mean, 18–22° every sample); 14 fps (needs 16); knee 0.311 H (needs > 0.32); shin fold 1.45
      rad (needs > 1.45).
- [ ] The archer's run keys, `ARCHER_SHEET` and her other clips match their digests. The shared
      run's digest (:995) and the knight's and the wizard's digests (:996) are unchanged.
- [ ] One shared definition of the sprint's legs, lean and run spec, read by both classes.
- [ ] His run, on his rig as cast.js builds him: the lean bands; the head's pitch within 3° of
      rest, yaw range < 0.08 rad, roll < 0.06; knee > 0.32 H; shin > 1.45 rad; a flight frame per
      step (both soles > 0.02 H); ≥ 4 planted keys; lift ≥ 0.045 H; bob 0.056–0.07 H; the pelvis
      once a step; shoulders anti-correlated with the hips (< −0.8), peaking at 6.5–10°.
- [ ] His pace at 16 fps within 180–220 and within 3 px/s of `RUN_PACE` 194; the value recorded.
- [ ] His idle, walk, attack, death and parry match their digests. The carry-out-of-body and
      normal-grip tests pass on his run.
- [ ] `npm test`, `npm run lint`, `npx tsc --noEmit` in `game-client` pass.

## Blocked By

None

## Spec Reference

FS-JS7C8 §Change: The mercenary's sprint and trailing sword: M1, M9; R92–R96, R103 (the digests); the Acceptance Criteria's bullets on the digests, the
shared sprint, his run, his pace and "the knight's and the wizard's run tests pass unchanged";
*Escalated 2026-11-23*.

## TDD Approach

- RED: the digests (green at once: they hold what exists), then his sprint describe against
  today's run.
- GREEN: the shared sprint definition; `MERCENARY_STYLE.run` and his run spec on it.

## Files it expects to touch

- `game-client/tools/bake/page/characters/classStyles.js` (the sprint's definition,
  `ARCHER_STYLE.run`, `ARCHER_SHEET`, `MERCENARY_STYLE.run`, `MERCENARY_SHEET`)
- `game-client/tools/bake/page/characters/clips.js` (only if the shared definition lives beside
  `RUN_STEP`; `RUNNING_MERC_ANIMATIONS`' run spec)
- `game-client/tools/bake/page/characters/classMotion.test.mjs` (the digests, his sprint describe,
  his rows out of `CLASSES`' run describe)
