---
id: I-JS7C8-27
status: open
implements: FS-JS7C8
blocked_by: []
labels: [ready-for-agent]
title: "FS-JS7C8 slice 27: the wizard's run on the sprint's lean and 16 fps over the shared fast run's legs at stride 0.88, the others' keys held by digest, the robe guards passing on all three looks, her carry kept and re-measured under the lean (game-client bake tool)"
---
Implements FS-JS7C8 §Change: The wizard's sprint and pointed cast (R115–R123)

**Lane: agent.** Keys and their tests only; no bake in this slice (the one bake is I-JS7C8-30).
No game-server change; `RUN_PACE`, `animationSelect.ts` and `character.ts` are not touched. Her
sheet may still carry `walk_attack` and `backpedal_attack` in this slice; I-JS7C8-30 drops them.

**Escalation E1 is open.** Build option (a), the default. If the coordinator has recorded a pick
of (b) or (c) in the FS before you start, the FS is restated first through write-a-spec. Then
build that.

## What to Build

1. **Guards first (R115).** Before anything moves, add digest tests taken at `22cabd3a`: the
   mercenary's run keys (`clipsFor(MERCENARY_STYLE, MERCENARY_SHEET.animations).run`) and
   `MERCENARY_SHEET`, and the wizard's idle, walk and death keys. Put them beside the archer's
   (classMotion.test.mjs:1059-1062) and the mercenary's other clips' (:1095-1104). The knight's
   sheet-and-clips digest (:1055) and the shared run's (:1054) stay. The wizard's "unchanged" entry
   (:1055-1056) goes, replaced by her idle, walk and death digests.
2. **Her run (R116, R117).** `WIZARD_STYLE.run` (classStyles.js:296-301) gains `lean:
   SPRINT_LEAN` and `stride:` a named constant 0.88 (e.g. `WIZARD_SPRINT_STRIDE`, beside the
   sprint's definition, with its reason: E1). There is no `run.legs`, so she runs on `RUN_STEP`.
   Her sheet's `run` becomes `SPRINT_RUN` by reference. Do this without touching
   `RUNNING_CLASS_ANIMATIONS`, which the knight reads (classStyles.js:92). Her sheet may become
   `{ animations: { ...RUNNING_CLASS_ANIMATIONS, run: SPRINT_RUN }, scale: 1.5 }` for now.
   `FOCUS_STYLE` (:320) spreads `WIZARD_STYLE`, so the looks follow.
3. **Her run's describe (R118, R119).** Move the wizard out of `SHARED_RUNNERS`
   (classMotion.test.mjs:283) into a describe of her own sprint, built like the sprinters'
   (:916-1020) on `rigOf(WIZARD_BUILD)`: the lean bands, the head, the flight, the planted keys, the
   lift, the bob 0.056–0.07, the pelvis once a step, the shoulders. Her knee is held to at least
   0.30 H (not 0.32). Her pace at 16 fps is within 1 px/s of `RUN_PACE`. Add a test that her run reads
   `SPRINT_LEAN` and her sheet's run is `SPRINT_RUN`, both by reference.
4. **Retire her shared fast-run rows (R121).** The 10° lean, "the shared legs key for key", the
   14 fps pace and "attacks on the move walk the legs at most 90" (:297-517), and her row of the
   sheet test (:285-295). The knight keeps all of them.
5. **Her carry, kept (R122, R123).** No carry key changes. Move the carry tests that applied to her
   in the shared describe into hers, on the new run: elbows 80–100° on every key, both hands back
   past the hip by 0.06 H, the cross-in (`RUN_CROSS_REACH`), clear of the free arm, the orb above and
   ahead of the hand, every sceptre point outside the robe (`outsideRobe`), and the carry out of
   the torso and the head. The normal-grip test (:609-623) still reads her run. Restate the three
   bands the lean moves: the sceptre hand's peak 0.56–0.59 H (was `SCEPTRE_RUN_PEAK` 0.61 ± 0.01;
   *measured* 0.574); the sceptre 15–45° off vertical on every sample (was 15–40; *measured* to
   40.3°); the tome hand's front height against the chest bone recorded in a band around the
   measure (*measured* 0.022 H under), not tuned away. `SCEPTRE_RUN_PEAK` and `SCEPTRE_RUN_TILT`
   stay if anything else reads them; otherwise they are replaced by her sprint's own named bands.
   Update the classStyles.js header comment (:36-43) to match.
6. **The robe (R120).** On all three looks (`CAST` rows, `characterPoses`), on every clip:
   `legClearance` within the 1.5x limit (mageLooks.test.mjs "keeps her legs inside the gown",
   clearance.test.mjs `MOVING.wizard`); `seenThroughCloth` 0 (clearance.test.mjs "no leg is seen
   through the cloth"); the scapular over the gown (`overGarment`). These run unchanged on the new
   run. Nothing is added to `KNOWN_CLIPPING` or `MIRRORED_LEGACY`, and the gown and its springs are
   unchanged. If a guard fails, stop and report it (W3, E1); never exempt it and never change the
   robe here.

## Acceptance Criteria

- [x] RED first: the new digests are green against `22cabd3a`. Her sprint describe is red
      against today's run: lean 9.96–10.26° (needs 19–21° mean); 14 fps (needs 16); pace 190.22 at
      14 fps (needs within 1 of 194 at 16).
- [x] The archer's and the mercenary's run keys and sheets, the mercenary's other clips, the
      knight's sheet and clips, and the shared run match their digests.
- [x] Her run reads `SPRINT_LEAN` and `SPRINT_RUN` by reference, on `RUN_STEP` at the named stride
      0.88; `SPRINT_STEP`, `RUN_STEP` and the other shared constants are unchanged.
- [x] Her run on her rig: lean 19–21° mean, 18–22° every sample; head pitch within 3°, yaw range
      < 0.08, roll < 0.06; a flight frame each step; ≥ 4 planted keys; lift ≥ 0.045 H; bob
      0.056–0.07 H; the pelvis once a step; shoulders < −0.8 correlated, peaking 6.5–10°; knee ≥
      0.30 H.
- [x] Her pace at 16 fps within 1 px/s of `RUN_PACE` 194 (*measured* 194.21); the value recorded
      here.
- [x] Her carry keys unchanged; the carry tests in item 5 pass on her run; the three restated bands
      pass, and their measured values are recorded here.
- [x] The leg guard, the seen-through check and the scapular check pass the three looks on every
      clip, with no exemption added.
- [x] The knight's run and sheet tests are unchanged and green.
- [x] `npm test`, `npm run lint`, `npx tsc --noEmit` in `game-client` pass.

## Blocked By

None

## Spec Reference

FS-JS7C8 §Change: The wizard's sprint and pointed cast: W1–W3; E1 (option (a)); R115–R123; the
Acceptance Criteria's bake bullets on the digests, her sheet options, her run, her pace, the robe,
her carry and the knight's tests; Edge States "Setting off and stopping", "Gear move speed".

## TDD Approach

- RED: the digests (green at once: they hold what exists), then her sprint describe against
  today's run.
- GREEN: `WIZARD_STYLE.run` (`lean`, `stride`) and her sheet's run spec.

## Files it expects to touch

- `game-client/tools/bake/page/characters/classStyles.js` (`WIZARD_STYLE.run`, `WIZARD_SHEET`, the
  stride constant, the bands, the header comment)
- `game-client/tools/bake/page/characters/classMotion.test.mjs` (the digests, her sprint describe,
  her rows out of `SHARED_RUNNERS`)
- `game-client/tools/bake/page/characters/clearance.test.mjs`, `mageLooks.test.mjs` (only if a
  guard needs her new run spelled out; they read her sheet)

## Built (2026-11-23, agent)

E1 (a) as decided: `WIZARD_STYLE.run` reads `SPRINT_LEAN` and `WIZARD_SPRINT_STRIDE` **0.88** over
`RUN_STEP` (no `run.legs`), and her sheet's `run` is `SPRINT_RUN` by reference (`03ff35af`).
`SPRINT_STEP`, `SPRINT_LEAN`, `SPRINT_RUN`, `RUN_STEP` and `RUNNING_CLASS_ANIMATIONS` are unchanged.
The looks take it through `FOCUS_STYLE`.

- **Digests (R115).** Taken at `22cabd3a` (`classMotion.test.mjs`): the mercenary's run keys and
  `MERCENARY_SHEET`, and her idle, walk and death keys, beside the archer's and the mercenary's
  other clips. Her "unchanged" digest is retired. The knight's and the shared run's are kept. All of
  them stay green through I-JS7C8-28, -29 and -30.
- **Her sprint, on her rig.** The sprinters' tests run on `rigOf(WIZARD_BUILD)`: lean
  **20.20–20.50°**, bob **0.062 H**, knee **0.311 H** (held to ≥ 0.30, not the sprint's 0.32), a
  flight each step, the head steady, the pelvis once a step, the shoulders counter-turning. Her
  rows leave the shared fast run's describe, which is now the knight's alone.
- **Her pace (R119).** `measurePace` reads **194.21** world px/s at 16 fps, 0.21 from `RUN_PACE`
  194 (her old run read 190.22 at 14 fps).
- **The carry changed under W2 (`f9164c52`; FS *Decided 2026-11-23: the carry changed under
  W2*).** The kept carry broke two checks under the lean: the sceptre leaned 36.7–48.5° off vertical
  and the shaft's foot sat 0.0006 H inside the robe on run key 1. Two values changed:
  `RUN_SCEPTRE` x −0.1 → **−0.30** (the wrist takes back the trunk's extra 10°), and the run
  hold's `upperArmR` z −0.12 → **−0.14** (`SCEPTRE_RUN_OUT`). The sceptre now leans
  **26.0–37.3°** off vertical (`WIZARD_SPRINT_TILT` 24–40; it was 23.4–37.8° on the 10° lean), and the shaft's
  foot clears the robe by **+0.0028 H**. The Pyromancer's cage sits 1.311 skull radii from her skull
  on run key 0 (the guard is 1.3; −0.28 read 1.294); the base reads 1.442 and the Spellwarden 1.425.
  The held `it.fails` entries are gone, and both checks are plain tests.
- **The bands (R123).** The sceptre hand peaks at **0.574 H** (`WIZARD_SPRINT_PEAK` 0.56–0.59). The
  tome hand's front is **0.022 H under** the chest bone. That is recorded, not tuned away.
- **The robe (R120).** The leg guard and `seenThroughCloth` run on her own figure and both looks
  as the bake poses them (`mageLooks.test.mjs`), at rest and on every moving clip: **0 px, 0
  seen**. The scapular check passes. The gown and its springs are unchanged, and nothing was added
  to `KNOWN_CLIPPING` or `MIRRORED_LEGACY`. The scapular cut-on-rings control is fed her old run,
  because on the new one it reads 0.59 px.
