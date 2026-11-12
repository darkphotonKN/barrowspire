---
id: I-JS7C8-5
status: open
implements: FS-JS7C8
blocked_by: [I-JS7C8-3]
labels: [ready-for-agent]
title: "FS-JS7C8 slice 5: run and backpedal keyed on the shared rig, the archer baked with them, the owner's contact-sheet approval (game-client)"
---
Implements FS-JS7C8 §A (R1–R3, R5), §B (R8, R10), §C (R21), §F (R36–R41), §Acceptance Criteria "Run and backpedal" (sheet, bake and approval boxes), "Attack slow" (last box); Tunes FS-HF0WW `WALK_ATTACK_CYCLES` (R11)

**Lane: agent, then HITL.** The agent keys, bakes and measures; the slice ends at the owner's
approval of the archer's contact sheet (ADR-0021 §5). No hand-drawn or hand-edited pixels.

## What to Build

1. In `tools/bake/page/characters/clips.js`, on the shared rig:
   - `runCycle(style)`: 8 frames, looping. Arms against legs, the chest turning against the hips
     with the stride, the pelvis rising and falling once per step, the head held steady, a flight
     frame in each step (both feet off the ground). A jog, not a sprint. Spring bones follow as in
     the walk. Per-class style hooks as the walk has (`style.run`).
   - `backpedalCycle(style)`: 8 frames, looping. The upper body held toward the facing, the feet
     stepping backward (toe first), a short stride.
   - Specs: `run` and `backpedal` (8 frames, looping, fps chosen so the paces land in R3 / R10).
   - A spec that carries `run` walks `walk_attack`'s legs over **one** walk cycle (FS-HF0WW
     `WALK_ATTACK_CYCLES` 2 → 1 for that spec; R21); `walk_attack` still lasts exactly as long as
     `attack`.
2. The archer's catalogue entry (`cast.js`) opts in, with any per-class style the archer needs for
   the run to read (garment, bow and quiver carry, arm swing); the other three keep today's specs.
   (Owner, 2026-11-12, "那先做弓箭手的": the archer is the first class baked, not the knight.)
3. Measure `RUN_PACE` and `BACKPEDAL_PACE` (world px per second at 1x: the planted foot's travel
   over a cycle at the authored fps, as `WALK_PACE` was) and put the values in
   `src/render/art/animationSelect.ts` with the note of how they were measured.
4. `npm run bake`; commit the archer's atlas pages and `manifest.json`. The contact sheet shows the
   archer's `run` and `backpedal` in 8 directions beside `walk` and `walk_attack`.
5. Record in the issue (or the FS's verification notes, appended): the archer's pages and their
   dimensions before and after, RGBA bytes before and after, growth in per cent, against R39's
   estimate (+38%). If the growth is well past it, stop and escalate before slices 6–8.
6. `game-client/docs/design-guideline.md` and `game-client/CONTEXT.md`: the playable classes' clip
   list names `run` and `backpedal` (R41).

## Acceptance Criteria

- [ ] Clip tests: the run has a flight frame per step, its arms swing opposite its legs, the head's height and roll stay within a small band; its pace is within 180–220; the backpedal's within 150–220.
- [ ] `char_archer_base` carries `run` and `backpedal` (8 frames, looping, 8 directions, scale 2, trimmed) and still `walk` and `walk_attack`; archer `walk_attack` legs over one cycle.
- [ ] The leg-clearance guard (FS-HF0WW §C) passes for the new clips.
- [ ] The archer's Shadow Shot hold still stands in idle turned to the held aim, never run or backpedal, while held.
- [ ] `RUN_PACE` / `BACKPEDAL_PACE` hold the measured values; at 200 px/s the archer's run plays at 0.9–1.1x.
- [ ] `npm run bake -- --check` is clean; the other three classes' atlases are byte-identical.
- [ ] Growth recorded (pages, dimensions, bytes, per cent).
- [ ] **HITL:** the owner approves the archer's contact sheet (run, backpedal, `walk_attack`). Not merged before.

## Blocked By

I-JS7C8-3 (a sheet with `run` is only played once the clip choice exists)

## Spec Reference

FS-JS7C8 §A R1–R3, R5, §B R8, R10, §C R21, §F R36–R41; Facts 1, 8, 9; user stories 1, 2, 9, 19–21.

## Files it expects to touch

- `game-client/tools/bake/page/characters/clips.js` (+ `clips.test.mjs`), `cast.js`
- `game-client/tools/bake/lib/contact.mjs` (only if the contact sheet needs the new clips laid out)
- `game-client/src/render/art/animationSelect.ts` (+ test: the measured paces)
- `game-client/public/art/archer-*.png`, `game-client/public/art/manifest.json`
- `game-client/docs/design-guideline.md`, `game-client/CONTEXT.md`

## Verification notes (2026-11-12, agent)

- Paces, measured on the archer's legs by `tools/bake/page/characters/pace.js` (the planted foot's
  slide under the body, averaged over the time a foot is down; it reads the walk at about 80
  against `WALK_PACE`'s 74): run 193.7 world px/s at 14 fps (`RUN_PACE` = 194, played at 1.03x at
  200 px/s); backpedal 165.4 at 18 fps, backward (`BACKPEDAL_PACE` = 165, 1.21x).
- `walk_attack` on the archer walks its legs over one walk cycle (`RUN_WALK_ATTACK_CYCLES`); the
  three other classes keep two.
- Archer atlas, before → after: one page, `archer-0` 2924 × 3844 → 3760 × 4008; RGBA 44,959,424 B
  (45.0 MB) → 60,280,320 B (60.3 MB), **+34.1%** (R39's estimate +38%); PNG 6,289,416 →
  8,466,924 B (+34.6%). Frames 336 → 464; the frame box (326 × 288) and anchor unchanged. No
  second page.
- Leg-clearance guard passes on the run and the backpedal (the run's worst 0.40 of the 0.5 px
  limit at 2x, frame 2).
- Every other atlas keeps its bytes (only `archer-0.png` and the archer's manifest entry change).
