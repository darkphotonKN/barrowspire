---
id: I-NCC9J-8
status: open
implements: FS-NCC9J
blocked_by: []
labels: [ready-for-agent]
title: "FS-NCC9J slice 8: the Travel button beside the leader's frame (game-client)"
---
Implements FS-NCC9J §Requirements R28

**Lane: agent (AFK).** Built against FS-NCC9J's wire shapes; integrated once I-NCC9J-5 lands.

## What to Build

- A **Travel** button beside the leader's frame, shown to every member not on the leader's pod;
  pressable only in the player's own town; greyed in a field, in a run, and while the leader is
  `online: false`.
- Pressing sends `party_travel`; the client follows the `world_handoff {hub: true}` with its
  existing handoff (make-before-break), keeping the old socket if the move is refused.
- `party_travel` joins the boot-time party error claim (`routePartyErrors`).

## Acceptance Criteria

- [ ] The button shows beside the leader for a member on another pod and not for one on the leader's pod or for the leader.
- [ ] Greyed in a field, in a run, and while the leader is offline; pressing it then sends nothing.
- [ ] In town it sends `party_travel`; a `world_handoff {hub: true}` moves the socket; a refused move keeps the old one.
- [ ] `vitest` green; lint fence passes.

## Blocked By

None (server: I-NCC9J-5 for the action)

## Spec Reference

FS-NCC9J §Requirements R28; §User Stories 8–11.

## TDD Approach

- RED: a pure test that the travel button's state is hidden / greyed / live across leader-here, field, run, leader offline and town.
- GREEN: the selector, then the button, then the handoff with `hub: true`.
