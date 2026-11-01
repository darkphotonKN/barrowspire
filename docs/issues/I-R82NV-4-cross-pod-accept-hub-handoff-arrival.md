---
id: I-R82NV-4
status: open
implements: FS-R82NV
blocked_by: [I-R82NV-3]
labels: []
title: "FS-R82NV slice 4: accept across pods — hub handoff and arrival (game-service)"
---

> **Superseded by [FS-NCC9J](../specs/NCC9J-party-membership-across-pods.md) (ADR-0036), 2026-11-01.**
> Membership now spans pods and accepting moves nobody; this slice's hub handoff on accept,
> expected arrival, recall and party-pod grace no longer apply. Not to be picked up: its work, where
> it survives, is in FS-NCC9J's issues (and FS-MCYWK for reconnects).
Implements FS-R82NV §Requirements R16 (other-pod branch), R17, R18

**Lane: human (HITL).**

## What to Build

- On `party_accept` for a party on another pod: check `party:<id>` points at an alive pod
  (else `party_gone`), check not queued (`queued`), then send the player
  `world_handoff {addr: party_pod_addr, hub: true, invite_id}` and publish
  `party_reply {accepted, arriving}` to the party pod's inbox.
- Party pod records an **expected arrival** `{player_id, invite_id, deadline: now + 15 s}`,
  notices `accepted` to the party, and re-checks `pod_full` (pending accepts reserve room).
- `enter_hub` gains an optional `invite_id`. When it matches an expected arrival, the player is
  seated in the hub **and** added as the last member; their other pending invites are voided;
  pointers written; `party_update` reason `joined`. A plain connect — no `?session_id=`.
- Deadline passes → expectation dropped, `no_show` to the party; a later `enter_hub` with that
  id seats a party-less player who gets `expired`.

## Acceptance Criteria

- [ ] Two-pod test: accept on B yields `world_handoff` with `hub: true` and A's pod address.
- [ ] A connection to A followed by `enter_hub {invite_id}` adds the player; both members get `party_update`.
- [ ] No arrival within 15 s (clock injected) notices `no_show`; a late `enter_hub` seats them party-less with `expired`.
- [ ] Accept when the party pod is dead → `party_gone`; when the party pod's hub is full → `pod_full`.
- [ ] Two parties invite one player; the first accept wins, the second gets `already_in_party`.

## Blocked By

I-R82NV-3

## Spec Reference

FS-R82NV §Requirements R16, R17, R18; §User Stories 4, 6, 7, 22; §Edge States (party pod full, party pod dies, concurrent invites, queued invitee).

## TDD Approach

- RED: two pods, B accepts A's invite, B's connection receives `world_handoff {hub: true}` with A's address.
- GREEN: the accept branch, the inbox reply, and the expected-arrival table on A.
