---
id: I-KSD6K-4
status: done
implements: FS-KSD6K
blocked_by: [I-KSD6K-1, I-KSD6K-3]
labels: [ready-for-agent]
title: "FS-KSD6K slice 4: the client frames the roomier Forest at 3120 x 2000 (game-client)"
---
Implements FS-KSD6K §C (Requirement 17)

**Author: agent.** Client only, from the worktree; start no backend.

## What to Build

The client's idea of the Forest matches the server's new size:

1. `FIELD_SIZE.forlorn_forest` in `scenes/FieldScene.ts` becomes `{ width: 3120, height: 2000 }`
   (comment cites FS-KSD6K R1), so the camera bounds cover the whole Forest.
2. Regenerate `render/world/forest.fixture.ts` (`FOREST_SIZE`, `FOREST_WALLS`, and anything else
   it copies) from the new golden `testdata/forest-20261029.golden` of I-KSD6K-1, so its header
   claim stays true.
3. Client tests that use 2 080 x 1 360 *as the Forest* (`fieldLook.test.ts`,
   `fieldDressing.test.ts`, `treeStands.test.ts`, `forestDressing.test.ts`) move to the new size
   where they mean the Forest; leave tests that use the numbers as arbitrary rects.
4. Scale `FOREST_LOOK.verges.count` (56) with the map so the trails keep today's verge density
   (starting ~120); check `forestDressing`'s candidate limit still lets that many place.

## Acceptance Criteria

- [x] `FIELD_SIZE.forlorn_forest` is 3120 x 2000, equal to the server's `constants.ForestMapWidth/Height`.
- [x] `forest.fixture.ts` matches the regenerated golden for seed 20261029.
- [x] Forest-sized client tests use the new size and pass.
- [x] The verge count is scaled and the forest dressing tests pass with it.
- [x] `npm test`, lint and `lint:fence`: no new failures versus the branch point.

## Files expected to touch

- `game-client/src/scenes/FieldScene.ts`
- `game-client/src/render/world/forest.fixture.ts`
- `game-client/src/render/world/fieldLook.ts` (verge count), `fieldLook.test.ts`
- `game-client/src/render/world/fieldDressing.test.ts`, `treeStands.test.ts`, `forestDressing.test.ts`, `forestDressing.ts` (only if the candidate limit needs raising)

## Blocked By

- I-KSD6K-1: the new size and the regenerated golden the fixture is copied from.
- I-KSD6K-3: both slices edit `FieldScene.ts` and `fieldLook.ts`; this one lands after to avoid conflicts.

## Spec Reference

FS-KSD6K §C R17; Edge States "Mixed versions while rolling out"; User Stories 16, 23; Acceptance
Criteria (client) 4; Decision log 12.

## TDD Approach

- RED: a test that the Forest's client size equals 3120 x 2000 (and the fixture's `FOREST_SIZE` matches).
- GREEN: `FIELD_SIZE`, the regenerated fixture, the scaled verge count.
