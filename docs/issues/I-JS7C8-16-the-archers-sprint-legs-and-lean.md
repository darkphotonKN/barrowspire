---
id: I-JS7C8-16
status: open
implements: FS-JS7C8
blocked_by: []
labels: [ready-for-agent]
title: "FS-JS7C8 slice 16: the archer's sprint: a 20° lean, 16 fps over a shorter stride with knee drive and heel kick, the pace held at RUN_PACE (game-client bake tool)"
---
Implements FS-JS7C8 §Change: The archer's sprint and low-ready bow (R66–R71, R86's named fallback)

**Lane: agent.** Keys and their tests only; no bake in this slice (the one bake is I-JS7C8-18).
Branch `feat/run-archer-sprint` (D10). No game-server change; `RUN_PACE` and `animationSelect.ts`
are not touched.

## What to Build

The archer's run becomes a sprint, on her sheet options and style alone (R66):

1. **Her own run spec.** `ARCHER_SHEET` (`classStyles.js:160`) stops sharing the run's 14 fps: her
   `run` is 8 frames, looping, at **16 fps**, `speed` 2.5 (R68). Build her clip set without
   mutating `RUN_ANIMATIONS` or `RUNNING_CLASS_ANIMATIONS`, which the wizard (and through
   `withWalkAttack` the others) keeps using. For this slice her set may still carry `walk_attack`
   and `backpedal_attack`; I-JS7C8-18 drops them.
2. **The lean (R67).** `ARCHER_STYLE.run.lean`, so her hips-to-neck line leans 19–21° on average
   (18–22° on every sample). It is about 0.48 rad as an estimate; the test decides. `steadyNeck`
   keeps the head level and looking ahead.
3. **Her own leg keys (R68, R69).** A shorter stride that keeps her measured pace at 16 fps within 1
   px/s of `RUN_PACE` 194 (today's keys read 221.39 at 16 fps, so about 12.4% less ground per
   cycle). More knee drive: the swing knee peaks above today's 0.311 H. More heel kick: the swing
   shin folds past 1.45 rad. `stride` scaling every thigh key would also cut the knee drive, so she
   needs keys or a per-style overlay of her own (a `style.run` leg table, or `runExtra`; pick the
   narrower seam in `clips.js` `runCycle`). Keep the flight (lift at least 0.045 H, a flight frame
   per step, a foot planted in at least 4 keys) and a bob of at least 0.056 H, under 0.07 H.
   `RUN_STEP` itself is unchanged.
4. **The shoulders (R70).** The counter-turn stays: anti-correlated with the hips, peaking at
   6.5–10°.
5. **Retire her old run checks (R71)** with the slice's tests: her bow arm's "short swing, near
   straight" check (`clips.test.mjs:635`) no longer describes her run (I-JS7C8-17 replaces her
   arms). The shared run's tests (`plain` style, `clips.test.mjs:447` on) stay as they are.

If 16 fps over the shorter stride cannot hold the pace within 1 px/s of 194 without client code,
stop and report back (the charter's escalation); never change `RUN_PACE`.

## Acceptance Criteria

- [ ] RED first, against today's archer run: lean 9.96–10.26° (needs 19–21° mean, 18–22° every
      sample); fps 14 (needs 16); the pace at 16 fps 221.39 (needs within 1 of 194); the knee peak
      0.311 H (needs more); the shin fold 1.45 rad (needs more).
- [ ] Her run, posed on her rig and style as `cast.js` builds her: the lean bands, the head's pitch
      within 3° of rest and as steady as the shared run's (yaw range < 0.08 rad, roll < 0.06).
- [ ] `measurePace` of her run at her sheet's fps (16) is within 1 px/s of `RUN_PACE`; `RUN_PACE`
      is still 194.
- [ ] Swing knee peak above 0.311 H; swing shin fold above 1.45 rad; a flight frame in each step
      (both soles over 0.02 H); a foot planted in at least 4 keys; lift at least 0.045 H; bob at
      least 0.056 H and under 0.07 H.
- [ ] Shoulders: correlation with the hips below −0.8, peak turn 6.5–10°.
- [ ] `RUN_STEP`, `RUN_LEAN`, `RUN_ARM`, `RUN_ELBOW`, `RUN_COUNTER`, `RUN_ANIMATIONS`,
      `RUNNING_CLASS_ANIMATIONS`, and the knight's, wizard's and mercenary's sheet options are
      deep-equal to main's. The shared run's tests and `classMotion.test.mjs` pass unchanged.
- [ ] Her idle, walk, attack and death keys are deep-equal to main's.
- [ ] `npm test`, `npm run lint`, `npx tsc --noEmit` in `game-client` pass.

## Blocked By

None

## Spec Reference

FS-JS7C8 §Change: The archer's sprint and low-ready bow: D1–D3, D10; R66–R71; the Acceptance
Criteria's bake bullets on the lean, the pace, the knee and heel, the flight and bob, the
shoulders, and "the shared run's tests pass unchanged"; Edge State "Gear move speed".

## TDD Approach

- RED: a `describe` for the archer's own run on her rig (`ARCHER_BUILD`, `ARCHER_STYLE`, her
  sheet's `run.fps`): the lean band, the pace at 16 fps within 1 of `RUN_PACE`, the knee and shin
  peaks against today's numbers.
- GREEN: her `run` spec at 16 fps, `run.lean`, her leg keys or overlay.

## Files it expects to touch

- `game-client/tools/bake/page/characters/classStyles.js` (`ARCHER_SHEET`, `ARCHER_STYLE.run`)
- `game-client/tools/bake/page/characters/clips.js` (a per-style leg seam in `runCycle`, only if
  `style.run`/`runExtra` cannot carry her keys; shared values unchanged)
- `game-client/tools/bake/page/characters/clips.test.mjs` and/or
  `game-client/tools/bake/page/characters/classMotion.test.mjs` (her run's tests; her old
  bow-arm check retired)
