---
id: I-JS7C8-3
status: done
implements: FS-JS7C8
blocked_by: []
superseded_by: [I-JS7C8-11]
labels: [ready-for-agent]
title: "PARTLY SUPERSEDED (2026-11-12, by I-JS7C8-11) FS-JS7C8 slice 3: the local character faces the pointer, and a moving class picks run or backpedal when its sheet has them (game-client)"
---
Implements FS-JS7C8 §A (R4, R5, R6, R7), §B (R9, R11, R13), §D (R22–R26), §Acceptance Criteria "Run and backpedal" (choice boxes), "Facing" (local boxes)

> **Partly superseded 2026-11-12.** The owner's change to FS-JS7C8: the run stands (R4–R7), but
> the pointer facing (§D R23, R25, R26) and the standalone backpedal choice (old R9, R11) go;
> facing follows movement and the backward step plays only while attacking. **I-JS7C8-11** removes
> the pointer facing and reworks the clip choice. Kept `done` as the record of what was built.

**Lane: agent.** game-client only. Nothing is sent yet (slice 4). Until a class is baked with
`run` (slice 5), every class walks as today, so the visible change of this slice is the local
character turning to the pointer.

## What to Build

1. `selectAnimation` (`src/render/art/animationSelect.ts`) learns a **look** facing (the pointer's
   for the local player, the wire's for others in slice 4) and which of `run` / `backpedal` the
   sheet carries:
   - moving, sheet has `run`: angle between the look direction and the drawn velocity ≤ 90° →
     `run` at `speed / RUN_PACE`, turned to the look; > 90° → `backpedal` at
     `speed / BACKPEDAL_PACE` turned to the look, or, with no `backpedal`, `run` turned to the
     movement (R11). Caps as the walk's.
   - moving, no `run`: `walk` as today.
   - idle and the merc's guard turn to the look; attacks, `walk_attack`, death and the Shadow Shot
     hold keep today's facing rules (R24).
   - no look given: today's behaviour exactly (folk, monsters, menu figures).
   `RUN_PACE` and `BACKPEDAL_PACE` are named constants set to 200 here (inert until a sheet carries
   the clips); slice 5 replaces them with the bake's measured values.
2. `CharacterAnimator` / `CharacterMotion` (`src/render/art/character.ts`) take the look, know
   whether the sheet carries `run` and `backpedal`, and carry the frame index across a
   `run` ↔ `backpedal` swap (R13), as a looping clip's turn does.
3. The local player in `BarrowspireScene`, `FieldScene` (and `fieldCombat.ts`) and `HubScene`:
   each frame, the pointer through `screenToWorld` minus the character's world position, snapped by
   `facingFrom`; off the canvas, or before the pointer first moves, the last facing stands (R26).
4. Type the new clip names (`CharacterAnimation` gains `run`, `backpedal`).

## Acceptance Criteria

- [x] Standing, the local character turns to the pointer's 8-way world direction in the town, a field and a run. *(pointerFacing.test.ts, the facing tests in character.test.ts, and one wiring test each in HubScene/FieldScene/BarrowspireScene.test.ts; seen in a browser at I-JS7C8-9)*
- [x] With a test sheet carrying `run` and `backpedal`: ≤ 90° plays `run`, > 90° plays `backpedal`, exactly 90° plays `run`, each turned to the look; with `run` only, > 90° plays `run` turned to the movement.
- [x] Without `run`, a moving class walks at `speed / WALK_PACE` as today.
- [x] A `run` ↔ `backpedal` swap keeps the frame index.
- [x] Attacks and `walk_attack` still face their aim; death keeps its facing; the Shadow Shot hold turns to the held aim.
- [x] Pointer off the canvas: the facing does not change.
- [x] Hub folk, monsters and the menu figures choose exactly as before (existing tests unchanged and green).
- [x] `npx vitest run --maxWorkers=4 --minWorkers=1`, `tsc` and the lint are green.

## Blocked By

None

## Spec Reference

FS-JS7C8 §A R4–R7, §B R9, R11, R13, §D R22–R26; Edge States "Pointer at the 90° line",
"A class re-baked before the others"; user stories 3–6, 16, 24.

## Files it expects to touch

- `game-client/src/render/art/animationSelect.ts` (+ `.test.ts`)
- `game-client/src/render/art/character.ts` (+ `.test.ts`)
- `game-client/src/scenes/BarrowspireScene.ts`, `FieldScene.ts`, `fieldCombat.ts`, `HubScene.ts`
- `game-client/src/render/iso/facing.ts` only if a helper belongs there

## TDD Approach

- RED: `selectAnimation` with a look `n`, velocity south at 200 px/s, a sheet with `run` and
  `backpedal` → `backpedal` facing `n`.
- GREEN: the look and the angle rule.
