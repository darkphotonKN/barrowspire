---
id: I-JS7C8-23
status: open
implements: FS-JS7C8
blocked_by: [I-JS7C8-21, I-JS7C8-22]
labels: []
title: "FS-JS7C8 slice 23: the mercenary's trailing sword in the run: arm back 30–45° and nearly straight, hand at the hip, the blade behind with the point down and the edge down, never on the ground, swaying a little; the free arm pumping (game-client bake tool)"
---
Implements FS-JS7C8 §Change: The mercenary's sprint and trailing sword (R97–R103)

**Lane: agent.** Keys and their tests only; no bake (I-JS7C8-24). Blocked by I-JS7C8-21 because
the 20° lean moves the chest frame the arm swings in, and by I-JS7C8-22 because the carry must
pass the blade guards.

## What to Build

The run's carry for the mercenary: `MERCENARY_STYLE.run`'s `hold` and its per-arm `arms`,
`elbow`, `wrist`, `cross` (the shared `runCycle` mechanism, clips.js:365-410). His idle and
walk `hold` are unchanged.

1. **The arm back (R97).** The upper arm 30–45° behind the hips-to-neck line on average (25–50° on
   every sample), the elbow bent 0–20°, the hand within 0.06 H of the hips bone's height and
   behind it. *Estimate:* upper arm about 0.55–0.65 rad back in the chest's frame.
2. **The blade behind, point down, edge down (R98).** The hand-to-point line 15–45° below level and
   back, the point at least 0.3 H behind the hips bone. The edge (the grip frame's −y) faces at
   least 30° below level. Turn the arm about its length (upper arm and/or forearm), never the fist
   on the forearm: the normal-grip test (classMotion.test.mjs:592-605) must pass. *Measured:* about
   2.6 rad of twist between the two gives 30–40°. Keep the forearm's own share within about 1.6
   rad.
3. **Never on the ground (R99).** On every sample, every sword mesh's lowest point at least 0.06 H
   above the ground. (I-JS7C8-24 re-checks it on the baked frames of all three looks.)
4. **The sway (R100).** The trailing arm's angle varies 12–26° peak to peak over the cycle, back
   with the left leg forward. *Estimate:* the sword arm's `run.arms` about 0.2, `run.elbow` near
   0, `run.cross` 0.
5. **The free arm (R101).** `run.arms[0]` 1, `run.elbow[0]` 1, `cross[0]` and `wrist[0]` 0, under
   `RUN_ARM`/`RUN_ELBOW`. Test: elbow 80–100° on every key, the hand back past the hip by at least
   0.06 H. Record the front height against the chest bone here, and don't tune it away.
6. **Out of the body (R102).** The sword out of the torso and the head (`inside`, :608-628), clear
   of the free arm by more than 0.06 × `armR` H (:443-457).
7. **Tidy (R103).** `MERC_RUN_BLADE` goes if nothing reads it. The classStyles.js header comment
   (:7-40) no longer describes his run blade. The knight's `RUN_*` constants stay.

Run I-JS7C8-22's guards on the new run on all three looks. If one can only pass with a look change
(a shorter half-cloak, a sleeve cut back, the Sellsword's right spaulder moved), or with a
shorter heel kick in the shared sprint (which would move the archer's keys), stop and report back
(the charter's escalation). Never add an exemption.

## Acceptance Criteria

- [x] RED first, against I-JS7C8-21's run: the blade 8.7–27.4° *above* level and ahead (needs
      15–45° below and behind); the sword hand 0.458–0.638 H pumping forward (needs at the hip,
      behind it); the edge down (needs ≥ 30° below level).
- [x] On every sample: arm 25–50° behind the trunk (30–45° mean); elbow 0–20°; hand within 0.06 H
      of the hips bone's height and behind it.
- [x] On every sample: blade 15–45° below level and back; the point ≥ 0.3 H behind the hips bone;
      edge ≥ 30° below level; the normal-grip test passes on his run.
- [x] On every sample: every sword mesh's lowest point ≥ 0.06 H above the ground.
- [x] Sway 12–26° peak to peak.
- [x] Free arm: elbow 80–100° on every key, the hand ≥ 0.06 H back past the hip; front height
      recorded.
- [x] The sword out of the torso and the head, and clear of the free arm.
- [x] I-JS7C8-22's guards pass on the new run on all three looks; the leg and cloak guards
      (`clearance.test.mjs`, `mercLooks.test.mjs`) pass with no exemption.
- [x] I-JS7C8-21's digests and sprint tests are unchanged and green.
- [x] `npm test`, `npm run lint`, `npx tsc --noEmit` in `game-client` pass.

## Blocked By

I-JS7C8-21, I-JS7C8-22

## Spec Reference

FS-JS7C8 §Change: The mercenary's sprint and trailing sword: M2–M4, M6; R97–R103; the Acceptance Criteria's bake bullets on the arm, the blade, the edge,
the ground, the sway, the free arm and the body; Edge States "The lowest frames", "The heel kick
under the blade", "The three looks", "The arm's twist".

## TDD Approach

- RED: a describe for his trailing carry on his rig (`rigOf(MERCENARY_BUILD)` with his style, as
  classMotion.test.mjs reads the others), with the sword's points from `GEAR.mercenary` and the
  edge as the grip frame's −y.
- GREEN: `MERCENARY_STYLE.run` (`hold`, `arms`, `elbow`, `wrist`, `cross`).

## Files it expects to touch

- `game-client/tools/bake/page/characters/classStyles.js` (`MERCENARY_STYLE.run`,
  `MERC_RUN_BLADE`, the header comment)
- `game-client/tools/bake/page/characters/classMotion.test.mjs` (his trailing-carry describe)
- `game-client/tools/bake/page/characters/mercLooks.test.mjs` (the guards run on the new run)

## Built (2026-11-23, agent; review round 1 the same day)

His run's `hold` is `MERC_TRAILING_SWORD` (`classStyles.js`):

- The upper arm is keyed as three turns in the chest's frame (`MERC_TRAILING_TURNS`): back 0.5
  rad, out 0.3 rad past the rest's 0.1, then 0.6 rad about its own length.
- Review round 1 composes those turns at load into the one XYZ triple the bone takes, less the
  rest, rounded to the thousandth: [0.76, 0.547, −0.373], the same numbers as before, so no pixel
  changes. `classMotion.test.mjs` recomposes the triple from the turns and the rig's own rest. A
  tune round edits the three turns, never the triple.
- The forearm is [−0.3, 1.6, 0] (bent 0.3, pronated 1.6 rad) and the hand [1, 0, 0] (cocked in the
  swing only).
- The sword arm sways a tenth of the shared pump (`MERC_TRAILING_SWAY` 0.1, `run.elbow[1]` 0).
- The free arm keeps the shared pump (`run.arms[0]` 1, `run.elbow[0]` 1).

Measured on his rig over 32 samples:

- **Arm (R97):** 26.6–43.8° behind the trunk (35.4° mean). Elbow 16.6–17.8°. Hand −0.041 to
  +0.052 H against the hips bone's height, and 0.11–0.20 H behind it.
- **Blade (R98):** 22.3–28.6° below level and back. The point is 0.55–0.65 H behind the hips bone.
  The edge faces down, 34.6–46.0° below level.
- **Twist (R98):** the edge comes down by turning the arm about its length, 2.2 rad in all (0.6 at
  the upper arm, 1.6 at the forearm), never by rolling the fist. The normal-grip test passes on
  every run key.
- **Ground (R99):** the sword's lowest point is 0.217 H over the ground on the baked run frames
  (frame 4) on all three looks.
- **Sway (R100):** 17.2° peak to peak. The arm is furthest back as the free arm swings furthest
  forward and his right knee leads (the shared pump's phase, FS R100 as corrected in `8a73c62a`).
- **Free arm (R101):** elbow 80–100° on every key, and the hand at least 0.06 H back past the hip.
  The front height against the chest bone (recorded, not tuned): the hand peaks **0.027 H under
  the chest bone** at the front of its pump, and is held 0.015–0.04 H under it.
- **Body (R102):** the sword stays out of the torso and the head, and clear of the free arm.

I-JS7C8-22's guards pass on all three looks with no exemption; the margins are in that issue. The
arm clears the Duelist's half-cloak and his robe (the sleeve by 0.050 H), which emptied the
must-fail list. `MERC_RUN_BLADE` is gone, and the header comment no longer describes his raised
run blade. The knight's `RUN_*` carry, the shared sprint keys and every digest are unchanged.

Review rounds 1 and 2: the Sellsword's right spaulder, turned with this carry's swing, sinks 0.041 H
into his body on the run (surface depth). That is under the 0.062 H his approved attack sinks it,
and I-JS7C8-22's guard holds the run to the attack. Keeping the spaulders out of the chest is a
look change, left to the owner as a follow-up (see I-JS7C8-22).
