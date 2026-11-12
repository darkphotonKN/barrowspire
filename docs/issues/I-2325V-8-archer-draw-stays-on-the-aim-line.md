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
