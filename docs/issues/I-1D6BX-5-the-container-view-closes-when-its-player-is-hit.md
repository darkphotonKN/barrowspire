---
id: I-1D6BX-5
status: done
implements: FS-1D6BX
blocked_by: []
labels: [ready-for-agent]
title: "FS-1D6BX slice 5: the container view closes when its player is hit (client, run only)"
---
Implements FS-1D6BX §Change: The container view closes when its player is hit

**Lane: game-client.** In a run, a state that has the local player's health lower than the state
before closes the open container view (coffer, satchel or bone heap). No notice, nothing sent;
E opens it again at once. Only health lost to a hit counts, and nothing else closes or changes.

## Files owned

- `game-client/src/scenes/BarrowspireScene.ts`: the own-health reading in `handleGameStateUpdate` (the hurt flash's record). **Hotspot: touch only that.**
- `game-client/src/scenes/BarrowspireScene.test.ts` (a new block)
- a small Phaser-free helper beside the scene for "this state cost health", with its test

## What to Build

1. One record of the local player's health from state to state, read by the hurt flash and by this rule (R19, E2).
2. Close the open view on a state that cost health; not when health fell no further than `max_health` did (R20, E3).
3. Judge it before the state's containers are read (E4); leave the reach, the open bar and the timed open alone (R24).
4. `FieldScene`, the hub and `game-server/` are untouched (R25).

## Acceptance Criteria

- [ ] With the view open, a state with the player's health lower closes it, for a chest, a sack and a drop pile; no notice is raised and nothing is sent.
- [ ] A state with the health unchanged (a parried strike), and one with it higher (a heal), leave the view open.
- [ ] After a hit closed it, E opens the view at once; the next state that costs health closes it again, and one that costs none leaves it open.
- [ ] The first state of a start, with the health below max health, leaves an open view open; so does the first state after the scene restarts with the health lower than the last state before it.
- [ ] A floor change with the health lower closes the view once; a view opened on the new floor stays open through a state with that same health.
- [ ] A state in which health and `max_health` fell by the same amount leaves the view open; one in which health fell by more closes it.
- [ ] With no view open, a state that costs health closes nothing: also when the hit kills the player, and when the state has the player escaped or carries no `current_player`.
- [ ] A hit during a timed open leaves the open bar and the pending reach as the state has them.
- [ ] A hit with the gear and bag overlay up leaves the overlay as it is.
- [ ] `FieldScene` is not changed.
- [ ] `npm test`, `npm run lint` and `npx tsc --noEmit` are green in game-client.

Out of slice: the section's live check (one browser, one run), the owner's.

## Blocked By

None.

## Spec Reference

FS-1D6BX §Change: The container view closes when its player is hit: Requirements 19–25, decisions L1–L5 and E1–E4, every Edge State.

## TDD Approach

- RED: the view open, a state with the health lower, through `handleGameStateUpdate`: expect the view closed.
- GREEN: the close on a state that cost health. Then RED/GREEN for the max-health guard; the other guards are pinned as tests that must stay green.

**Owner check, 2026-11-11.** Nick tested it on the local branch `play/floor1-fixes` and reported "寶箱被打關閉測試沒問題". One verdict for the whole check, not one per line, so the boxes above are left as written.
