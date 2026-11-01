---
id: I-R82NV-5
status: open
implements: FS-R82NV
blocked_by: [I-R82NV-4]
labels: []
title: "FS-R82NV slice 5: where members are, disconnect grace and recall (game-service)"
---

> **Superseded by [FS-NCC9J](../specs/NCC9J-party-membership-across-pods.md) (ADR-0036), 2026-11-01.**
> Membership now spans pods and accepting moves nobody; this slice's hub handoff on accept,
> expected arrival, recall and party-pod grace no longer apply. Not to be picked up: its work, where
> it survives, is in FS-NCC9J's issues (and FS-MCYWK for reconnects).
Implements FS-R82NV §Requirements R22 (on disconnect), R23, R24

**Lane: human (HITL).**

## What to Build

- Track `where` on the party pod from its own world switches: `hub`, `field:<place>`, `run`,
  `away`. `party_update` reasons `away` / `back` on change.
- A member disconnecting outside an instance stays a member for **5 minutes** as `away`. A
  disconnected leader is succeeded at once (R22) and returns as a member.
- Reconnecting to the **party pod** marks them `back`.
- Reconnecting to **another** pod and sending `enter_hub`: that pod reads `player:<id>:party`
  → party pod; if alive, replies `world_handoff {addr, hub: true, recall: true}` instead of
  seating them, and publishes a `party_recall` to the party pod's inbox, which expects the
  arrival (slice 4's table, kind `recall`).
- After 5 minutes the party pod removes them (`left`) and deletes their pointer.
- Inside an instance this grace does not apply (FS-BJNYC owns it).

## Acceptance Criteria

- [ ] Hub disconnect → `away` in every member's `party_update`; reconnect on the party pod → `back`.
- [ ] Reconnect on another pod → `world_handoff {recall: true}`; arrival on the party pod → `back`.
- [ ] 5 minutes away (clock injected) removes the member and their pointer.
- [ ] A leader's disconnect promotes the earliest-joined member immediately.
- [ ] Walking into a field / run updates `where` for every member.

## Blocked By

I-R82NV-4

## Spec Reference

FS-R82NV §Requirements R22, R23, R24; §User Stories 13, 14, 16; §Edge States (leader disconnects in the hub, all members away, party pod dies).

## TDD Approach

- RED: a member's connection closes in the hub; the other member receives `party_update` with that member `where: away`.
- GREEN: the disconnect hook on the party state and the grace sweep in the hub's tick.
