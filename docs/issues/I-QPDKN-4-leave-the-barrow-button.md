---
id: I-QPDKN-4
status: open
implements: FS-QPDKN
blocked_by: [I-QPDKN-2, I-QPDKN-3]
labels: [blocked]
title: "FS-QPDKN slice 4: Leave the barrow button for the dead delver"
---
Implements FS-QPDKN §Requirements 2, 10, 13–14

**Author: agent**

## What to Build

Add the second button to the dead delver's card from slice 2, wired to slice 3's `leave_run`.

- The dead (or left-behind) delver's card gets *Leave the barrow* beside *Watch the delve*.
  The escaped delver's card never has it.
- Pressing it sends `leave_run` (the `ActionType` added in slice 3) **once**; further presses
  before the server answers are ignored. No confirmation step.
- The server answers with `world_entered(hub)`; the existing `world_entered` handling switches
  the scene. Nothing else to do on success.
- While a dead delver is spectating, the button stays on screen, moved to a corner where it
  does not cover the watched delver, in the HUD depth band; placement per
  `game-client/docs/design-guideline.md`. The spectate HUD from slice 2 and this button must not
  overlap.
- An error reply on `leave_run` while the result card is up (the run ended first, FS-QPDKN
  §Edge States "Leaving") is ignored. An error reply while the card is up re-enables the
  button.
- `resetRun` forgets the button and the pending-send flag.

## Acceptance Criteria

- [ ] The dead card shows *Watch the delve* and *Leave the barrow*; the escaped card shows
      only *Watch the delve*.
- [ ] Pressing *Leave the barrow* sends exactly one `leave_run`; a second press before the
      answer sends nothing.
- [ ] A `world_entered(hub)` answer switches to `HubScene`.
- [ ] While spectating, the button is in its corner placement and does not overlap the
      "Watching <name>" HUD.
- [ ] An error reply with the result card up is ignored; with the card up it re-enables the
      button.
- [ ] A scene restart forgets the button and the pending flag.
- [ ] Unit tests cover: button presence by card kind, single send, re-enable on error,
      teardown.
- [ ] `npx vitest run`, `npx tsc --noEmit`, `npm run lint` pass.

## Blocked By

I-QPDKN-2 (the card), I-QPDKN-3 (`leave_run` on the server and the `ActionType` entry).

## Spec Reference

FS-QPDKN §Requirements 2, 10, 13, 14 (client side); §User Stories 2, 4; §Edge States "Leaving".

## TDD Approach

- RED: a card built for a dead delver exposes a leave action that sends `leave_run` once;
  built for an escaped delver it exposes none.
- GREEN: the button, the pending flag, the placement switch when spectating.
