---
id: I-JS7C8-8
status: open
implements: FS-JS7C8
blocked_by: [I-JS7C8-12]
labels: [ready-for-agent]
title: "FS-JS7C8 slice 8: the mercenary baked with run, backpedal_attack and the slowed walk_attack, the owner's contact-sheet approval (game-client)"
---
Implements FS-JS7C8 §A (R1–R3), §B (R8, R10), §C (R21), §F (R36–R40); Tunes FS-HF0WW `WALK_ATTACK_CYCLES` (R11)

*Reworked 2026-11-12 (owner change to FS-JS7C8): `backpedal_attack` instead of a standalone
`backpedal`, `walk_attack`'s legs over 0.75 walk cycles; blocked by the archer's re-bake
(I-JS7C8-12) instead of I-JS7C8-5. The file name keeps its old slug.*

**Lane: agent, then HITL.** Ends at the owner's approval of the mercenary's contact sheet (ADR-0021 §5).
No hand-drawn or hand-edited pixels.

## What to Build

1. The mercenary's catalogue entry (`tools/bake/page/characters/cast.js`) opts in to the running
   class's specs from I-JS7C8-12: `run`, `walk_attack` over 0.75 walk cycles and
   `backpedal_attack` over 0.625 backpedal cycles, no `backpedal`; with any per-class style the
   mercenary needs for the run and the backpedal legs to read (garment, weapon carry, arm swing:
   `style.run`, `style.backpedal`), keyed on the shared rig.
2. `npm run bake`; commit the mercenary's atlas pages and `manifest.json`. The contact sheet shows the
   mercenary's `walk`, `run`, `walk_attack`, `backpedal_attack` and `attack` in 8 directions.
3. Check the mercenary's measured paces: the run within 180–220 (R3), the backpedal legs within
   150–220, and both attack-on-the-move clips' leg paces at most 90 px/s (R10, R21): if the
   class's style moves them out, fix the keys, not the constants.
4. Record the growth: pages and dimensions before and after, RGBA bytes before and after, per cent,
   against R39's estimate.

## Acceptance Criteria

- [ ] `char_mercenary_base` carries `run` (8, looping) and `backpedal_attack` (14 frames at 24 fps,
      once), 8 directions, scale 2, trimmed, and still `walk` and `walk_attack` (legs over 0.75
      walk cycles); no `backpedal`.
- [ ] The mercenary's run pace is within 180–220, its backpedal legs' within 150–220, and its
      `walk_attack` and `backpedal_attack` leg paces at most 90 px/s.
- [ ] The leg-clearance guard (FS-HF0WW §C) passes for the new clips; none widens the frame box.
- [ ] The mercenary's `parry` is unchanged and still raises over the run as it did over the walk (the guard overrides the whole body); a swing inside the guard plays over it as today.
- [ ] `npm run bake -- --check` is clean; no other class's atlas changes.
- [ ] Growth recorded (pages, dimensions, bytes, per cent).
- [ ] **HITL:** the owner approves the mercenary's contact sheet (`run`, `walk_attack`,
      `backpedal_attack`). Not merged before.

## Blocked By

I-JS7C8-12 (the `backpedal_attack` clip, the slowed legs, the archer's approval)

## Spec Reference

FS-JS7C8 §A R1–R3, §B R8, R10, §C R21, §F R36–R40; Facts 9, 10.

## Files it expects to touch

- `game-client/tools/bake/page/characters/cast.js` (+ `clips.js` only for a per-class style hook)
- `game-client/public/art/mercenary-*.png`, `game-client/public/art/manifest.json`
- `game-client/src/render/art/manifest.test.ts` (the mercenary carries the clips)
