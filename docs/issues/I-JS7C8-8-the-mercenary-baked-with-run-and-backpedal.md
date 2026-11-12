---
id: I-JS7C8-8
status: open
implements: FS-JS7C8
blocked_by: [I-JS7C8-12, I-HF0WW-8, I-2325V-12, I-2325V-13]
labels: [ready-for-agent]
title: "FS-JS7C8 slice 8: the mercenary baked with run, backpedal_attack and the slowed walk_attack, the owner's contact-sheet approval (game-client)"
---
Implements FS-JS7C8 §A (R1–R3), §B (R8, R10), §C (R21), §F (R36–R40); Tunes FS-HF0WW `WALK_ATTACK_CYCLES` (R11); bakes FS-2325V §Change: The class attacks move with weight and cut deep (I-2325V-12, I-2325V-13)

*Reworked 2026-11-12 (owner change to FS-JS7C8): `backpedal_attack` instead of a standalone
`backpedal`, `walk_attack`'s legs over 0.75 walk cycles; blocked by the archer's re-bake
(I-JS7C8-12) instead of I-JS7C8-5. The file name keeps its old slug.*

*Reworked again 2026-11-12 (ADR-0076, FS-HF0WW `## Change: Class sheets at 1.5x`): the mercenary is
re-baked at `scale` 1.5 (was 2), one page, with the fast run of FS-JS7C8 R2 (I-JS7C8-13); blocked
by the capability and the archer's 1.5x bake (I-HF0WW-8) as well.*

*Reworked a third time 2026-11-12 (owner change to FS-2325V, `## Change: The class attacks move with
weight and cut deep`): the mercenary is baked once with the forehand and backhand cuts (`backhand`, `walk_backhand`, `backpedal_backhand`) as well (I-2325V-12, I-2325V-13); the contact sheet shows
the old `attack` beside the new. The stale "backpedal legs 150–220" band is gone (R10 retired it).*

**Lane: agent, then HITL.** Ends at the owner's approval of the mercenary's contact sheet (ADR-0021 §5).
No hand-drawn or hand-edited pixels.

## What to Build

1. The mercenary's catalogue entry (`tools/bake/page/characters/cast.js`) opts in to the running
   class's specs from I-JS7C8-12: `run`, `walk_attack` over 0.75 walk cycles and
   `backpedal_attack` over 0.75 backward walk cycles, no `backpedal`, and `scale: 1.5` (was 2); with any per-class style the
   mercenary needs for the run and the backward step to read (garment, weapon carry, arm swing:
   `style.run`, its `hold` for the run's carry), keyed on the shared rig.
2. `npm run bake`; commit the mercenary's atlas pages and `manifest.json`. The contact sheet shows the
   mercenary's `walk`, `run`, `walk_attack`, `backpedal_attack` and `attack` in 8 directions.
3. The fast run (FS-JS7C8 R2, I-JS7C8-13) is the shared `runCycle`; the mercenary's own arm style, if
   any (a shield or weapon carry), keeps the lean, the ~90° elbows and the hand reach of R2 and the
   run's legs as baked.
4. Check the mercenary's measured paces: the run within 180–220 (R3), and both attack-on-the-move clips'
   leg paces at most 90 px/s (R10, R21): if the class's style moves them out, fix the keys, not the
   constants. (The backward step's legs are the walk run backward at 0.75 cycles; there is no
   standalone backpedal and no backpedal pace band: R10 retired the 150–220 band on 2026-11-12.)
5. Record the growth: pages and dimensions before and after, RGBA bytes before and after, per cent,
   against R39's estimate.

## Acceptance Criteria

- [ ] `char_mercenary_base` carries `run` (8, looping) and `backpedal_attack` (14 frames at 24 fps,
      once), 8 directions, scale 1.5, trimmed, and still `walk` and `walk_attack` (legs over 0.75
      walk cycles); no `backpedal`.
- [ ] The mercenary's run pace is within 180–220, and its `walk_attack` and `backpedal_attack` leg
      paces at most 90 px/s (the backward legs are the walk's run backward, R8, R10).
- [ ] The leg-clearance guard (FS-HF0WW §C) passes for the new clips; none widens the frame box.
- [ ] The mercenary's `parry` is unchanged and still raises over the run as it did over the walk (the guard overrides the whole body); a swing inside the guard plays over it as today.
- [ ] The fast run's bake tests (R2: lean, elbows, hand reach, counter-turn, legs as slice 5's)
      pass on the class's rig and style.
- [ ] `npm run bake -- --check` is clean; no other class's atlas changes.
- [ ] Growth recorded (pages, dimensions, bytes, per cent).
- [ ] **HITL:** the owner approves the mercenary's contact sheet (`run`, `walk_attack`,
      `backpedal_attack`). Not merged before.

## Blocked By

I-JS7C8-12 (the `backpedal_attack` clip, the slowed legs, the archer's approval); I-HF0WW-8 (a
sheet at 1.5x, the archer re-baked on it)

## Spec Reference

FS-JS7C8 §A R1–R3, §B R8, R10, §C R21, §F R36–R40; Facts 9, 10. FS-HF0WW §Change: Class sheets at
1.5x R35.

## Files it expects to touch

- `game-client/tools/bake/page/characters/cast.js` (+ `clips.js` only for a per-class style hook)
- `game-client/public/art/mercenary-*.png`, `game-client/public/art/manifest.json`
- `game-client/src/render/art/manifest.test.ts` (the mercenary carries the clips)

## Built (2026-11-12, agent); waiting on the owner's contact sheet

Baked once at 1.5x with `run`, `walk_attack` and `backpedal_attack` over 0.75 cycles and the cut (I-2325V-12): wider and lighter than the knight's, a drawing cut from high over the right shoulder to low past the left hip, the free hand thrown out and back, a flick back to his guard; the parry unchanged; both arms pump in the run (run.hold).
The leg guard passes every clip once it measures a leg through the cloth where the cloth hangs
(FS-HF0WW § Change: The guard measures a leg through the cloth; the garments are unchanged). Only
the mercenary's page and the manifest changed; every other atlas keeps its bytes; `npm run bake -- --check`
reports no changes.

| mercenary sheet | pages | page px | RGBA | PNG bytes | frames | frame box |
|---|---|---|---|---|---|---|
| main (2x) | 1 | 3460 × 3424 | 47.39 MB | 6,466,152 | 368 | 322 × 292 |
| this bake (1.5x) | 1 | 2808 × 4080 | 45.83 MB | 6,037,846 | 544 | 297 × 261 (198 × 174 screen px) |

−3.3 % RGBA (the 1.5x projection was about 50 MB); crown 92 (was 93). The contact sheet and an animated preview (idle; run beside the old 2x walk; the old attack
beside the new, the 7 keys stacked to show the blade's path; walk_attack; backpedal_attack; death; 8 facings) are in the
session scratchpad `classes-1p5x/mercenary/`.

## Re-built (2026-11-12, agent): the low carry, the grip, the eased attack; waiting on the owner's contact sheet

Re-baked once with the low carry in a normal grip and the eased cut (FS-JS7C8 R2, owner 2026-11-12: "拿武器的動作有點怪 武器的位置似乎太高了 擺動的時候舉得太高", "站立時武器應該可以放下手微微下垂 跑步時也不用太高", "跑步時應該會在胸口附近擺動", "跑步時武器是不是拿反了"): at rest the sword arm hangs, the point down and forward; in the run the wrist holds the curved blade forward along the forearm, 11-33° below level, the fist never turned over; the cut's key 0 starts from the carry and keys 5-6 settle back to it (96° and 97° in, was 153° in one frame; 5° out of key 6, was 99°), the strike and timing kept, the flick back up to his old low guard gone with the guard; his parry unchanged. The leg check from the bake camera finds no leg through the coat; the guard reads 0 on every clip.
Only the mercenary's page and the manifest changed in its bake commit; every other atlas keeps its bytes;
`npm run bake -- --check` reports no changes.

| mercenary sheet | pages | page px | RGBA | PNG bytes | frames | frame box |
|---|---|---|---|---|---|---|
| this re-bake (1.5x) | 1 | 2908 × 3852 | 44.81 MB | 6,012,838 | 544 | 297 × 261 |

−2.2 % RGBA against the 1.5x bake before (45.83 MB); crown 75 (was 92: the old low guard stood the blade over his crown, as FS-JS7C8 measured).

The contact sheets (idle, walk, run with the old, held and new keys side by side, attack, walk_attack and backpedal_attack old beside new, 8 facings) and an animated preview are in the session scratchpad `carry-final/mercenary/`.
