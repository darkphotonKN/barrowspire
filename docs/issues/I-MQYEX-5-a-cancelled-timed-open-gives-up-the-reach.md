---
id: I-MQYEX-5
status: open
implements: FS-MQYEX
blocked_by: [I-MQYEX-4]
labels: [ready-for-agent, blocked]
title: "FS-MQYEX slice 5: a cancelled timed open gives up the reach, so no view opens later (client)"
---
Implements FS-MQYEX §Requirements 26–27

**Lane: game-client.** A pending reach for a shut container ends when the player's own position
changes, and when a state showed the player's timed open on that container and a later state
shows none while it is still shut. After that, the container opening (a teammate finished) opens
no view. A state that shows the container open is read first, so a player whose timed open ended
because a teammate finished still gets the view.

## Files owned

- `game-client/src/scenes/BarrowspireScene.ts`: `reaching`, `toggleChest`, `checkChestDistance`, and where `updateContainers` opens the view for a pending reach. **Hotspot: touch only these.**
- `game-client/src/scenes/BarrowspireScene.test.ts` (the "reaching for a shut container" block)
- a small Phaser-free helper beside the scene if the rule reads better as a pure function of (pending reach, previous state, next state)

## What to Build

1. Remember, for the pending reach, whether a state has shown the player's timed open on it.
2. Give the reach up when that timed open is gone and the container is still shut (R26, D13).
3. Give the reach up when the player's own position changes. This takes in today's "farther than 60 px" rule (R26).
4. Read "the container is open" before either: open the view, then clear the reach (R26).
5. Refusals, notices, taking items, the per-kind views, the field scene and the hub are untouched (R27).

## Acceptance Criteria

- [ ] After a state with `timed_open` for the reached container, a state without it and with the container shut gives the reach up; a later state showing the container open opens no view.
- [ ] A state that both drops `timed_open` and shows the container open opens the view.
- [ ] A pending reach is given up when the player's own position changes; a reach never answered is still given up that way.
- [ ] A reach that no state has yet answered is not given up by a state without `timed_open` (the reply is still on its way).
- [ ] The existing "reaching for a shut container (FS-KE075 §J R60)" tests pass, changed only where walking off is now "the position changes".
- [ ] `npm test`, `npm run lint` and `npx tsc --noEmit` are green in game-client.

## Blocked By

I-MQYEX-4 (the `timed_open` type, and the same scene hotspot).

## Spec Reference

FS-MQYEX §Requirements 26–27 (§D); Decision D13; User Stories 15, 20; Acceptance Criteria (Client) lines 2–4; Edge States (the reach is made while walking, a teammate finishes while the player is mid-open, a teammate finishes after the player was cancelled, the reach is dropped by the per-player throttle).

## TDD Approach

- RED: reach, a state with `timed_open`, a state without it (container shut), a state with the container open: expect no view.
- GREEN: the shown-then-gone rule. Then RED/GREEN for the position rule and for open-read-first.
