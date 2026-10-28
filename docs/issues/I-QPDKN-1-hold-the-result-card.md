---
id: I-QPDKN-1
status: open
implements: FS-QPDKN
blocked_by: []
labels: [ready-for-agent]
title: "FS-QPDKN slice 1: hold the result card until Return to the hub"
---
Implements FS-QPDKN §Requirements 15–17

**Author: agent**

## What to Build

Today the run's end sends `end_game` and, in the same moment, `world_entered(hub)`; the
`world_entered` handler in `PhaserGame.tsx` switches scenes at once and the result card is
swept away. Keep the card on screen until the delver dismisses it.

- On `end_game`, the result card goes up as today, with **one** button, *Return to the hub*.
  The two legacy buttons (the one sending the pre-hub `find_game` payload, and WITHDRAW to
  `MainMenuScene`) are removed.
- While the result card is up, a `world_entered` with `world_type: "hub"` is **held**, not
  applied. Pressing *Return to the hub* applies the held payload: the normal scene switch to
  `HubScene` with that payload's `session_id`.
- Only the hub `world_entered` is held. A `world_entered` with `world_type: "run"` arriving
  while the card is up is applied at once, as today (FS-QPDKN R16).
- The hold is client-only: the server has already moved the delver to the hub. Nothing is sent
  to the server on the button.
- The scene teardown (`resetRun`) forgets the held payload and the card, so a reconnect does
  not replay a stale hold.

Where the hold lives is the implementer's call; the natural seam is the `world_entered`
handler in `PhaserGame.tsx` (it already defers during the boot chain via `bootGate.ts`), asking
the run scene whether it is showing a result. Keep one place that switches scenes.

Copy follows the lore voice (`game-client/CONTEXT.md`, `docs/design-guideline.md`); the button
is the one primary action on the card.

## Acceptance Criteria

- [ ] After `end_game`, a following `world_entered(hub)` does not switch the scene; the result
      card stays with a single *Return to the hub* button.
- [ ] Pressing *Return to the hub* switches to `HubScene` carrying the held `session_id`.
- [ ] A `world_entered(run)` arriving while the card is up is applied immediately.
- [ ] Neither legacy button exists; nothing sends the pre-hub `find_game` payload.
- [ ] A scene restart clears the hold and the card (no stale switch on the next run).
- [ ] Unit tests cover: hold-then-release, run `world_entered` not held, teardown clears the hold.
- [ ] `npx vitest run`, `npx tsc --noEmit`, `npm run lint` pass.

## Blocked By

None

## Spec Reference

FS-QPDKN §Requirements 15, 16, 17; §User Stories 13, 14; §Edge States "Holding the result".

## TDD Approach

- RED: with the result card up, feeding `world_entered {world_type: "hub"}` through the handler
  does not start `HubScene`; pressing the button does, with the same `session_id`.
- GREEN: a held-payload slot set on `end_game`, consumed by the button, cleared in `resetRun`.
