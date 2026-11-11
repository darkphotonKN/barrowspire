---
id: I-V8FT3-1
status: open
implements: FS-V8FT3
blocked_by: []
labels: [ready-for-agent]
title: "FS-V8FT3 slice 1: the bake's light and wall feet are defined once, and a wall run's shadow shape is planned from them (game-client)"
---
Implements FS-V8FT3 §C, §D

**Lane: agent (AFK).** Foundation: nothing is drawn yet. No art changes: the bake's numbers move to
one module at today's values, so `npm run bake -- --check` must still say "no changes" (about 2
minutes; installed Google Chrome on SwiftShader).

## Files owned

- `game-client/tools/bake/page/` one dependency-free module for the key light's direction, the
  catcher's opacity and colour, and the wall and post foot sizes (a new file beside
  `dimensions.js`, or `dimensions.js` itself)
- `game-client/tools/bake/page/baker.js` (`LIGHT_DIR`, the catcher: read the module)
- `game-client/tools/bake/page/models/{architecture,tower,building}.js` (the thickness constants
  only: read the module)
- `game-client/src/render/world/bake.ts`, `bake.test.ts`
- `game-client/src/render/world/wallShadows.ts`, `wallShadows.test.ts` (new)

## What to Build

- The light and the feet, once (R12, R13, R14): defined in the bake, read by the baker and the wall
  models, mirrored in `BAKE`, held equal by `bake.test.ts`.
- A pure planner (no Phaser) from `planWalls`' pieces and posts to shadow shapes in world px
  (R2, R11, R15-R17): one shape per stretch of equal height in a run, one per post, each the convex
  hull of the foot and the foot moved by the light's offset for its height. Buildings' two looks
  are I-V8FT3-3's.

## Acceptance Criteria

- [ ] The key light's direction, the catcher's opacity and colour, and the wall and post foot sizes
      are each defined once under `tools/bake/page/` in a dependency-free module; `baker.js` and the
      wall models read them; `bake.test.ts` holds `BAKE` equal to them.
- [ ] `npm run bake -- --check` passes with no art committed.
- [ ] For a wall of height h the cast offset is h / 2.83 tiles along world +x and world -y: 3.6
      gives 50.9 world px each way (81.4 screen px, due right), 1.1 gives 15.5.
- [ ] A run of n pieces of one height gives one shape, whatever n; a run of two heights gives one
      shape per stretch.
- [ ] A shape is the convex hull of the foot and the foot moved by the offset; the foot is the
      run's centreline between its ends, as thick as `BAKE` says for its material.
- [ ] Every post of `planWalls` gives one shape from its square foot and its own height.
- [ ] A wall 2.75 tiles long casts from a foot 2.75 tiles long.
- [ ] A dungeon floor's shapes come from `wallRuns` and `wallRule`: none from a piece outside its
      run's end posts.
- [ ] No source under `src/` holds 2.83, the shadow's 0.5 or a wall thickness as its own number
      outside `BAKE`.
- [ ] `npx vitest run --maxWorkers=4` and `npm run lint` in game-client pass.

## Blocked By

None. Blocks I-V8FT3-2 and I-V8FT3-4.

## Spec Reference

FS-V8FT3 §A R2; §C R11-R14; §D R15-R18; user stories 5, 6, 14, 17.

## TDD Approach

- RED: `bake.test.ts` expects `BAKE`'s light, shadow and feet to equal the bake module's;
  `wallShadows.test.ts` expects one hull per run of a three-piece back wall, offset 50.9 px.
- GREEN: the bake module and the mirror, then the planner.
