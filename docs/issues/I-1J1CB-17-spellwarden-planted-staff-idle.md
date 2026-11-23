---
id: I-1J1CB-17
status: done
implements: FS-1J1CB
blocked_by: []
labels: [ready-for-agent]
title: "FS-1J1CB slice 17: the Spellwarden's idle plants the long staff on the ground, 8–12° out, the hand following it (keys and guards; no bake)"
---
Implements FS-1J1CB §Change: The Spellwarden's long staff planted and swung heavy (R74–R78)

## What to Build

Her idle only. The staff's iron shoe stands on the ground just outside her bell gown's hem, ahead
of and to the right of her right foot, the staff about 10° off vertical, its top leaning out to her
right; the fist on the leather grip (about 0.45 H up, the staff's measures fix it), the arm hanging
with the elbow a little bent, the right shoulder dropped a touch by the clavicle. Each of the six
idle frames carries its own right-arm keys (clavicle, upper arm, forearm, wrist), solved on her rig
to the thousandth, so the breathing never lifts or sinks the shoe: the hand follows the planted
staff. Her walk keeps `WARD_HOLD`: the idle takes a carry of its own (a style's idle hold in
`clips.js` `idleCycle`, every other style's idle byte for byte as before).

## Acceptance Criteria

- [x] On every idle frame of her baked poses (`characterPoses`, springs included) the shoe's point
      is 0–0.003 H over the ground and moves at most 0.003 H between frames.
- [x] The staff is 8–12° off vertical, its top out to her right (−x), on every idle frame.
- [x] The fist's grip is 0.44–0.47 H up; the elbow bent 15–35°; the wrist within `CLEAVE_CARRY`;
      the fist keeps its thumb side where the forearm has it.
- [x] The staff clears her gown and scapular, legs and boots, right forearm and flared sleeve, right
      hand (off the grip) and head (≥ 1.3 skull radii) on every idle frame; each new guard has a
      fixture that must fail.
- [x] Her walk, run and death keys keep main 4d56d258's digests; the base wizard's and the
      Pyromancer's idle keys keep theirs; every other class's idle is unchanged.
- [x] `npx vitest run tools/bake` green.

## Blocked By

None

## Spec Reference

FS-1J1CB §Change: The Spellwarden's long staff planted and swung heavy: R74, R75, R76, R77, R78, R83 (her walk keys); Edge States (breathing, hem sway).

## TDD Approach

- RED: a mageLooks guard reading her baked idle frames: the shoe's point 0–0.003 H over the ground
  (today 0.088–0.104 H) and the staff 8–12° off vertical (today 2–7°).
- GREEN: `idleCycle` takes `style.idle.hold`; `SPELLWARDEN_STYLE.idle.hold` and per-frame
  `WARD_PLANT` keys in `idleExtra`.

## Files it expects to touch

`game-client/tools/bake/page/characters/clips.js`, `classStyles.js`, `mageLooks.test.mjs`,
`classMotion.test.mjs` (digests).

## Built (2026-11-23, agent)

`idleCycle` takes `style.idle.hold` (every other style's idle byte for byte); the Spellwarden's idle
holds only the left forearm and plants the staff with one right-arm key per idle frame,
`WARD_PLANT_ARM` (clavicle, upper arm, forearm, wrist), solved from `WARD_PLANT` (the shoe at
[−0.1, 0.16] H, 0.0012 H up, the staff 10° out, straight to her right). The solve is committed as
`solvePlantArm` in `mageLooks.test.mjs`, which re-derives the keys to the thousandth and holds every
baked idle frame within 0.002 H and 0.5° of `WARD_PLANT`; a test pins the six idle frames the keys
assume. Measured on her baked idle frames (`characterPoses`, springs included):

| Measure | All six frames |
|---|---|
| the shoe's point over the ground | 0.0011–0.0012 H |
| the staff off vertical, top to −x | 9.9–10.0° |
| the fist's grip | 0.454 H up |
| the elbow's bend | 21–24° |
| the wrist's largest turn | 0.88 rad (`CLEAVE_CARRY` 1.3) |
| the staff outside her gown, scapular, legs and boots | ≥ 0.0089 H |

The fist keeps its thumb side on every idle key (`classMotion.test.mjs`, the Spellwarden's
normal-grip guard); the forearm, sleeve and hand guard reads her idle too. Her walk, run and death
keep main 4d56d258's digests. The old-beside-new comparisons are under `game-client/tools/bake/review/spellwarden-staff/`
(`idle-old-vs-new-1x`, `-2x`, `-anim`, `-detail`, `.html` and `.png`; per facing in `inspect/`).
