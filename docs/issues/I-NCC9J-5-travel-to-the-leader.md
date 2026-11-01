---
id: I-NCC9J-5
status: open
implements: FS-NCC9J
blocked_by: [I-NCC9J-3, I-NCC9J-4]
labels: [ready-for-agent]
title: "FS-NCC9J slice 5: party_travel to the leader's pod village (game-service)"
---
Implements FS-NCC9J §Requirements R18–R20

**Lane: human (HITL).**

## What to Build

- `party_travel` (no payload): refusals in order `not_member`, `not_in_hub`, `queued`,
  `leader_away` (the leader's member record, slice 4), `pod_full` (the leader's pod's hub at its cap);
  nothing for a member already on the leader's pod; the leader cannot travel.
- On success: `world_handoff {addr: <leader's pod address>, hub: true}`.
- The old pod lets go at once: unseats the traveller's presence and does not hold them for the
  reconnect grace when the old socket closes (so FS-MCYWK never bounces them back).
- Arrival is an ordinary `enter_hub` on the leader's pod; its cap is checked again there.

## Acceptance Criteria

- [ ] A member in their village on pod B gets `world_handoff {hub: true}` with pod A's address when the leader is on A.
- [ ] Refusals fire in R18's order (table-driven): `not_member`, `not_in_hub` (field, run), `queued`, `leader_away`, `pod_full`.
- [ ] After the handoff, pod B holds the player neither in presence nor in the reconnect grace.
- [ ] Arrival on A seats them in A's hub and sends them a full `party_update`.
- [ ] `go test ./... -race` on touched party tests green.

## Blocked By

I-NCC9J-3, I-NCC9J-4

## Spec Reference

FS-NCC9J §Requirements R18–R20; §User Stories 8–12; §Edge States (travel while the leader is mid-handoff, travel and reconnect).

## TDD Approach

- RED: a two-pod test where a member in pod B's hub sends `party_travel` and receives `world_handoff` naming pod A.
- GREEN: the action, the leader's pod from presence, then the refusals and the let-go.
