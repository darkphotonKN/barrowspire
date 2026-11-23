---
id: I-JS7C8-29
status: open
implements: FS-JS7C8
blocked_by: [I-JS7C8-28]
labels: []
title: "FS-JS7C8 slice 29: the wizard's cast re-keyed to point: at the strike the arm reaches nearly straight toward the aim and the staff or focus points along it, chest to shoulder high, never over her head; the wind-up, weight and arcs kept; same 7 keys at 12 fps (game-client bake tool)"
---
Implements FS-JS7C8 §Change: The wizard's sprint and pointed cast (R124–R127, R129; E2)

**Lane: agent.** Keys and their tests only; no bake (I-JS7C8-30). Blocked by I-JS7C8-28 because the
new keys must pass the staff and focus guards. Independent of I-JS7C8-27 (the cast adds no hold
and does not read the run).

**Escalation E2 is open.** W4 as written grows the frame box's width (*measured* 222 → 240, 225 →
243, 225 → 240). Before you start, read the FS for the coordinator's pick. Option (a) (the
default) is W4 as written, keyed here, with I-JS7C8-30's bake stopping if the box grows. A pick of
(c) (the elbow bent about 45°) or (d) (the staff about 25° below level) changes R125's bands,
restated in the FS first.

## What to Build

`ATTACKS.cast` (clips.js:663-672): the right arm's keys and its wrist. *Estimate:* keys 2–5.

1. **Same clip (R124).** 7 keys at 12 fps, not looping, the strike and `fx.glow` 5 at key 3, over
   `CAST_STANCE`. The other classes' attacks are untouched.
2. **The point (R125).** On keys 3 and 4: the staff (grip +z, butt to top) within 10° of the facing
   in plan and 0–15° below level; the shoulder-to-hand line within 25° of the staff; the elbow bent
   at most 20°; the hand between the chest bone's height and the shoulder's; the orb not above the
   shoulder. On every key the orb is never above her crown.
3. **A hand that could hold it (R126).** Extend the normal-grip test (classMotion.test.mjs:614) to
   `attack`. The wrist (`handR` x) cocks at most 1.3 rad (`CLEAVE_CARRY`), so the arm's angle does
   part of the work. The trial needed 1.57–1.72 rad with the arm along the staff.
4. **Weight and arcs kept (R127).** The wizard's cast describe (classMotion.test.mjs:688-739) passes
   unchanged: the wind-up (orb back ≥ 0.04 H, weight back), the thrust (≥ 0.2 H, onto the front foot
   ≥ 0.03), the pelvis before the chest (≥ 0.15 rad), the curved path, the free hand out ≥ 0.08 H at
   the strike. `ATTACK_TURN_LIMIT` (100°) holds from the carry into key 0, through keys 0–1 and 4–6,
   and back to the carry (:658-673).
5. **The looks (R129).** The same keys on the Spellwarden and the Pyromancer: R125–R128 on each row.
6. **The box, measured before the bake (E2).** Measure each sheet's frame box with the bake's first
   pass (baker.js `bakeCharacter` :254-296 and frameBox.js; or `npm run bake -- --check` if it
   reports it). Record it here. If it grows past 222 × 192, 225 × 195 or 225 × 198, report it (E2).
   Never route around it.

Run I-JS7C8-28's guards on the new cast on all three looks. If one can only pass with a look change
(a focus shortened, a sleeve cut back), stop and report back. Never add an exemption.

## Acceptance Criteria

- [ ] RED first, against today's cast: the staff 77° above level and 78° off the facing at key 3
      (needs within 10° in plan and 0–15° below level); the orb at 0.95 H (needs under the
      shoulder at keys 3–4 and under the crown on every key).
- [ ] Keys 3 and 4 meet R125 on all three looks.
- [ ] The normal grip holds on every `attack` key; the wrist cocks at most 1.3 rad.
- [ ] The wizard's cast describe (wind-up, weight, pelvis first, curve, free hand) and
      `ATTACK_TURN_LIMIT` pass unchanged.
- [ ] I-JS7C8-28's guards pass on the new cast on all three looks, with no exemption.
- [ ] The frame box per sheet, measured, is recorded here, with the E2 option it meets.
- [ ] `npm test`, `npm run lint`, `npx tsc --noEmit` in `game-client` pass.

## Blocked By

I-JS7C8-28

## Spec Reference

FS-JS7C8 §Change: The wizard's sprint and pointed cast: W4; E2; R124–R127, R129, R130; the
Acceptance Criteria's cast bullets; Edge States "An aim between two facings", "The fireball's
start", "The three looks"; FS-2325V § Change: The class attacks move with weight and cut deep R1,
R4, R5.

## TDD Approach

- RED: a describe for the point on her rig (`rigOf(WIZARD_BUILD)`, `GEAR.wizard` and the focus
  points), the staff as the grip frame's +z.
- GREEN: `ATTACKS.cast`'s right-arm keys.

## Files it expects to touch

- `game-client/tools/bake/page/characters/clips.js` (`ATTACKS.cast`)
- `game-client/tools/bake/page/characters/classMotion.test.mjs` (the point describe, the normal grip on `attack`)
- `game-client/tools/bake/page/characters/mageLooks.test.mjs` (the looks' point and guards)
