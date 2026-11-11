---
id: I-JS7C8-6
status: open
implements: FS-JS7C8
blocked_by: [I-JS7C8-5]
labels: [ready-for-agent]
title: "FS-JS7C8 slice 6: the knight baked with run and backpedal, the owner's contact-sheet approval (game-client)"
---
Owner, 2026-11-12, "那先做弓箭手的": the archer is baked first (slice 5), the knight here.

Implements FS-JS7C8 §A (R1–R3), §B (R8, R10), §C (R21), §F (R36–R40); Tunes FS-HF0WW `WALK_ATTACK_CYCLES` (R11)

**Lane: agent, then HITL.** Ends at the owner's approval of the knight's contact sheet (ADR-0021 §5).
No hand-drawn or hand-edited pixels.

## What to Build

1. The knight's catalogue entry (`tools/bake/page/characters/cast.js`) opts in to `run` and
   `backpedal` from slice 5 (and so to `walk_attack` over one walk cycle), with any per-class
   style the knight needs for the run to read (garment, sword and shield carry, arm swing), keyed on the shared
   rig.
2. `npm run bake`; commit the knight's atlas pages and `manifest.json`.
3. Check the knight's measured paces against `RUN_PACE` / `BACKPEDAL_PACE`: if the class's style
   moves them out of R3 / R10, fix the keys, not the constants.
4. Record the growth: pages and dimensions before and after, RGBA bytes before and after, per cent.

## Acceptance Criteria

- [ ] `char_knight_base` carries `run` and `backpedal` (8 frames, looping, 8 directions, scale 2, trimmed), and still `walk` and `walk_attack` (legs over one cycle).
- [ ] The knight's run pace is within 180–220 and its backpedal within 150–220.
- [ ] The leg-clearance guard (FS-HF0WW §C) passes for the new clips.
- [ ] `npm run bake -- --check` is clean; no other class's atlas changes.
- [ ] Growth recorded (pages, dimensions, bytes, per cent).
- [ ] **HITL:** the owner approves the knight's contact sheet (run, backpedal, `walk_attack`). Not merged before.

## Blocked By

I-JS7C8-5 (the run and backpedal keys, the measured paces, the archer's approval)

## Spec Reference

FS-JS7C8 §A R1–R3, §B R8, R10, §C R21, §F R36–R40; Fact 9.

## Files it expects to touch

- `game-client/tools/bake/page/characters/cast.js` (+ `clips.js` only for a per-class style hook)
- `game-client/public/art/knight-*.png`, `game-client/public/art/manifest.json`
