---
id: I-29KSH-5
status: done
implements: FS-29KSH
blocked_by: [I-29KSH-2]
labels: [blocked]
title: "FS-29KSH slice 5: switch a player between hub and run"
---
Implements FS-29KSH §Requirements 15, 20-23

**Author: agent**

## What to Build

Close the loop: hub → run → hub, over **one uninterrupted WebSocket connection**.

Moving a player between worlds is an internal migration — remove the player's entity from the
source world, create it in the target — with no reconnect and no re-authentication. This is the
mechanism ADR-0015 chose over `refactor_plan.md`'s two-connection handoff, and the reason the
"failed to reconnect while holding loot" failure mode does not exist here.

- On a successful match, each matched player is switched from the hub into the newly built run.
- On run resolution — escape, elimination, or the run ending any other way — each player is
  switched back to the hub and placed at the **fixed spawn point**. Escape and death land in the
  same place.
- A player inside a run has no hub entity: absent from the hub and from its broadcast.
- The world identity message (I-29KSH-2) fires on both of these transitions too, so the client's
  single transition point drives the scene switch each way.

Triggered through the **existing** `find_game` path for this slice. The delve NPC is I-29KSH-6;
matchmaking itself is untouched (`matchSize = 2`, random pairing).

## Acceptance Criteria

- [x] Two queued players are both switched into one run with neither client reconnecting —
      verified by the WebSocket connection being the same object/id across the transition.
- [x] On run end both players are back in the hub at the fixed spawn point, whether they escaped
      or died.
- [x] A player inside a run does not appear in the hub broadcast.
- [x] The world identity message fires on run entry (type `run`) and on return (type `hub`).
- [x] A player who disconnects mid-switch reconnects into whichever world
      `Player.CurrentGameSessionId` names.
- [x] **Revised, as in I-29KSH-1:** no new test failures and no new lint findings versus the
      branch point. `internal/game`'s movement integration test and `cmd/server`'s vet failure
      are red at HEAD and out of scope; lint held at 34 across the touched packages.
- [ ] **Not verified by playing it.** `find_game` has had no UI trigger since I-29KSH-2 moved the
      menu's start button to `enter_hub`; the delve NPC arrives in I-29KSH-6. Every criterion above
      is proven by test only, and this feature's history says that is the weaker half — eight
      defects surfaced from running the stack while the suite was green. Walk the loop once
      I-29KSH-6 lands.

## Blocked By

I-29KSH-2 — there must be a hub to switch out of and back into.

## Spec Reference

FS-29KSH §Requirements 15, 20-23; §Edge States (Disconnect — "Disconnecting during a world
switch"; Concurrent — "A match completing at the same moment a player disconnects").
Constraint: ADR-0015 clause 2 (internal migration, not a handoff).

## TDD Approach

- RED: queue two players from the hub, force a match, assert both have a run entity and no hub
  entity, and that the hub broadcast lists neither.
- GREEN: migration on match.
- RED: end the run, assert both are back in the hub at the spawn point with no reconnect.
