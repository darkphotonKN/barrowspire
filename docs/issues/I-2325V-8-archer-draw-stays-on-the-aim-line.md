---
id: I-2325V-8
status: open
implements: FS-2325V
blocked_by: []
labels: [ready-for-agent]
title: "FS-2325V change slice 8: the archer's bow hand held forward on the aim line and the draw pulled straight back to the jaw, in every facing (game-client bake keys; baked in I-JS7C8-12)"
---
Implements FS-2325V §Change: The archer's draw stays on the aim line

**Lane: agent.** Bake keys and clip tests only; the archer's atlas is baked once in I-JS7C8-12,
which carries the owner's contact-sheet approval. No hand-drawn or hand-edited pixels.

**Pre-existing, not slice 5's.** The shot's keys (`ATTACKS.shot`), `BOW_STANCE`, `bowArm` and the
bow hook (`bowInHand`) are unchanged on `feat/run-class-run-face` against main; they date from
I-2325V-5 (2026-09-27) and were baked at 2x by FS-HF0WW. Main's archer draws the same way. The
owner saw it on the branch because the archer is now watched attacking on the move.

## What to Build

1. **Measure first.** A clip test (`clips.test.mjs`) poses the archer's rig through every drawn key
   of `shot` (`fx.ik` > 0, the bow hook run) and records, in model space: the bow hand's position
   against the chest and the aim line; the drawing hand against the arrow line and the jaw/ear on
   the drawing side; whether the drawing hand or forearm crosses the body's centre plane toward
   the bow side; the drawing elbow's height against the shoulder and its offset toward the back.
   Write today's numbers into this issue (they show the owner's "伸到左手破圖" as numbers).
2. **Re-key the draw** (owner: "應該是左手拿弓的位置太靠近左側"): bring the bow hand forward onto the
   aim line in front of the chest, not out to the left, with the bow arm still extended toward the
   aim (`BOW_STANCE` / `bowArm` and the shot's keys), so the drawing hand, which follows the
   bow's own line (`drawLen` × `ik`), pulls straight back to an anchor by the jaw or ear and never
   crosses the body or the bow arm; the drawing elbow about shoulder height and not behind the
   back, the loose (`ik` 1.3) included. Change `drawLen`, the pole or the loose's `ik` only if the
   measure shows the hand ending past the anchor.
3. **The delver archer only.** The Bone Archer shares `BOW_STANCE`, `bowArm` and the bow hook:
   scope the change (a per-style stance or a hook option) so its keys and sheet keep their bytes.
4. The test from step 1 then asserts the bands (starting values, set from the measure) on `shot`,
   `walk_attack` and `backpedal_attack` (once I-JS7C8-12 adds it; until then `shot` and
   `walk_attack`).

## Measured before the re-key (2026-11-12, agent)

`clips.test.mjs` "the archer's draw stays on the aim line" poses the archer's rig (1.96, its build)
through every key of `ATTACKS.shot` with the bow hook's solver (`draw.js` `solveDraw`, lifted out
of `cast.js` `bowInHand` unchanged so a test can run it) and measures in model space, in rig
heights H (the model faces +z, its left, the bow side, is +x). The anchor is a point by the jaw on
the drawing side, head frame (-0.06, 0.005, 0.02) H; the aim plane is the upright plane through it
along the facing; the centre plane the upright plane through the neck along the facing.

| key (`ik`) | bow hand off the aim plane | bow hand ahead of the chest | hand to anchor | hand past anchor | hand/forearm across the centre plane | elbow across | elbow over shoulder | elbow, chest frame z |
|---|---|---|---|---|---|---|---|---|
| 0 (0.1) | +0.181 | 0.409 | 0.299 | -0.207 | +0.057 | -0.001 | -0.041 | +0.031 |
| 1 (0.5) | +0.128 | 0.457 | 0.234 | -0.183 | +0.056 | +0.042 | +0.058 | -0.023 |
| 2 (1) | +0.128 | 0.457 | 0.155 | 0 | +0.079 | +0.079 | +0.083 | -0.146 |
| 3 (1.02) | +0.126 | 0.455 | 0.155 | +0.006 | +0.077 | +0.077 | +0.079 | -0.148 |
| 4 (1.3, loose) | +0.125 | 0.453 | 0.192 | +0.106 | +0.067 | -0.008 | +0.059 | -0.127 |
| 5 (none) | +0.168 | 0.433 | | | -0.122 | -0.122 | | |
| 6 (none) | +0.187 | 0.314 | | | -0.096 | -0.096 | | |

So the owner's "伸到左手破圖", as numbers: the bow hand sits 0.13 H left of the aim plane (it is
the bow arm, straight from the left shoulder along the facing), and the hook draws along the
bow's own line, which is the bow arm's: the full draw's hand ends behind the **left** shoulder,
0.155 H from the jaw, the hand and forearm 0.08 H across the centre plane onto the bow side, the
elbow on the bow side and 0.146 H behind the chest's centre (its back is 0.094 deep); the loose
carries the hand 0.106 H further back, behind the head ("過度伸到背後"). The elbow's height
(+0.08 over the shoulder) is not the fault.

## Acceptance Criteria

- [ ] Today's measured values recorded in this issue before the re-key.
- [ ] On every drawn key of the archer's `shot`: the bow hand ahead of the chest along the aim and
      near the aim line; the drawing hand on the arrow line, ending by the jaw or ear on the
      drawing side; neither drawing hand nor forearm across the body's centre plane; the elbow
      within the shoulder-height band and not behind the back.
- [ ] The same holds for every frame of the archer's `walk_attack`.
- [ ] The bow arm points along the facing at the draw; the string and the arrow still follow.
- [ ] The Bone Archer's poses are unchanged (its clip tests and FS-B4SG9 §E R26 tests unchanged
      and green); its atlas bytes are kept (checked at the bake in I-JS7C8-12).
- [ ] The leg-clearance guard and the frame box still pass for the archer's clips (dry run; no
      atlas committed here).
- [ ] `npx vitest run --maxWorkers=4 --minWorkers=1` green (the bake's `.test.mjs` files included).

## Blocked By

None (blocks I-JS7C8-12, which bakes the archer once with both changes).

## Spec Reference

FS-2325V §Change: The archer's draw stays on the aim line, Facts 1–5, Requirements 1–7,
Acceptance Criteria 1–3, Edge States.

## Files it expects to touch

- `game-client/tools/bake/page/characters/clips.js` (`BOW_STANCE`, `bowArm`, `ATTACKS.shot`;
  `boneShot` untouched)
- `game-client/tools/bake/page/characters/cast.js` (`bowInHand`, only if the measure needs it, and
  only for the delver archer)
- `game-client/tools/bake/page/characters/clips.test.mjs`
