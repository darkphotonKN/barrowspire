---
id: I-MQYEX-4
status: done
implements: FS-MQYEX
blocked_by: []
labels: [ready-for-agent]
title: "FS-MQYEX slice 4: the open bar fills over the container while the player's timed open runs (client)"
---
Implements FS-MQYEX §Requirements 21–25

**Lane: game-client.** The run scene reads `current_player.timed_open` and draws the open bar
over the container it names, filled to `elapsed / duration`. The bar is gone when the state
carries no timed open. It never opens anything: the view still opens only on the state that
shows the container open.

## Files owned

- `game-client/src/types/gameState.ts` (`PlayerState` gains optional `timed_open: { entity_id, elapsed, duration }`)
- `game-client/src/ui/openBar.ts` (new, Phaser-free: the bar's rectangle over a container, the fill fraction and its advance between states, drawn through `countdownBar.ts`'s `drawCountdownBar`) and `openBar.test.ts`
- `game-client/src/scenes/BarrowspireScene.ts`: where the state is taken in (`updateContainers` neighbour) and the per-frame update. **Hotspot: touch only these.**
- `game-client/src/scenes/BarrowspireScene.test.ts`
- `game-client/docs/design-guideline.md` (UI Chrome: an "Open bar" entry beside "Countdowns"); `docs/theming_plan.md` if it tracks guideline additions

## What to Build

1. The wire type (R18).
2. The bar (R22, R24): in the world, centred over the container, 10 px above its sprite, 44 × 7 px, the countdown bar's track, fill and rim, filling from the left, no number. Size and offset are named constants (D15).
3. Between states the fill may advance with real time, never past full; each state corrects it (R22).
4. Gone with the timed open, with no notice, sound or effect (R23).
5. Only the local player's, never while spectating (R25).
6. The guideline entry: what the open bar is, its look, and that it is not a countdown (D14).

## Acceptance Criteria

- [ ] A state with `timed_open` for a drawn container draws the bar at `elapsed / duration`; the next state moves it; a state showing the container open removes it and opens the view.
- [ ] A state without `timed_open` removes the bar and raises no notice.
- [ ] The fill never passes full, and no view opens without a state showing the container open.
- [ ] No bar is drawn from another player's state, while spectating, or for a container the client is not drawing.
- [ ] An already-open container's view opens at once on the E key; a guarded refusal still shows "It will not open." and no bar.
- [ ] `game-client/docs/design-guideline.md` has the "Open bar" entry.
- [ ] `npm test`, `npm run lint` and `npx tsc --noEmit` are green in game-client.

## Blocked By

None. The client codes to the wire in FS-MQYEX R18; slice 1 can land in either order. A client without a server that sends `timed_open` draws no bar.

## Spec Reference

FS-MQYEX §Requirements 21–25 (§D); Decisions L9, D2, D11, D14, D15; User Stories 2, 21–25; Acceptance Criteria (Client) lines 1, 5–8; Edge States (a frame is dropped, the container is out of the recipient's snapshot, a client that does not know `timed_open`).

## TDD Approach

- RED: `openBar.test.ts`: the fraction for `{elapsed: 0.75, duration: 1.5}` is 0.5, clamps at 1, and the rectangle sits centred above a container position.
- GREEN: the pure module. Then a scene test: a state with `timed_open` draws, a state without clears.
