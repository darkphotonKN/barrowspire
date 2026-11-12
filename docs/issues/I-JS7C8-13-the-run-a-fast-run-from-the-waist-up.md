---
id: I-JS7C8-13
status: done
implements: FS-JS7C8
blocked_by: []
labels: [ready-for-agent]
title: "FS-JS7C8 slice 13: the run a fast run from the waist up (lean, pumping arms, shoulder counter-turn), its legs unchanged; baked with the archer at 1.5x (game-client)"
---
Implements FS-JS7C8 §A (R2, R3), §F (R37, R41), §G (R43), §Acceptance Criteria "Run and the backward step" (the run's bake tests)

**Lane: agent, then HITL.** The owner's four lines on the run (2026-11-12, recorded in FS-JS7C8
*Owner change, 2026-11-12: a fast run from the waist up*). The keys are code (`runCycle`), the
archer is baked with them in I-HF0WW-8 at 1.5x; the slice ends at the owner's approval of the old
run beside the new on the contact sheet (ADR-0021 §5).

## What to Build

1. `tools/bake/page/characters/clips.js` `runCycle`: one named lean (`RUN_LEAN`), the trunk leaning
   about 10° on the hips-to-neck line, the neck bringing the head back level; elbows about 90°
   (`RUN_ELBOW`), the arms pumping from the shoulder to chest height and back past the hip
   (`RUN_ARM`); the shoulders turning against the hips (`RUN_COUNTER`). The legs' keys, the flight,
   the stride, the 14 fps cadence: unchanged.
2. A class's arm style keeps its absolute effect: the archer's bow arm swing and elbow (`cast.js`
   `run`) re-scaled so the bow arm's swing stays within 0.26 rad and its elbow near straight.
3. `RUN_PACE` re-measured (pace.js); stays 194 if the legs did not move.
4. The contact sheet shows the old run beside the new, 8 facings (`tools/bake/lib/contact.mjs`, or a
   comparison written from the old committed atlas).

## Acceptance Criteria

- [x] Red first, against today's run: the trunk's lean 9–11° (8–12° in every sample), the pumping
      elbows 80–100° in every frame, each hand above the chest bone and below the shoulder at the
      front of its swing and at least 0.06 H behind the hip at the back, the shoulders turning
      6.5–10° against the hips.
- [x] The head looks ahead (its pitch within 3° of rest) and holds steady (the existing test).
- [x] The legs are slice 5's, key for key (pelvis, thighs, shins, feet, lift); `RUN_PACE` within 1
      of the measure, 194.
- [x] The archer's bow arm: swing within 0.26 rad, elbow above −0.5 rad, in every frame.
- [x] The leg-clearance guard passes the archer's run at bake.
- [x] **HITL:** the owner approves the archer's new run beside the old on the contact sheet.

## Blocked By

None

## Spec Reference

FS-JS7C8 §A R2, R3; §F R37, R41; §G R43; *Owner change, 2026-11-12: a fast run from the waist up*.

## Files it expects to touch

- `game-client/tools/bake/page/characters/clips.js` (+ `clips.test.mjs`), `cast.js`
- `game-client/tools/bake/lib/contact.mjs` (the old run beside the new)
- `game-client/docs/design-guideline.md` (the run in the clip list)

## Built (2026-11-12, agent); waiting on the owner's eye

Seen red on today's run: the trunk 4.4° (needed 9–11), elbows 69–86° (80–100), the hand 0.054 H
under the chest bone at the front, the shoulders 4.5° (6.5–10). Now: `RUN_LEAN` 0.24 rad, four
fifths at the spine (the hips-to-neck line 10.0–10.3°); `RUN_ELBOW` −1.57 (84–96°); `RUN_ARM` 0.85
(the hand 0.04 H over the chest bone and 0.04 H under the shoulder at the front, 0.075 H behind the
hip at the back); `RUN_COUNTER` 0.14 (the shoulders 7.7° against the hips' 6.9°); the neck
composes the inverse of the pelvis, spine and chest turns, so the head stays level and steady
(summing the angles left it rolling 6.5° once the lean grew). The legs are slice 5's key for key;
`RUN_PACE` re-measured at 194 (within 1), unchanged. The archer's bow arm keeps its jog-era
absolute swing and elbow (`arms` 0.3, `elbow` 0.215 under the new constants). Baked with the
archer at 1.5x in I-HF0WW-8; the leg-clearance guard passes. The comparison for the owner: the old
(2x) run beside the new (1.5x), 8 facings, at game size and ×2, plus an animated preview, in the
session scratchpad `archer-1p5x-final/` (`run-old-vs-new-1x.png`, `run-old-vs-new-2x.png`,
`preview-run-old-vs-new.html`).

## Owner approval

2026-11-12: the owner approved the archer at 1.5x with the new run after playing it ("好").
