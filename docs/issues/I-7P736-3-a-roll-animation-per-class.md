---
id: I-7P736-3
status: done
implements: FS-7P736
blocked_by: [I-7P736-2]
labels: [ready]
title: FS-7P736 slice 3: a roll animation per class, drawn in code until baked
---
Implements FS-7P736 §B (R15)

## What to Build
game-client: a rolling delver (self from the prediction, others from `other_players[].roll`) is
drawn rolling. First the in-code tumble from the walk sheet (squash, tumble, a dust scuff), so the
feature never waits on art; then a `roll` clip per class baked from each class's rig in
`tools/bake` (warrior shoulder roll, mage robe tumble, archer tuck, merc low roll), used when the
manifest has it. Art never blocks: the bake may land after the code.

## Acceptance Criteria
- [x] FS-7P736's game-client criterion for drawing a roll, with and without a baked clip.
- [x] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green; bake `--check`
      clean if the clips were baked.

## Blocked By
I-7P736-2

## Spec Reference
FS-7P736 §B R15.
