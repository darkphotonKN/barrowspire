---
id: I-1J1CB-18
status: open
implements: FS-1J1CB
blocked_by: []
labels: [ready-for-agent]
title: "FS-1J1CB slice 18: the Spellwarden's heavy cast, the long staff pushed forward 30–45° with the elbow bent and the trunk leaning in (keys and guards; no bake)"
---
Implements FS-1J1CB §Change: The Spellwarden's long staff planted and swung heavy (R79–R82)

## What to Build

Her own cast keys 3–5 (a new clips.js attack, the staff cast's keys 0–2 and 6 kept): on the strike
and its carry through the fist is pushed forward between the waist and the lower chest, the elbow
bent 40–60°, the staff's head tipped toward the target 30–45° from vertical, its foot passing
outside her right hip, the trunk leaning in further than `staffCast`'s; key 5 eases it back toward
upright (15–30°, elbow 50–70°). Same 7 keys at 12 fps, glow 5, 3.6, 2.2 on keys 3–5. The
Pyromancer keeps `staffCast`.

## Acceptance Criteria

- [ ] Her attack: 7 keys; keys 0–2 and 6 equal `staffCast`'s; glow on keys 3–5 is 5, 3.6, 2.2.
- [ ] Keys 3 and 4: staff 30–45° from vertical, within 15° of the facing in plan; elbow 40–60°; the
      fist's grip between the waist and the lower chest; spine plus chest pitched further forward
      than `staffCast`'s same key.
- [ ] Key 5: staff 15–30° from vertical; elbow 50–70°.
- [ ] Every baked attack frame: the staff clears her head (≥ 1.3 skull radii), torso, gown, legs,
      boots, right forearm, sleeve and hand (the existing guards), and the ground.
- [ ] The Pyromancer's and the base wizard's attack keys keep their bytes.
- [ ] `npx vitest run tools/bake` green.

## Blocked By

None

## Spec Reference

FS-1J1CB §Change: The Spellwarden's long staff planted and swung heavy: R79, R80, R81, R82.

## TDD Approach

- RED: a classMotion describe reading `SPELLWARDEN_STYLE`'s attack keys: staff 30–45° on keys 3–4
  (today 12.6° and 15.5°), elbow 40–60° (today 11° and 14°).
- GREEN: `ATTACKS.wardCast` with `WARD_CAST` keys 3–5; `SPELLWARDEN_STYLE.attack = "wardCast"`.

## Files it expects to touch

`game-client/tools/bake/page/characters/clips.js`, `classStyles.js`, `classMotion.test.mjs`,
`mageLooks.test.mjs`.
