---
id: I-JS7C8-7
status: open
implements: FS-JS7C8
blocked_by: [I-JS7C8-12, I-HF0WW-8, I-2325V-10]
labels: [ready-for-agent]
title: "FS-JS7C8 slice 7: the wizard baked with run, backpedal_attack and the slowed walk_attack, the owner's contact-sheet approval (game-client)"
---
Implements FS-JS7C8 §A (R1–R3), §B (R8, R10), §C (R21), §F (R36–R40); Tunes FS-HF0WW `WALK_ATTACK_CYCLES` (R11); bakes FS-2325V §Change: The class attacks move with weight and cut deep (I-2325V-10)

*Reworked 2026-11-12 (owner change to FS-JS7C8): `backpedal_attack` instead of a standalone
`backpedal`, `walk_attack`'s legs over 0.75 walk cycles; blocked by the archer's re-bake
(I-JS7C8-12) instead of I-JS7C8-5. The file name keeps its old slug.*

*Reworked again 2026-11-12 (ADR-0076, FS-HF0WW `## Change: Class sheets at 1.5x`): the wizard is
re-baked at `scale` 1.5 (was 2), one page, with the fast run of FS-JS7C8 R2 (I-JS7C8-13); blocked
by the capability and the archer's 1.5x bake (I-HF0WW-8) as well.*

*Reworked a third time 2026-11-12 (owner change to FS-2325V, `## Change: The class attacks move with
weight and cut deep`): the wizard is baked once with the re-keyed cast as well (I-2325V-10); the contact sheet shows
the old `attack` beside the new. The stale "backpedal legs 150–220" band is gone (R10 retired it).*

**Lane: agent, then HITL.** Ends at the owner's approval of the wizard's contact sheet (ADR-0021 §5).
No hand-drawn or hand-edited pixels.

## What to Build

1. The wizard's catalogue entry (`tools/bake/page/characters/cast.js`) opts in to the running
   class's specs from I-JS7C8-12: `run`, `walk_attack` over 0.75 walk cycles and
   `backpedal_attack` over 0.75 backward walk cycles, no `backpedal`, and `scale: 1.5` (was 2); with any per-class style the
   wizard needs for the run and the backward step to read (garment, weapon carry, arm swing:
   `style.run`, its `hold` for the run's carry), keyed on the shared rig.
2. `npm run bake`; commit the wizard's atlas pages and `manifest.json`. The contact sheet shows the
   wizard's `walk`, `run`, `walk_attack`, `backpedal_attack` and `attack` in 8 directions.
3. The fast run (FS-JS7C8 R2, I-JS7C8-13) is the shared `runCycle`; the wizard's own arm style, if
   any (a shield or weapon carry), keeps the lean, the ~90° elbows and the hand reach of R2 and the
   run's legs as baked.
4. Check the wizard's measured paces: the run within 180–220 (R3), and both attack-on-the-move clips'
   leg paces at most 90 px/s (R10, R21): if the class's style moves them out, fix the keys, not the
   constants. (The backward step's legs are the walk run backward at 0.75 cycles; there is no
   standalone backpedal and no backpedal pace band: R10 retired the 150–220 band on 2026-11-12.)
5. Record the growth: pages and dimensions before and after, RGBA bytes before and after, per cent,
   against R39's estimate.

## Acceptance Criteria

- [ ] `char_wizard_base` carries `run` (8, looping) and `backpedal_attack` (14 frames at 24 fps,
      once), 8 directions, scale 1.5, trimmed, and still `walk` and `walk_attack` (legs over 0.75
      walk cycles); no `backpedal`.
- [ ] The wizard's run pace is within 180–220, and its `walk_attack` and `backpedal_attack` leg
      paces at most 90 px/s (the backward legs are the walk's run backward, R8, R10).
- [ ] The leg-clearance guard (FS-HF0WW §C) passes for the new clips; none widens the frame box.
- [ ] The fast run's bake tests (R2: lean, elbows, hand reach, counter-turn, legs as slice 5's)
      pass on the class's rig and style.
- [ ] `npm run bake -- --check` is clean; no other class's atlas changes.
- [ ] Growth recorded (pages, dimensions, bytes, per cent).
- [ ] **HITL:** the owner approves the wizard's contact sheet (`run`, `walk_attack`,
      `backpedal_attack`). Not merged before.

## Blocked By

I-JS7C8-12 (the `backpedal_attack` clip, the slowed legs, the archer's approval); I-HF0WW-8 (a
sheet at 1.5x, the archer re-baked on it)

## Spec Reference

FS-JS7C8 §A R1–R3, §B R8, R10, §C R21, §F R36–R40; Facts 9, 10. FS-HF0WW §Change: Class sheets at
1.5x R35.

## Files it expects to touch

- `game-client/tools/bake/page/characters/cast.js` (+ `clips.js` only for a per-class style hook)
- `game-client/public/art/wizard-*.png`, `game-client/public/art/manifest.json`
- `game-client/src/render/art/manifest.test.ts` (the wizard carries the clips)

## Built (2026-11-12, agent); waiting on the owner's contact sheet

Baked once at 1.5x with `run`, `walk_attack` and `backpedal_attack` over 0.75 cycles and the cast (I-2325V-10): the sceptre drawn back by the right shoulder with the weight back, the pelvis turning in first, the thrust onto the front foot with the free hand opening out; both arms pump in the run (run.hold).
The leg guard passes every clip once it measures a leg through the cloth where the cloth hangs
(FS-HF0WW § Change: The guard measures a leg through the cloth; the garments are unchanged). Only
the wizard's page and the manifest changed; every other atlas keeps its bytes; `npm run bake -- --check`
reports no changes.

| wizard sheet | pages | page px | RGBA | PNG bytes | frames | frame box |
|---|---|---|---|---|---|---|
| main (2x) | 1 | 2720 × 3356 | 36.51 MB | 5,243,110 | 336 | 286 × 268 |
| this bake (1.5x) | 1 | 2116 × 3872 | 32.77 MB | 4,860,635 | 512 | 222 × 192 (148 × 128 screen px) |

−10.2 % RGBA (the 1.5x projection was about 39 MB); crown 75 as before. The contact sheet and an animated preview (idle; run beside the old 2x walk; the old attack
beside the new; walk_attack; backpedal_attack; death; 8 facings) are in the
session scratchpad `classes-1p5x/wizard/`.

## Re-built (2026-11-12, agent): the low carry, the grip, the eased attack; waiting on the owner's contact sheet

Re-baked once with the robe held through the run, the sceptre's lean and the low carry in a normal grip (FS-JS7C8 R2; FS-HF0WW § Change: The guard measures a leg through the cloth R24-R28; owner 2026-11-12: "法師跑步會輕微破圖 膝蓋處會凸出衣服 腰部似乎也有一點", "法袍後面小腿處的裙擺綠色區塊跑動時似乎會被黑色吃掉", "跑步時武器是不是拿反了", "法師走路時武器可以垂一點 現在手垂下來了 但是武器卻還是拿得很直"): the gown's thigh carries the cloth over the bent knee (`kneeCover` 0.05), the thighs' roots drawn in under her pinched waist, the scapular cut on the gown's rig (`skirt({ over })`) so the black gown no longer comes through the teal nor past its back panel behind the calves; measured from the bake camera in all 8 facings, ID-rendered at 1.5x: leg px in the run 0 (was up to 26 a frame at the knee, 3 at the waist), gown px through the teal 6 in the whole run (was 456, up to 29 a frame), the teal in the back views' lower band 3,800-3,900 px a facing in the run (was 576-883; the walk's 3,600-4,200) at the walk's light; the robe reaches no further (0.427 H). At rest the sceptre leans 37-41° off vertical in the idle and 33-44° in the walk (SCEPTRE_TILT 40°), forward and a little out; in the run it stands up from the fist, the orb 5-36° above the hand and under the shoulder. The guard reads 0 on every clip. Left: in a few run frames (keys 1 and 5, side and back views) a pair of dashes about a baked px long still shows on the teal back panel at the knee's height, where the blended skin creases the gown under it; widening the space between the layers (OVER_CLEAR to 0.005 H) does not remove them, so they are left for the owner's eye on the 4× zoom.
Only the wizard's page and the manifest changed in its bake commit; every other atlas keeps its bytes;
`npm run bake -- --check` reports no changes.

| wizard sheet | pages | page px | RGBA | PNG bytes | frames | frame box |
|---|---|---|---|---|---|---|
| this re-bake (1.5x) | 1 | 2572 × 3220 | 33.13 MB | 4,892,434 | 512 | 222 × 192 |

+1.1 % RGBA against the 1.5x bake before (32.77 MB); crown 74 (was 75).

The contact sheets (idle, walk, run with the old, held and new keys side by side, attack, walk_attack and backpedal_attack old beside new, 8 facings) and an animated preview are in the session scratchpad `carry-final/wizard/`, with 4× zooms of the run's knee and waist frames (side views) and of its back views, old above new.

The owner on the dashes above (2026-11-12): first "可以" (acceptable as they are); then, after playing, "法師跑步時 膝蓋背後關節處 衣服綠色區塊會有黑點" (in the run, behind the knee joint, the green panel has black dots): they go after all (below). On the robe fix itself: "法師長袍修正 沒問題" (the knee, the waist and the green panel are fine).

## Re-built (2026-11-12, agent): the sceptre arm's lower pump, the sceptre upright, no dots on the back panel; waiting on the owner's contact sheet

Re-baked once (FS-JS7C8 R2; FS-HF0WW § Change: The guard measures a leg through the cloth R31; owner 2026-11-12: "只是要合理的位置 但跑步時為什麼手會擺到肩膀", "目前跑步時 武器擺動位置有點不自然 跑的時候可以高一點 有點過垂 武器可以往內側擺動一些", "法師跑步時 膝蓋背後關節處 衣服綠色區塊會有黑點"). Why her hand reached the shoulder: the shared fast run pumps every hand to chest height (0.70 H), just under this rig's shoulder (0.74 H). Now her sceptre arm pumps smaller about a centre drawn back, the hand peaking at 0.61 H, the lower chest; her tome arm keeps the full pump; the sceptre stands 23-38° off vertical (was 54-85°), the orb ahead of her face, at most about her chin (a sceptre that upright from a hand at the lower chest stands its orb over the shoulder; the owner asked for it higher); her hand comes 0.07 H in toward the midline at the front of the pump. The dots were the black gown through the teal panel: the panel was cut across its own arc (16 columns) over a gown of 32, and behind the knee the panel's vertices followed the skin's turn from one thigh to the other while the gown's coarser face cut straight across; the panel is now cut on the gown's columns (the gown at 64, the scapular's 10 on them). ID render of the run, all 8 facings at 1.5x: gown px inside the panel 4 over 64 frames, none in the back facings (was 254). Only the wizard's page and the manifest changed in its bake commit; `node tools/bake/bake.mjs --check` reports no changes.

| wizard sheet | pages | page px | RGBA | PNG bytes | frames | frame box |
|---|---|---|---|---|---|---|
| this re-bake (1.5x) | 1 | 2056 × 4000 | 32.90 MB | 4,897,780 | 512 | 222 × 192 |

−0.7 % RGBA against the bake before (33.13 MB); crown 74 as before. Old beside new (run, idle, walk, 8 facings), an animated preview, the run's back views at the knee at 4× and the sceptre at 4× are in the session scratchpad `wizard-run-staff/wizard/`.
