---
id: I-7P736-2
status: open
implements: FS-7P736
blocked_by: [I-7P736-1]
labels: [blocked]
title: FS-7P736 slice 2: Space rolls, predicted, with a cooldown pip on the HUD
---
Implements FS-7P736 §B (R13, R14, R16, R17)

## What to Build
game-client: the wire fields in `src/types/gameState.ts` and the `roll` action in
`src/assets/types/client.ts`; `RUN_ACTIONS.roll` (Space, "Space"); the press sends the held
direction else the facing, guarded per R13; the predicted roll on the local body with the same
wall sweep as walking prediction, reconciled as walking is; the roll pip in the UI scene fed by
the run HUD message, swept from `roll_cooldown`; the controls panel row.

## Acceptance Criteria
- [ ] FS-7P736's game-client criteria for input, prediction, the pip and the controls panel.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

## Blocked By
I-7P736-1 (and, through it, the pace branch).

## Spec Reference
FS-7P736 §B R13, R14, R16, R17.
