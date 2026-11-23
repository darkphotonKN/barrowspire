---
id: I-JS7C8-33
status: open
implements: FS-JS7C8
blocked_by: []
labels: [ready-for-agent]
title: "FS-JS7C8 slice 33: the knight's run (and the Berserker's) on the sprint's lean and 16 fps over the shared fast run's legs at stride 0.84, his idle/walk/attack/death and the others' keys held by digest, the garment guards passing on all three looks, the blade's wrist held back to keep his band (game-client bake tool)"
---
Implements FS-JS7C8 §Change: The knight's sprint, and the attack-on-the-move clips retired (R137–R148)

**Lane: agent.** Keys and their tests only. There is no bake in this slice (the one bake is
I-JS7C8-34). No game-server change. `RUN_PACE`, `animationSelect.ts` and `character.ts` are not
touched. His sheets may still carry `walk_attack` and `backpedal_attack` in this slice, because
I-JS7C8-34 drops them.

**Escalation E1 is open.** Build option (a), the default. If the coordinator has recorded a pick
of (b) or (c) in the FS before you start, the FS is restated first through write-a-spec. Then
build that.

## What to Build

1. **Guards first (R137).** Before anything moves, add digest tests taken at `23717cbb`. They cover
   the knight's idle, walk, attack and death keys (`clipsFor(KNIGHT_STYLE, KNIGHT_SHEET.animations)`),
   the Berserker's idle, walk, attack, death and `attack_offhand` keys
   (`clipsFor(BERSERKER_STYLE, BERSERKER_SHEET.animations)`), and `KNIGHT_ATTACK_CLOTH`. Put them
   beside the archer's, the mercenary's and the wizard's digests in classMotion.test.mjs. The
   shared run's plain-style digest (:1316) stays. The knight's sheet-and-clips digest (:1317) goes,
   replaced by these.
2. **His run (R138, R139).** `KNIGHT_STYLE.run` (classStyles.js:142-148) and `BERSERKER_STYLE.run`
   (:179-184) gain `lean: SPRINT_LEAN` and `stride:` a named constant 0.84 (e.g.
   `KNIGHT_SPRINT_STRIDE`, beside `WIZARD_SPRINT_STRIDE`, with its reason: E1). There is no
   `run.legs`, so both run on `RUN_STEP`. His sheet's `run` becomes `SPRINT_RUN` by reference.
   For now the sheet may be `{ animations: { ...RUNNING_CLASS_ANIMATIONS, attack: {
   ...RUNNING_CLASS_ANIMATIONS.attack, speed: KNIGHT_ATTACK_CLOTH }, run: SPRINT_RUN }, scale: 1.5 }`.
   `BERSERKER_SHEET` (:155) follows through `withOffhand`, and the Guardian through `KNIGHT_STYLE`.
3. **His run's describe (R140, R141).** Add the knight (and the Berserker's style, on
   `rigOf(KNIGHT_BUILD)`) to `LEANED_RUNNERS` (classMotion.test.mjs:1119), or give him a describe
   of his own like the wizard's (:1229-1281). It covers the lean bands, the head, the flight, the
   planted keys, the lift, the bob 0.056–0.07, the pelvis once a step and the shoulders. Hold his
   knee to at least 0.30 H (not 0.32). Hold his pace at 16 fps within 1 px/s of `RUN_PACE`. Add a
   test that both runs read `SPRINT_LEAN` and his sheet's run is `SPRINT_RUN`, by reference, over
   `RUN_STEP` at the named stride.
4. **Retire his shared fast-run rows (R143).** These are the sheet test (:307-317) and the fast-run
   describe (:524-578: the 10° lean, the shared legs key for key, the 14 fps pace, "attacks on the
   move walk the legs at most 90"). `SHARED_RUNNERS` then names no class, so remove it with its
   describes.
5. **His carry (R144–R148).** `RUN_BLADE` (classStyles.js:59) goes from [0.68, 0, 0] to **[0.45, 0, 0]**.
   Nothing else in the carry moves. Update the header comment (:23-36) with the reason (K2: the
   lean dropped the blade to 10.4–28.7°). The `RUN_CARRIERS` describe (:319-522) keeps his row,
   with `runBlade` [23, 42] unchanged. Restate the front-hand height for him as a recorded band,
   0.01–0.035 H under the chest bone (*measured* 0.021 H under), the way the wizard's tome hand
   is restated (`freeFront`). Every other carry test passes on the new run: the elbow, back past
   the hip, the cross-in, the blade across, the free arm, the shield, the head in 8 facings, the
   tip ahead and under `RUN_TIP_CEIL`, and the normal grip (:670). axe.test.mjs passes on the
   Berserker's new run.
6. **The garments (R142).** On all three looks (`CAST` rows, `characterPoses`), on every clip:
   `legClearance` within the 1.5x limit (warriorLooks.test.mjs; clearance.test.mjs `MOVING.knight`),
   `cloakClearance` within it (`CLOAKED.knight`, warriorLooks.test.mjs), and `seenThroughCloth` 0
   (clearance.test.mjs "no leg is seen through the cloth"). Nothing is added to `KNOWN_CLIPPING` or
   `MIRRORED_LEGACY`. The hauberk, the surcoat, the cloaks and their springs are unchanged. If a
   guard fails, stop and report it (E1). Never exempt it, and never change a garment here.

## Acceptance Criteria

- [x] RED first: the new digests are green against `23717cbb`. His sprint describe is red against
      today's run: lean 9.96–10.26° (needs a mean of 19–21°), 14 fps (needs 16), and pace 197.67 at
      14 fps (needs within 1 of 194 at 16). The blade test is red against the kept wrist under the
      lean (10.4–28.7°).
- [x] The archer's, the mercenary's and the wizard's run keys and sheets, their other clips, the
      shared run, and the knight's and the Berserker's idle, walk, attack, death (and
      `attack_offhand`) keys match their digests.
- [x] Both runs read `SPRINT_LEAN` and `SPRINT_RUN` by reference, on `RUN_STEP` at the named stride
      0.84. `SPRINT_STEP`, `RUN_STEP` and the other shared constants are unchanged.
- [x] His run on his rig, under both styles: lean mean 19–21°, 18–22° on every sample; head pitch
      within 3°, yaw range < 0.08, roll < 0.06; a flight frame each step; ≥ 4 planted keys; lift ≥
      0.045 H; bob 0.056–0.07 H; the pelvis once a step; shoulders < −0.8 correlated, peaking at
      6.5–10°; knee ≥ 0.30 H.
- [x] His pace at 16 fps within 1 px/s of `RUN_PACE` 194 (*measured* 193.61); the value recorded here.
- [x] `RUN_BLADE` x is 0.45, and nothing else in his carry changes. The blade is 23–42° above level
      on every sample (*measured* 23.4–41.7°). The front hand's band is recorded. Every other carry
      test and axe.test.mjs pass.
- [x] The leg guard, the cloak guard and the seen-through check pass the three looks on every clip,
      with no exemption added.
- [x] `npm test` in `game-client` is green. No file outside `game-client/tools/bake/` changes.

## Built (2026-11-23, agent)

E1 (a) as decided: `KNIGHT_STYLE.run` and `BERSERKER_STYLE.run` read `SPRINT_LEAN` and
`KNIGHT_SPRINT_STRIDE` **0.84** over `RUN_STEP` (no `run.legs`), and his sheet's `run` is
`SPRINT_RUN` by reference (`a125c245`). The Berserker takes it through `withOffhand` and the
Guardian through `KNIGHT_STYLE`. `SPRINT_STEP`, `SPRINT_LEAN`, `SPRINT_RUN`, `RUN_STEP` and every
other shared constant keep their values.

- **Digests (R137).** Taken at `23717cbb` (`classMotion.test.mjs`): the knight's idle, walk,
  attack and death keys, the Berserker's idle, walk, attack, death and `attack_offhand` keys, and
  `KNIGHT_ATTACK_CLOTH` 0.5, beside the archer's, the mercenary's and the wizard's. The knight's
  sheet-and-clips digest is retired. The shared run's plain-style digest stays. All stay green
  through the I-JS7C8-34 bake.
- **RED first.** Against the old run the sprint describe read lean 9.96–10.26° (needs 19–21° on
  average), 14 fps (needs 16) and pace 197.67 at 14 fps. Under the lean the kept wrist's blade
  read 10.4–28.7° above level (FS *measured*), under his 23–42°.
- **His sprint, on his rig, under both styles.** Both join `LEANED_RUNNERS`: lean
  **20.20–20.50°** (mean **20.35°**), the head steady, a flight frame each step, **6** planted keys,
  bob **0.064 H**, the pelvis once a step, the shoulders counter-turning inside 6.5–10°. Knee peak
  **0.310 H**, held to at least 0.30 (the sprint's legs read 0.335). The shared fast run's knight
  rows, its describe and `SHARED_RUNNERS` are retired (R143).
- **His pace (R141).** `measurePace` reads **193.61** world px/s at 16 fps, 0.39 under `RUN_PACE`
  194 (the old run read 197.67 at 14 fps; the sprint's own legs 198.84).
- **His carry (K2, R144–R148).** `RUN_BLADE` x 0.68 → **0.45**, nothing else. The blade is
  **23.4–41.7°** above level on every sample, inside his 23–42 and `RUN_BLADE_ELEV`. The tip is at
  most **0.946 H**, under `RUN_TIP_CEIL` 1.03. The sword hand's front is recorded as a band,
  **0.01–0.035 H under** the chest bone (*measured* **0.021 H** under; 0.040 H over on the 10°
  lean). The elbow, the hand back past the hip, the cross-in, the blade across, the free arm, both
  shields, the head in 8 facings, the tip ahead and the normal grip pass. `axe.test.mjs` passes on
  the Berserker's run: each edge forward, never up past 30°.
- **The garments (R142).** The leg guard, the cloak guard and the camera check
  (`seenThroughCloth`) run on all three figures as the bake poses them (`warriorLooks.test.mjs`),
  at rest and on every moving clip: **0 px, 0 px, 0 seen**, against the 1.5x limit of 0.667 px.
  `clearance.test.mjs` reads the same on a rebuilt base. Nothing was added to `KNOWN_CLIPPING` or
  `MIRRORED_LEGACY`. The hauberk, the surcoat, the cloaks and their springs are unchanged.
- No bake (that is I-JS7C8-34). The commit touches `classStyles.js`, `classMotion.test.mjs` and
  `warriorLooks.test.mjs` only.

## Blocked By

None

## Spec Reference

FS-JS7C8 §Change: The knight's sprint, and the attack-on-the-move clips retired: K1, K2; E1 option (a); R137–R148; the first block of the Acceptance Criteria.

## TDD Approach

- RED: digests at `23717cbb` (green), then the knight in the sprint describe against today's run
  (red on the lean, fps and pace), and the blade band under the lean (red at 10.4°).
- GREEN: `lean` + `stride` on both runs, `SPRINT_RUN` on the sheet, `RUN_BLADE` x 0.45.

## Files it expects to touch

`game-client/tools/bake/page/characters/classStyles.js`, `classMotion.test.mjs`, and possibly
`axe.test.mjs`, `warriorLooks.test.mjs`, `clearance.test.mjs` (expected unchanged).
