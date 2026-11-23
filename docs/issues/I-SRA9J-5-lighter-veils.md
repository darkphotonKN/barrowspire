---
id: I-SRA9J-5
status: open
implements: FS-SRA9J
blocked_by: []
labels: [ready-for-agent]
title: "FS-SRA9J slice 5: lighter veils, unexplored 0.6 and explored 0.35 (game-client)"
---
Implements FS-SRA9J §Change: Lighter fog and lit regions, §F-A (F1, F2)

**Lane: agent (AFK), game-client.** The visible change: the fog over unexplored and walked regions
is thinner, the three states still apart.

## What to Build

- `FOG.unexplored` from `veil(0.8)` to `veil(0.6)` and `FOG.explored` from `veil(0.55)` to
  `veil(0.35)`, in `render/world/fog.ts` `FOG`, the one place they live. The walls' tints follow
  their share as today; nothing else in the fog changes (`FOG.fade`, `FEATHER`, the head clearance,
  the partition).
- A test that holds the order: `FOG.void` (1) > unexplored > explored > 0, each a `FOG` constant.
- The doc comments on `FOG.unexplored` / `FOG.explored` cite the Change (owner-tuned values).

## Files (expected)

- `game-client/src/render/world/fog.ts` (the two constants and their comments)
- `game-client/src/render/world/fog.test.ts` (the order test; any expectation written against the
  old values)
- `game-client/src/scenes/BarrowspireScene.test.ts` only if an expectation there hard-codes 0.8 or
  0.55 rather than reading `FOG`

## Acceptance Criteria

- [ ] FS-SRA9J §Change: Lighter fog and lit regions, Acceptance Criteria "Veils" row.
- [ ] `FOG.fade` is still 320 and `FEATHER` unchanged; the feather and fade tests pass unchanged.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence` and `npx tsc --noEmit` green.

## Blocked By

None

## Spec Reference

FS-SRA9J §Change: Lighter fog and lit regions: F1, F2 (charter default D1, D4). User stories 1, 2, 13.

## TDD Approach

- RED: a `fog.test.ts` case that `FOG.unexplored.alpha` is 0.6 and `FOG.explored.alpha` 0.35, with
  void > unexplored > explored > 0.
- GREEN: the two constants.
