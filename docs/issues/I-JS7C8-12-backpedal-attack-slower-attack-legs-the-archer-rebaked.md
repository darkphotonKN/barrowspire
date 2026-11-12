---
id: I-JS7C8-12
status: open
implements: FS-JS7C8
blocked_by: [I-2325V-8]
labels: [ready-for-agent]
title: "FS-JS7C8 slice 12: backpedal_attack composed, the standalone backpedal dropped, the attack legs slowed, the archer re-baked once with FS-2325V's draw change, the owner's contact-sheet approval (game-client)"
---
Implements FS-JS7C8 §B (R8, R10), §C (R21), §F (R36–R41, R48), §G (R43), §Acceptance Criteria "Run and the backward step" (sheet, bake and approval boxes); Tunes FS-HF0WW `WALK_ATTACK_CYCLES` (R11); bakes FS-2325V §Change: The archer's draw stays on the aim line (I-2325V-8)

**Lane: agent, then HITL.** The agent composes, measures and bakes; the slice ends at the owner's
approval of the archer's contact sheet (ADR-0021 §5), carried over from I-JS7C8-5. No hand-drawn
or hand-edited pixels. The archer is baked **once** here, with this FS's clips and FS-2325V's draw
change together.

## What to Build

1. In `tools/bake/page/characters/clips.js`:
   - `backpedalAttackClip(style, spec, attackSpec)`: the attack from the waist up over the
     backpedal legs (`backpedalCycle`) from the waist down, composed exactly as `walkAttackClip`
     composes the walk (`layerPoses`, each attack key held two frames), lasting exactly as long as
     the attack (throws otherwise); its legs walk `spec.cycles` backpedal cycles across it.
   - A running sheet's specs: `run` (as baked in slice 5), `walk_attack` with `cycles` 0.75
     (`RUN_WALK_ATTACK_CYCLES` 1 → 0.75, R21), and `backpedal_attack` (14 frames at 24 fps, once,
     `boxed`, `cycles` 0.625, R10). **No `backpedal` spec** on any class sheet: the
     `backpedalCycle` keys and their `style.backpedal` hooks stay as `backpedal_attack`'s legs and
     for pace.js. The leg cycle's fps (18) stays as the reference the pace is measured at.
   - `clipsFor` makes `backpedal_attack`; the cloth on it walks as on `walk_attack` and calms as in
     the attack.
2. Measure, don't guess: the backpedal legs' pace by pace.js stays within 150–220; derive each
   attack-on-the-move clip's leg pace (leg pace × cycles × cycle length / swing length) and test
   it at most 90 px/s (0.45 × 200). Record the values (walk_attack about 76 px/s by `WALK_PACE`,
   82 by pace.js's walk; backpedal_attack about 79). If 0.75 or 0.625 does not key cleanly (a leg
   pose the clearance guard or the frame box refuses), take the nearest whole-key count under 90
   px/s that does, and say which.
3. The archer's catalogue entry (`cast.js`) keeps `run`, drops `backpedal`, gains
   `backpedal_attack`; the other three keep today's specs.
4. With I-2325V-8's draw in: `npm run bake`; commit the archer's atlas pages and `manifest.json`.
   The contact sheet shows, in 8 directions at game scale: `walk`, `run`, `walk_attack`,
   `backpedal_attack`, and main's archer `attack` beside the new one (R37, R48). If
   `tools/bake/lib/contact.mjs` cannot lay out main's attack, the bake writes the comparison from
   main's committed `archer-0.png` and manifest entry beside the new sheet.
5. Record (here, as I-JS7C8-5 did): pages and dimensions before (main, and slice 5) and after,
   RGBA bytes, growth in per cent against R39's estimate (+47% against main). Growth well past it:
   stop and escalate before I-JS7C8-6..8.
6. `game-client/docs/design-guideline.md` (the class clip list) and the contact-sheet notes in
   `contact.mjs`: `run`, `walk_attack`'s legs and `backpedal_attack`, no `backpedal` (R41, the clip
   half).

## Acceptance Criteria

- [ ] `char_archer_base` carries `run` (8, looping), `walk_attack` and `backpedal_attack` (14 frames
      at 24 fps, once), 8 directions, scale 2, trimmed, and still `walk`; no `backpedal`.
- [ ] Clip tests: `backpedal_attack` and `walk_attack` last exactly as long as `attack`; their legs'
      paces are at most 90 px/s; the backpedal legs' pace is within 150–220; the run's tests from
      slice 5 still pass.
- [ ] The leg-clearance guard (FS-HF0WW §C) passes for `backpedal_attack` and the slowed
      `walk_attack`; neither widens the frame box.
- [ ] I-2325V-8's draw test passes on the baked `attack`, `walk_attack` and `backpedal_attack`.
- [ ] `npm run bake -- --check` is clean; every other atlas, the Bone Archer's included, keeps its
      bytes.
- [ ] Growth recorded (pages, dimensions, bytes, per cent) against main and against slice 5.
- [ ] **HITL:** the owner approves the archer's contact sheet: `run`, `walk_attack`,
      `backpedal_attack`, and the old `attack` beside the new. Not merged before.

## Blocked By

I-2325V-8 (the archer's draw re-keyed, so the archer is baked once with both changes).

## Spec Reference

FS-JS7C8 §B R8, R10, §C R21, §F R36–R41, R48, §G R43; Facts 8–11; Edge State "Repeated swings";
user stories 5, 9, 19–21, 26. FS-2325V §Change: The archer's draw stays on the aim line R8.

## Files it expects to touch

- `game-client/tools/bake/page/characters/clips.js` (+ `clips.test.mjs`), `cast.js`
- `game-client/tools/bake/page/characters/pace.js` (only if the derived leg pace needs a helper)
- `game-client/tools/bake/lib/contact.mjs` (the old-beside-new attack, the clip notes)
- `game-client/tools/bake/page/main.js` (only if the cloth settings name `backpedal`)
- `game-client/public/art/archer-*.png`, `game-client/public/art/manifest.json`
- `game-client/src/render/art/manifest.test.ts` (the archer carries `backpedal_attack`, not `backpedal`)
- `game-client/docs/design-guideline.md`

## TDD Approach

- RED: `RUNNING_CLASS_ANIMATIONS` has `backpedal_attack` and no `backpedal`; `backpedalAttackClip`
  lasts the attack's 0.583 s and its legs step backward; the derived leg paces are at most 90 px/s
  (fails at today's one walk cycle, about 101).
- GREEN: the clip, the specs, the cycle counts; then bake.

## Bake record (2026-11-12, agent): stopped at the VRAM gate, atlas not committed

| archer sheet | pages | page px | RGBA | PNG bytes | frames | frame box |
|---|---|---|---|---|---|---|
| main | 1 | 2924 × 3844 | 44.96 MB | 6,289,416 | 336 | 326 × 288 |
| slice 5 (run + backpedal) | 1 | 3760 × 4008 | 60.28 MB | 8,466,924 | 464 | 326 × 288 |
| this bake | 2 | 4088 × 4088 + 4088 × 1060 | 84.18 MB | 7,264,452 + 2,212,006 | 512 | 332 × 300 |

+87.2% RGBA against main (R39 estimated +47%; the coordinator's stop line was +55%), +39.6% against
slice 5. The trimmed frames alone hold 67.67 MB (+58.7% against main's 42.64 MB): the 176 added
frames cost about 0.33% each (attack-on-the-move frames are the widest), not R39's 0.27%, and the
sheet no longer fits one 4096 page, so the second page adds the rest. The second page also makes
the client's resident page list one longer (`sceneArt.test.ts`, `evict.test.ts`, the scene
art-loading tests: 33 failures against the 17 resident pages they name). The atlas, manifest and
the slice's code are left uncommitted in the worktree for the coordinator's call.

Leg paces (pace.js on the archer's rig): walk_attack 0.75 walk cycles, about 76 px/s by WALK_PACE
(82 by pace.js's walk at 79.7); backpedal_attack 1.25 cycles of the re-keyed backpedal legs (69 px/s
at 18 fps, 30.7 px a cycle), about 66 px/s. The backpedal legs were re-keyed on the owner's word
(2026-11-12, "後退像是在走路沒有後退的感覺"): see the clips.js `BACK_STEP` note; their shorter
steps take 1.25 cycles rather than R10's 0.625 to stay near the ground's 90 px/s.
