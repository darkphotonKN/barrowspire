---
id: I-R82NV-2
status: open
implements: FS-R82NV
blocked_by: [I-R82NV-1]
labels: [ready-for-agent]
title: "FS-R82NV slice 2: kick, transfer, leave, succession and dissolution (game-service)"
---
Implements FS-R82NV §Requirements R5, R19, R20, R22

**Lane: human (HITL).**

## What to Build

- `party_kick {target_id}` and `party_transfer {target_id}` for the leader (not R19's
  `player_id`: the client's SocketManager overwrites `player_id` with the sender's own id on
  every message; see I-R82NV-6 notes); refusals
  `not_leader`, `not_member`. (`locked` is wired in FS-BJNYC; leave a seam for it.)
- `party_leave` for any member. A kicked or leaving member stays where they stand.
- Succession: when the leader leaves, the **earliest-joined** remaining member becomes leader at
  once (`party_update` reason `leader`).
- Last member leaving ends the party and deletes both Redis pointers.
- Graceful pod shutdown dissolves every party on the pod: `party_update` reason `dissolved`,
  pointers deleted.
- The removed player receives the final `party_update` with their own id as `subject_id`.

## Acceptance Criteria

- [ ] Kick removes the member, every member gets `party_update` reason `kicked`.
- [ ] Transfer makes the target leader; a non-leader's kick/transfer is refused `not_leader`; a non-member target `not_member`.
- [ ] Leader leaving promotes the earliest-joined member.
- [ ] Last leave ends the party; both pointers are gone.
- [ ] Shutdown dissolves parties with reason `dissolved`.
- [ ] Concurrent kick + leave of one member: first wins, second `not_member`.

## Blocked By

I-R82NV-1

## Spec Reference

FS-R82NV §Requirements R5, R19, R20, R22; §User Stories 10–13; §Edge States (concurrent, pod shutdown, empty).

## TDD Approach

- RED: leader of a three-member party (PARTY_SIZE=3 in the test) leaves; the earliest-joined remaining member is reported as leader.
- GREEN: removal + succession in the party state.
