---
id: I-R82NV-2
status: done
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

- [x] Kick removes the member, every member gets `party_update` reason `kicked`.
- [x] Transfer makes the target leader; a non-leader's kick/transfer is refused `not_leader`; a non-member target `not_member`.
- [x] Leader leaving promotes the earliest-joined member.
- [x] Last leave ends the party; both pointers are gone.
- [x] Shutdown dissolves parties with reason `dissolved`.
- [x] Concurrent kick + leave of one member: first wins, second `not_member`.

## Blocked By

I-R82NV-1

## Spec Reference

FS-R82NV §Requirements R5, R19, R20, R22; §User Stories 10–13; §Edge States (concurrent, pod shutdown, empty).

## TDD Approach

- RED: leader of a three-member party (PARTY_SIZE=3 in the test) leaves; the earliest-joined remaining member is reported as leader.
- GREEN: removal + succession in the party state.

## Implementation notes (agreed with Nick, 2026-11-01)

- **A leader leaving sends two updates**: `left` (subject = the leaver), then `leader` (subject
  = the successor). Succession is set first, so both carry the new `leader_id`.
- **An invite is the party's, not its sender's.** It stands through a change of leader; its
  answers (`declined`, `expired`, `already_in_party`) go to whoever leads now.
- **An invite whose party ended answers an accept with `party_gone`**: the party's open invites
  are kept as gone until their minute is up, then forgotten.
- **A leader naming themselves in kick or transfer is ignored** (Debug log, no reply): the panel
  never offers it.
- **Leaving is never refused for being queued.** Separately, Nick decided a party member may not
  join the random queue at all; that belongs to FS-BJNYC (recorded in its scoping notes).
- A party-less player's kick or transfer is refused `not_leader`; a target id that is not a
  member (or not an id) `not_member`.
- `locked` is a seam (`partyRegistry.locked`, always false) checked by leave, kick and transfer;
  FS-BJNYC wires it.
- A member who leaves a party that goes on loses only their own pointer (`ForgetPlayers`); the
  last member's leave deletes both (`ForgetParty`). Shutdown dissolution was done in slice 1.
- Kick and transfer read `target_id` (I-R82NV-6 notes).
