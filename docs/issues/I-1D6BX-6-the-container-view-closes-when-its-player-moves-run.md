---
id: I-1D6BX-6
status: done
implements: FS-1D6BX
blocked_by: []
labels: [ready-for-agent]
title: "FS-1D6BX slice 6: the container view closes when its player moves (the shared rule, and the run)"
---
Implements FS-1D6BX §Change: The container view closes when its player moves

**Lane: game-client.** In a run, a state that has the local player's own position more than 4 px
from where they stood when the view opened closes the open container view (coffer, satchel or
bone heap). No notice, nothing sent; E opens it again at once with a new baseline. This slice
brings the Phaser-free rule the field reuses in slice 7.

## Files owned

- a small Phaser-free helper beside the scenes for "the view's baseline, and whether this
  position moved past it" (e.g. `game-client/src/scenes/viewMove.ts`), with its test
- `game-client/src/scenes/BarrowspireScene.ts`: the baseline at the two opens (`toggleChest`'s
  at-once open, `updateContainers`' reach open) and the per-state judgement in
  `handleGameStateUpdate`. **Hotspot: touch only those.**
- `game-client/src/scenes/BarrowspireScene.test.ts` (a new block)

## What to Build

1. The rule: a baseline taken at an open, and "more than 4 px, straight line, from it" (R26, R29,
   A1, M3). Read from `current_player.position`, never the drawn, eased `playerPos` (M1).
2. The baseline at each open: the last state's own position for E on an already-open container;
   the opening state's position for a reach (R27, M2). No position yet: the next state's (M4).
3. On each state, a view open before it closes past 4 px, whatever moved the body (R26, R28). A
   state with no own position judges nothing (M4).
4. The 60 px close, the hit close, the reach, the open bar and the gear overlay are untouched
   (R31). `game-server/` is untouched (R33).

## Acceptance Criteria

- [ ] With the view open on a chest, a sack and a drop pile, a state with the own position 5 px from the baseline closes it; no notice is raised and nothing is sent.
- [ ] A state exactly 4 px from the baseline leaves the view open; states 2 px apart in one direction close it on the first past 4 px.
- [ ] A view E opens on an already-open container takes the position in the state held at the press; a view a reach's state opens takes that state's position and stays open on it, also when that position is more than 4 px from the one held at the press.
- [ ] A state that places the body at once (a Blink) and states of a charge close the view.
- [ ] The drawn body still easing toward the state's position, with no new state, leaves the view open.
- [ ] After a move closed it, E opens the view at once; a state at the same position leaves it open, and the next state more than 4 px from that position closes it.
- [ ] A state with no `current_player` (escaped) closes nothing and keeps the baseline.
- [ ] With the gear and bag overlay up, a move closes the view and leaves the overlay as it is.
- [ ] With no view open, a move during a pending reach or a timed open leaves the reach and the open bar to FS-MQYEX R26 exactly as before.
- [ ] The 60 px close and the hit close keep their tests green.
- [ ] `game-server/` is not changed.
- [ ] `npm test`, `npm run lint` and `npx tsc --noEmit` are green in game-client.

Out of slice: the field (slice 7) and the live check (slice 8, the owner's).

## Blocked By

None.

## Spec Reference

FS-1D6BX §Change: The container view closes when its player moves: Requirements 26–31 and 33,
R32's run half, decisions A1–A5 and M1–M4, the run's Acceptance Criteria and Edge States.

## TDD Approach

- RED: the helper, a baseline and a position 5 px off: moved; 4 px off: not.
- RED: the view open, a state with the own position 5 px on, through `handleGameStateUpdate`:
  expect the view closed. GREEN: the baseline at the open and the per-state close. Then RED/GREEN
  for the reach's baseline (the opening state's position); the other guards are pinned as tests
  that must stay green.
