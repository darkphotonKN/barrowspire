---
id: I-2325V-9
status: open
implements: FS-2325V
blocked_by: [I-2325V-8]
labels: [ready-for-agent]
title: "FS-2325V change slice 9: the Bone Archer takes the archer's new draw (the bow hand on the aim line, the draw straight back to the jaw) on its own rig and timing, re-baked alone (game-client bake keys, its creatures atlas)"
---
Implements FS-2325V §Change: The archer's draw stays on the aim line

**Lane: agent, then HITL.** Bake keys, clip tests and the Bone Archer's re-bake; no hand-drawn or
hand-edited pixels. The owner approves the contact sheet (ADR-0021 §5, FS-B4SG9 §E R29).

**The owner's word (2026-11-12),** after approving the delver archer's new draw (I-2325V-8,
baked in I-JS7C8-12): "拉弓姿勢可以用在怪物身上" (the bow-draw pose can be used on the monster
too). FS-2325V R7 now applies the change to the Bone Archer (FS-B4SG9).

## What to Build

1. **Measure first.** The clip test of I-2325V-8 ("the archer's draw stays on the aim line") poses
   the Bone Archer's rig (cast.js `skeleton`: 1.9, hunched, its own proportions and rest angles)
   through every key of `ATTACKS.boneShot`, with the bow hook's solver (`draw.js` `solveDraw`),
   and runs the same bands, the rig turned to each of the 8 facings as the bake turns it. Today's
   numbers go in this issue.
2. **Re-key the Bone Archer's shot onto the new draw.** Its keys stand in the delver's
   `AIM_STANCE` with the bow arm on the aim line, the wrist turning the bow along the facing, the
   drawing elbow's pole (`fx.pole`) and the loose's `ik` 1.12, each angle set on its own rig where
   its proportions need it. It keeps its own: the crouch (`hunch` and the bent knees), the jaw, the
   7 keys at 12 fps over the 0.6 s wind-up (nothing nocked on key 0, nocked on key 1, the pull
   growing to the full draw and held, the loose on the last key) and its idle, walk and death.
   `BOW_STANCE` and `bowArm`, unused once neither shot stands in them, go.
3. **Bands per rig.** "Not behind the back" is the rig's own back (its chest's half depth,
   0.094 × `torsoD`); "on the arrow line" is the rig's own grip offset off the hand's axis plus a
   margin (the hook's two-bone solve lands the hand's axis on the line, and the grip sits off it:
   0.008 H on the delver, 0.018 H on the skeleton, whose arm chain hangs 0.01 H behind the
   model's centre).
4. **Re-bake** with the bake tool only: the Bone Archer's `creatures` atlas and the manifest
   change; every other atlas keeps its bytes, the delver archer's included. Measure its VRAM
   before and after.
5. **Contact sheet** for the owner: the Bone Archer's old `attack` beside the new, 8 facings, at
   2× game scale, with its `idle` and `walk`, and an animated preview.

## Measured before the re-key (2026-11-12, agent)

The Bone Archer's rig (1.9, hunched, `torsoD` 0.82: its back 0.077 deep), every key of
`ATTACKS.boneShot` over `BOW_STANCE` and its crouch, measured as I-2325V-8 measures the delver
(model space, rig heights H; the anchor by the jaw on the drawing side, head frame
(-0.06, 0.005, 0.02) H). The pose is turned to each of the 8 facings as the bake turns it; every
facing gives the same numbers, since one pose is baked to all 8.

| key (`ik`) | bow hand off the aim plane | bow hand ahead of the chest | arrow across the facing | hand off the arrow line | hand to anchor | hand past anchor | hand/forearm across | elbow over shoulder | elbow, chest frame z |
|---|---|---|---|---|---|---|---|---|---|
| 0 (none, raise) | +0.227 | 0.299 | | | | | -0.150 | | |
| 1 (0.1, nock) | +0.163 | 0.451 | +0.125 | 0.039 | 0.287 | -0.224 | +0.045 | -0.024 | +0.041 |
| 2 (0.4) | +0.109 | 0.462 | -0.024 | 0.018 | 0.240 | -0.204 | +0.042 | +0.050 | -0.015 |
| 3 (0.75) | +0.109 | 0.462 | -0.024 | 0.014 | 0.167 | -0.070 | +0.096 | +0.078 | -0.129 |
| 4 (1) | +0.108 | 0.459 | -0.022 | 0.015 | 0.165 | +0.015 | +0.090 | +0.057 | -0.169 |
| 5 (1.03) | +0.107 | 0.457 | -0.021 | 0.015 | 0.168 | +0.024 | +0.084 | +0.052 | -0.170 |
| 6 (1.3, loose) | +0.108 | 0.460 | -0.023 | 0.013 | 0.215 | +0.126 | +0.071 | +0.045 | -0.126 |

So the Bone Archer has the delver's fault: the bow hand 0.11 H left of the aim plane (0.23 as it
comes up), the full draw ending 0.165 H from the jaw, the drawing hand and forearm up to 0.096 H
across the centre plane onto the bow side, the elbow 0.17 H behind the chest's centre (past its
0.077 back), the loose 0.126 H past the anchor; on the nock the arrow leans 0.125 off the facing.

## Acceptance Criteria

- [ ] Today's measured values recorded in this issue before the re-key.
- [ ] On every key of the Bone Archer's shot, its rig turned to each of the 8 facings: the bow
      hand ahead of the chest along the aim and near the aim line; the drawing hand on the arrow
      line (within its grip offset), ending by the jaw at the full draw; neither drawing hand nor
      forearm across the centre plane; the elbow within the shoulder-height band and not behind
      its back; the loose no further than the band past the anchor.
- [ ] Its shot keeps FS-B4SG9 §E R26 (its clip tests unchanged and green): 7 keys, 0.6 s within a
      frame, nothing nocked on key 0, nocked before it draws, the pull growing to the full draw
      and held, the loose on the last key; the crouch and the jaw kept.
- [ ] The delver archer's keys and atlas unchanged (its tests green; its atlas bytes kept).
- [ ] `BOW_STANCE` and `bowArm` removed if unused.
- [ ] Re-baked with the bake tool: only the Bone Archer's `creatures` atlas and the manifest
      change; the leg-clearance guard and the frame box pass; `node tools/bake/bake.mjs --check`
      reports no changes after the last commit.
- [ ] The Bone Archer's VRAM before and after recorded here.
- [ ] `npx vitest run --maxWorkers=4 --minWorkers=1` shows no failures beyond the known resident-page
      ones (the delver archer on two pages); `npx tsc --noEmit -p .` and `npm run lint` clean.
- [ ] **(HITL)** The owner approves the Bone Archer's contact sheet: its old `attack` beside the
      new in the 8 facings, with `idle` and `walk` unchanged.

## Blocked By

I-2325V-8 (the delver's new draw, whose keys and test this slice reuses).

## Spec Reference

FS-2325V §Change: The archer's draw stays on the aim line: Fact 4, Requirements 1–5, 7 and 9,
Acceptance Criteria 6–8, Edge States (the grip offset, the frame).

## Files it expects to touch

- `game-client/tools/bake/page/characters/clips.js` (`ATTACKS.boneShot`, `BOW_STANCE`, `bowArm`,
  `AIM_STANCE`)
- `game-client/tools/bake/page/characters/clips.test.mjs`
- `game-client/public/art/creatures-*.png`, `game-client/public/art/manifest.json` (the bake)
