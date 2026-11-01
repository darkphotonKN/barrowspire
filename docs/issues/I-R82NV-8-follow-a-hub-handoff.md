---
id: I-R82NV-8
status: open
implements: FS-R82NV
blocked_by: [I-R82NV-4, I-R82NV-6]
labels: []
title: "FS-R82NV slice 8: follow a handoff into another pod's hub (game-client)"
---

> **Superseded by [FS-NCC9J](../specs/NCC9J-party-membership-across-pods.md) (ADR-0036), 2026-11-01.**
> Membership now spans pods and accepting moves nobody; this slice's hub handoff on accept,
> expected arrival, recall and party-pod grace no longer apply. Not to be picked up: its work, where
> it survives, is in FS-NCC9J's issues (and FS-MCYWK for reconnects).
Implements FS-R82NV §Requirements R26, R27

**Lane: agent (AFK).**

## What to Build

- `world_handoff` payload gains `hub?: true`, `invite_id?`, `recall?: true` (types in
  `assets/types` / `gameState`).
- `SocketManager.handoff` follows a hub handoff with the same make-before-break as a run
  handoff: open a socket to `addr`; on open send `enter_hub` with the current character and the
  `invite_id` if present; then close the old socket. A repeated hub handoff for the same
  `invite_id` is ignored.
- On refusal or failure: keep the old socket, stay put, show "Could not reach your party" as a
  system line.
- Behind the existing transition screen; arrival spawns at the village's normal spawn.

## Acceptance Criteria

- [ ] A `world_handoff {hub: true, invite_id}` opens the new socket, sends `enter_hub` with the invite id, then closes the old one (SocketManager test with a fake WebSocket).
- [ ] A failed or refused new socket leaves the old one open and shows the notice.
- [ ] A `recall` handoff behaves the same without an invite id.
- [ ] Run handoffs are unchanged (existing tests still green).

## Blocked By

I-R82NV-4, I-R82NV-6

## Spec Reference

FS-R82NV §Requirements R26, R27; §User Stories 4, 6, 14.

## TDD Approach

- RED: SocketManager test — on a hub handoff, the first frame on the new socket is `enter_hub` carrying the invite id.
- GREEN: branch in `handoff()` for `hub`.
