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
  leader, when the player's `pod_id` matches the leader's, and when either is missing or empty
  (the issue's rule, kept after code review: the away update brings `online: false` and an empty
  `pod_id` together, so the button simply goes when the leader does; Nick); greyed outside the
  town and while the leader is away with a pod still named; live otherwise.
- The button sits **inside** the leader's frame, on the name line at its right end: the T panel
  opens 18 px right of the frames, so a button past the frame's edge would sit under it.
- `SocketManager` follows `world_handoff {hub: true}` apart from a run's: a plain connection to
  `addr` that sends `enter_hub` as the arrival says once open; the hub's `world_entered` promotes
  it. What it enters with and how a refusal is told come in as a `HubArrival` (`travelArrival`:
  the active character, a chat system line), so the socket only moves. A refused entry or an
  unreachable server keeps the old socket (or reconnects where it was, if that died meanwhile) and
  says why. The delve's `world_handoff` listener never hears a travel.
- `partyWhereLabel` maps `field` to "afield" (decided after slicing).

## Browser check (pending)

Two pods: a member in their town on pod B presses Travel beside a leader on pod A, lands in
pod A's hub with the party shown; greyed in a field and while the leader is away; a full hub keeps
them on pod B with "The hub is full. Try again shortly."

## Code review (2026-11-02, two axes) — fixed

- A refused hub entry did not reconnect when the old socket had died meanwhile (MED).
- `SocketManager` picked the character, built `enter_hub` and wrote chat notices itself: now a
  `HubArrival` is injected, and a move with no character, or to an unreachable server, is told
  (MED, and the unreachable LOW).
- Long names ran under the Travel button: every frame's name is shortened to its room (MED).
- `field` → "afield" was missed (MED); the missing-`pod_id` rule now hides on either side (LOW).
- The button drawing is shared with the T panel (`drawHudButton`); vacuous test lines fixed and
  missing cases covered (refusal with the old socket dead, replay, a run handoff mid-travel, a
  second travel, no character).

## Code review follow-ups not taken (LOW)

- Only the button's label takes the press, not its whole outline (the T panel's buttons alike).
- A greyed button gives no reason on hover (R28 asks none).

