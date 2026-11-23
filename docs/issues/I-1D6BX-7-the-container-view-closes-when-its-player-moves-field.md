---
id: I-1D6BX-7
status: done
implements: FS-1D6BX
blocked_by: [I-1D6BX-6]
labels: [ready-for-agent]
title: "FS-1D6BX slice 7: the container view closes when its player moves (field worlds)"
---
Implements FS-1D6BX §Change: The container view closes when its player moves

**Lane: game-client.** In a field world, the satchel `FieldPiles` drives closes on the same rule
as the run's: a state with the own position more than 4 px from where the player stood when the
view opened. A drop pile's view, a Forest clearing chest's and a sack's. E opens it again at once.

## Files owned

- `game-client/src/scenes/fieldPiles.ts`: the baseline at its two opens (`interact`'s pile open,
  `followReach`'s chest open) and the judgement in `follow`, which already runs once per state on
  `current_player.position`
- `game-client/src/scenes/fieldPiles.test.ts` (a new block)
- `game-client/src/scenes/FieldScene.ts` only if `follow`'s wiring must change (expected: not)

## What to Build

1. Reuse slice 6's Phaser-free rule; no second copy of it (R32).
2. The baseline: the press position for a pile; the state's position for a chest or sack opened
   on the state that shows it open (R27, M2). A new one at each open (R30).
3. In `follow`, a satchel open before this state closes past 4 px, beside the `PILE_REACH` close
   (R26, R29). The reach window, the restock close and the reserved-pile words are untouched (R31).

## Acceptance Criteria

- [ ] A drop pile's view, opened at the press, closes on a state 5 px from the press position and stays on one 4 px from it.
- [ ] A chest's or sack's view, opened on the state that shows it open, takes that state's position; a later state more than 4 px from it closes it, and a `PILE_REACH` or restock close behaves as before.
- [ ] After a move closed it, E opens the view again at once, with a new baseline.
- [ ] A chest reached for and not yet open is given up only by today's rules (the window, `PILE_REACH`).
- [ ] `game-server/` is not changed.
- [ ] `npm test`, `npm run lint` and `npx tsc --noEmit` are green in game-client.

## Blocked By

I-1D6BX-6 (the shared rule).

## Spec Reference

FS-1D6BX §Change: The container view closes when its player moves: Requirements 26–31, R32's
field half, decisions A3, M2–M4, the field's Acceptance Criteria and Edge States.

## TDD Approach

- RED: `FieldPiles` with a pile's satchel open at a press position, `follow` 5 px off: expect
  `close`. GREEN: the baseline at the open and the check in `follow`.
- RED/GREEN for the chest opened in `followReach` taking that state's position.
