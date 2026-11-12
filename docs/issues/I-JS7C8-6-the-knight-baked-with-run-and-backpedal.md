---
id: I-JS7C8-6
status: open
implements: FS-JS7C8
blocked_by: [I-JS7C8-12, I-HF0WW-8, I-2325V-11, I-2325V-13]
labels: [ready-for-agent]
title: "FS-JS7C8 slice 6: the knight baked with run, backpedal_attack and the slowed walk_attack, the owner's contact-sheet approval (game-client)"
---
Implements FS-JS7C8 §A (R1–R3), §B (R8, R10), §C (R21), §F (R36–R40); Tunes FS-HF0WW `WALK_ATTACK_CYCLES` (R11); bakes FS-2325V §Change: The class attacks move with weight and cut deep (I-2325V-11, I-2325V-13)

Owner, 2026-11-12, "那先做弓箭手的": the archer is baked first (slice 12), the knight here.

*Reworked 2026-11-12 (owner change to FS-JS7C8): `backpedal_attack` instead of a standalone
`backpedal`, `walk_attack`'s legs over 0.75 walk cycles; blocked by the archer's re-bake
(I-JS7C8-12) instead of I-JS7C8-5. The file name keeps its old slug.*

*Reworked again 2026-11-12 (ADR-0076, FS-HF0WW `## Change: Class sheets at 1.5x`): the knight is
re-baked at `scale` 1.5 (was 2), one page, with the fast run of FS-JS7C8 R2 (I-JS7C8-13); blocked
by the capability and the archer's 1.5x bake (I-HF0WW-8) as well.*

*Reworked a third time 2026-11-12 (owner change to FS-2325V, `## Change: The class attacks move with
weight and cut deep`): the knight is baked once with the forehand and backhand slashes (`backhand`, `walk_backhand`, `backpedal_backhand`) as well (I-2325V-11, I-2325V-13); the contact sheet shows
the old `attack` beside the new. The stale "backpedal legs 150–220" band is gone (R10 retired it).*

**Lane: agent, then HITL.** Ends at the owner's approval of the knight's contact sheet (ADR-0021 §5).
No hand-drawn or hand-edited pixels.

## What to Build

1. The knight's catalogue entry (`tools/bake/page/characters/cast.js`) opts in to the running
   class's specs from I-JS7C8-12: `run`, `walk_attack` over 0.75 walk cycles and
   `backpedal_attack` over 0.75 backward walk cycles, no `backpedal`, and `scale: 1.5` (was 2); with any per-class style the
   knight needs for the run and the backward step to read (garment, sword and shield carry, arm swing:
   `style.run`, its `hold` for the run's carry), keyed on the shared rig.
2. `npm run bake`; commit the knight's atlas pages and `manifest.json`. The contact sheet shows the
   knight's `walk`, `run`, `walk_attack`, `backpedal_attack` and `attack` in 8 directions.
3. The fast run (FS-JS7C8 R2, I-JS7C8-13) is the shared `runCycle`; the knight's own arm style, if
   any (a shield or weapon carry), keeps the lean, the ~90° elbows and the hand reach of R2 and the
   run's legs as baked.
4. Check the knight's measured paces: the run within 180–220 (R3), and both attack-on-the-move clips'
   leg paces at most 90 px/s (R10, R21): if the class's style moves them out, fix the keys, not the
   constants. (The backward step's legs are the walk run backward at 0.75 cycles; there is no
   standalone backpedal and no backpedal pace band: R10 retired the 150–220 band on 2026-11-12.)
5. Record the growth: pages and dimensions before and after, RGBA bytes before and after, per cent,
   against R39's estimate.

## Acceptance Criteria

- [ ] `char_knight_base` carries `run` (8, looping) and `backpedal_attack` (14 frames at 24 fps,
      once), 8 directions, scale 1.5, trimmed, and still `walk` and `walk_attack` (legs over 0.75
      walk cycles); no `backpedal`.
- [ ] The knight's run pace is within 180–220, and its `walk_attack` and `backpedal_attack` leg
      paces at most 90 px/s (the backward legs are the walk's run backward, R8, R10).
- [ ] The leg-clearance guard (FS-HF0WW §C) passes for the new clips; none widens the frame box.
- [ ] The fast run's bake tests (R2: lean, elbows, hand reach, counter-turn, legs as slice 5's)
      pass on the class's rig and style.
- [ ] `npm run bake -- --check` is clean; no other class's atlas changes.
- [ ] Growth recorded (pages, dimensions, bytes, per cent).
- [ ] **HITL:** the owner approves the knight's contact sheet (`run`, `walk_attack`,
      `backpedal_attack`). Not merged before.

## Blocked By

I-JS7C8-12 (the `backpedal_attack` clip, the slowed legs, the archer's approval); I-HF0WW-8 (a
sheet at 1.5x, the archer re-baked on it)

## Spec Reference

FS-JS7C8 §A R1–R3, §B R8, R10, §C R21, §F R36–R40; Facts 9, 10. FS-HF0WW §Change: Class sheets at
1.5x R35.

## Files it expects to touch

- `game-client/tools/bake/page/characters/cast.js` (+ `clips.js` only for a per-class style hook)
- `game-client/public/art/knight-*.png`, `game-client/public/art/manifest.json`
- `game-client/src/render/art/manifest.test.ts` (the knight carries the clips)

## Built (2026-11-12, agent); waiting on the owner's contact sheet

Baked once at 1.5x with `run`, `walk_attack` and `backpedal_attack` over 0.75 cycles and the slash (I-2325V-11): wound up high over the right shoulder with the weight back, the pelvis turning in first, cut down across the front onto the front foot and through to low past the left hip, the shield kept up before the chest; the sword arm pumps in the run, the shield arm carries the shield (run.hold, arms 0.3, elbow 0.2).
The leg guard passes every clip once it measures a leg through the cloth where the cloth hangs
(FS-HF0WW § Change: The guard measures a leg through the cloth; the garments are unchanged). Only
the knight's page and the manifest changed; every other atlas keeps its bytes; `npm run bake -- --check`
reports no changes.

| knight sheet | pages | page px | RGBA | PNG bytes | frames | frame box |
|---|---|---|---|---|---|---|
| main (2x) | 1 | 3396 × 3532 | 47.98 MB | 7,983,741 | 336 | 320 × 292 |
| this bake (1.5x) | 1 | 2828 × 3968 | 44.89 MB | 7,235,301 | 512 | 276 × 228 (184 × 152 screen px) |

−6.4 % RGBA (R39 estimated about +47 % at 2x; the 1.5x projection was about 51 MB); crown 83 as before. The contact sheet and an animated preview (idle; run beside the old 2x walk; the old attack
beside the new, the 7 keys stacked to show the blade's path; walk_attack; backpedal_attack; death; 8 facings) are in the
session scratchpad `classes-1p5x/knight/`.

## Re-built (2026-11-12, agent): the low carry, the grip, the eased attack; waiting on the owner's contact sheet

Re-baked once with the low carry in a normal grip and the eased slash (FS-JS7C8 R2, owner 2026-11-12: "拿武器的動作有點怪 武器的位置似乎太高了 擺動的時候舉得太高", "站立時武器應該可以放下手微微下垂 跑步時也不用太高", "跑步時應該會在胸口附近擺動", "跑步時武器是不是拿反了"): at rest the sword arm hangs, the point down and forward (37-42° below level in the idle); in the run the wrist holds the blade forward along the forearm, its point ahead of the hand, 11-34° below level, never behind the body, the fist never turned over; the slash's key 0 starts half way from the carry to the wind-up and keys 5-6 settle back to it, so the blade turns at most ATTACK_TURN_LIMIT (100°) a frame in and out (92° and 93° into the wind-up, was 149° in one frame; 4° out of key 6, was 99°), the strike and timing kept; the shield as before. The leg check from the bake camera (FS-HF0WW § Change: The guard measures a leg through the cloth R28) finds no leg through the hauberk; the guard reads 0 on every clip.
Only the knight's page and the manifest changed in its bake commit; every other atlas keeps its bytes;
`npm run bake -- --check` reports no changes.

| knight sheet | pages | page px | RGBA | PNG bytes | frames | frame box |
|---|---|---|---|---|---|---|
| this re-bake (1.5x) | 1 | 3204 × 3464 | 44.39 MB | 7,273,851 | 512 | 276 × 228 |

−1.1 % RGBA against the 1.5x bake before (44.89 MB); crown 80 (was 83: the old carry's raised blade no longer over his head).

The contact sheets (idle, walk, run with the old, held and new keys side by side, attack, walk_attack and backpedal_attack old beside new, 8 facings) and an animated preview are in the session scratchpad `carry-final/knight/`.

## Re-built (2026-11-12, agent): the blade about level and swung in, the cloak off his legs; waiting on the owner's contact sheet

Re-baked once (FS-JS7C8 R2, R10; FS-HF0WW § Change: The guard measures a leg through the cloth R29-R30; owner 2026-11-12: "目前跑步時 武器擺動位置有點不自然 跑的時候可以高一點 有點過垂 武器可以往內側擺動一些", "騎士後退攻擊 腳會穿過斗篷"): in the run the blade 5° below to 12° above level (was 11-34° below), its point ahead of the hand and under the head; at the front of the pump the sword hand comes 0.07 H in toward the midline (was 0.026), the blade 19° across the body, clear of the shield. `backpedal_attack` carries the cloak out behind (+0.5 walks): his calves and boots were 18.8 px through it (653 vertex-facings in view); his standing attack carries it the same way (`KNIGHT_ATTACK_CLOTH`): 7.6 px on its last key before. The bake now guards the classes' cloaks; every clip reads 0 but the walk (0.21 px, under the limit). Only the knight's page and the manifest changed in its bake commit; `node tools/bake/bake.mjs --check` reports no changes.

| knight sheet | pages | page px | RGBA | PNG bytes | frames | frame box |
|---|---|---|---|---|---|---|
| this re-bake (1.5x) | 1 | 3108 × 3648 | 45.35 MB | 7,363,119 | 512 | 276 × 228 |

+2.2 % RGBA against the bake before (44.39 MB); crown 80 as before. Old beside new (run, attack, backpedal_attack, 8 facings), an animated preview and the heel and cloak at 4× (backpedal_attack and attack, back and side facings) are in the session scratchpad `wizard-run-staff/knight/`.

## Re-built (2026-11-12, agent): the run blade raised about 15°; waiting on the owner's contact sheet

Re-baked once (Tunes FS-JS7C8 R2 `RUN_BLADE_ELEV`; owner 2026-11-12: "騎士跟傭兵跑步時劍的角度可以再提起10到20度"): in the run the blade 9° to 26° above level (was 5° below to 12° above; `RUN_BLADE` 1.2 → 0.95 rad), in the normal grip, its point ahead of the hand and the body, never over the crown (0.90 H against 0.914), clear of the shield, the free arm, the torso and the head; the swing in unchanged (the blade 23° across the body at the front, was 19°). The leg and cloak guards pass every clip. Only the knight's page and the manifest changed in its bake commit; `node tools/bake/bake.mjs --check` reports no changes.

| knight sheet | pages | page px | RGBA | PNG bytes | frames | frame box |
|---|---|---|---|---|---|---|
| this re-bake (1.5x) | 1 | 2992 × 3792 | 45.38 MB | 7,345,414 | 512 | 276 × 228 |

+0.1 % RGBA against the bake before (45.35 MB); crown 80 as before. The run old over new in 8 facings and an animated preview are in the session scratchpad `run-blade-up/`.

## Re-built (2026-11-12, agent): the run blade raised about 15° again; waiting on the owner's contact sheet

Re-baked once (Tunes FS-JS7C8 R2 `RUN_BLADE_ELEV`; owner 2026-11-12: "戰士 傭兵 跑步時提劍的角度再提升15度"): in the run the blade 24° to 41° above level (was 9° to 26°; `RUN_BLADE` 0.95 → 0.68 rad), in the normal grip, its point ahead of the hand and the body, at most 0.995 H, under `RUN_TIP_CEIL` 1.03 H and under his helm's point (it now rises past the crown, so "never over the crown" is retired); the blade never crosses his head, coif or helm, and the head hides part of it only in the back view (nw), at least 0.19 H ahead of his face, as it did before the raise; clear of the shield, the free arm and the torso; the swing in unchanged (the blade 28° across the body at the front, was 23°). The leg and cloak guards pass every clip. Only the knight's page and the manifest changed in its bake commit; `node tools/bake/bake.mjs --check` reports no changes.

| knight sheet | pages | page px | RGBA | PNG bytes | frames | frame box |
|---|---|---|---|---|---|---|
| this re-bake (1.5x) | 1 | 3716 × 3056 | 45.42 MB | 7,352,010 | 512 | 276 × 228 |

+0.1 % RGBA against the bake before (45.38 MB); crown 80 as before. The run old over new in 8 facings and an animated preview are in the session scratchpad `run-blade-up-2/`.
