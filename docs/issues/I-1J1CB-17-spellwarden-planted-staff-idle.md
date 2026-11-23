---
id: I-1J1CB-17
status: open
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

- [ ] On every idle frame of her baked poses (`characterPoses`, springs included) the shoe's point
      is 0–0.003 H over the ground and moves at most 0.003 H between frames.
- [ ] The staff is 8–12° off vertical, its top out to her right (−x), on every idle frame.
- [ ] The fist's grip is 0.44–0.47 H up; the elbow bent 15–35°; the wrist within `CLEAVE_CARRY`;
      the fist keeps its thumb side where the forearm has it.
- [ ] The staff clears her gown and scapular, legs and boots, right forearm and flared sleeve, right
      hand (off the grip) and head (≥ 1.3 skull radii) on every idle frame; each new guard has a
      fixture that must fail.
- [ ] Her walk, run and death keys keep main 4d56d258's digests; the base wizard's and the
      Pyromancer's idle keys keep theirs; every other class's idle is unchanged.
- [ ] `npx vitest run tools/bake` green.

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
