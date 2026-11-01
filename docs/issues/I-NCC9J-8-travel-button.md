---
id: I-NCC9J-8
status: in-progress
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

- [x] The button shows beside the leader for a member on another pod and not for one on the leader's pod or for the leader.
- [x] Greyed in a field, in a run, and while the leader is offline; pressing it then sends nothing.
- [x] In town it sends `party_travel`; a `world_handoff {hub: true}` moves the socket; a refused move keeps the old one.
- [x] `vitest` green; lint fence passes.

## Blocked By

None (server: I-NCC9J-5 for the action)

## Spec Reference

FS-NCC9J §Requirements R28; §User Stories 8–11.

## TDD Approach

- RED: a pure test that the travel button's state is hidden / greyed / live across leader-here, field, run, leader offline and town.
- GREEN: the selector, then the button, then the handoff with `hub: true`.

## Decided after slicing (2026-11-01)

- **"Not on the leader's pod" is the player's own member `pod_id` differing from the leader's**
  (FS-NCC9J R21/R28, amended; the server sends it from I-NCC9J-3). Treat a missing or empty
  `pod_id` as unknown: hide the button rather than offer a move that may go nowhere. Build on
  I-NCC9J-7's `PartyFrameRow` union.
- **`where` is now `hub` | `field` | `run`** (I-NCC9J-3 E6): `partyWhereLabel` must map `"field"`
  to "afield" (today it only knows `field:<id>`). One line; part of this slice.

## Implementation notes (2026-11-02)

- `travelButton(party, selfId, world)` (`partyFramesLayout.ts`): hidden with no party, for the
  leader, and when the player's `pod_id` matches the leader's (a server that sends no `pod_id`
  hides it); greyed outside the town and while the leader is away (`online: false`); live
  otherwise.
- The button sits **inside** the leader's frame, on the name line at its right end: the T panel
  opens 18 px right of the frames, so a button past the frame's edge would sit under it.
- `SocketManager` follows `world_handoff {hub: true}` apart from a run's: a plain connection to
  `addr` that sends `enter_hub` as the active character once open; the hub's `world_entered`
  promotes it. A refused entry (its message said as a system line) or an unreachable server keeps
  the old socket. The delve's `world_handoff` listener never hears a travel.

## Browser check (pending)

Two pods: a member in their town on pod B presses Travel beside a leader on pod A, lands in
pod A's hub with the party shown; greyed in a field and while the leader is away; a full hub keeps
them on pod B with "The hub is full. Try again shortly."

