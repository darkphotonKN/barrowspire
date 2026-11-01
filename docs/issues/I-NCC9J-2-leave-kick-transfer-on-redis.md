---
id: I-NCC9J-2
status: done
implements: FS-NCC9J
blocked_by: [I-NCC9J-1]
labels: [ready-for-agent]
title: "FS-NCC9J slice 2: leave, kick, transfer, succession and party end as scripts (game-service)"
---
Implements FS-NCC9J §Requirements R16

**Lane: human (HITL).**

## What to Build

- Leave, kick, transfer as Lua scripts, keeping FS-R82NV R19–R22's rules: `target_id`, refusals
  `not_leader` / `not_member` / `locked` seam, the removed player's final update, `left` then
  `leader` when the lead passes to the earliest-joined; the last member's leave deletes the party,
  its pointers and invites (an accept of one then hears `party_gone`).
- The leader may be on any pod: no rule ties the lead to a pod.

## Acceptance Criteria

- [ ] Every existing FS-R82NV kick/transfer/leave/succession test passes on Redis.
- [ ] Concurrent kick and leave of one member: the first script removes them, the second → `not_member`.
- [ ] The last leave deletes every key of the party; an accept of its open invite → `party_gone`.
- [ ] `go test ./... -race` on touched party tests green.

## Blocked By

I-NCC9J-1

## Spec Reference

FS-NCC9J §Requirements R16; §User Stories 13, 14; §Edge States (concurrent kick and leave).

## TDD Approach

- RED: a miniredis test that the leave script, run for the leader of a three-member party, makes the earliest-joined remaining member leader.
- GREEN: the leave script, then kick and transfer.

## Done in I-NCC9J-1 (cabb498, 2026-11-01)

Pulled forward with Nick's agreement (I-NCC9J-1 note 10) so the same-pod tests kept passing on the
Redis party: `partystore/scripts/remove.lua` (leave, kick, succession, party end) and
`transfer.lua`. Closed with no further code.

- Existing kick/transfer/leave/succession tests pass on Redis: MET (`TestPartyLeave_*`,
  `TestPartyKick_*`, `TestPartyTransfer_*`, `TestPartyMembership_Refusals`).
- Concurrent kick and leave, the second `not_member`: MET (`TestRemove_Refusals`;
  `TestPartyKickAndLeave_FirstWinsSecondNotMember`, ordered by the pod's FIFO runner).
- The last leave deletes the party; an accept of its open invite → `party_gone`: MET
  (`TestRemove_LastMember_EndsTheParty`, `TestPartyLeave_LastMemberEndsTheParty`). The invite's
  own record is kept until its TTL on purpose, so that accept can tell `party_gone` from nothing.
- `-race` on touched party tests: MET (I-NCC9J-1 pre-flight).
- The TDD Approach's RED test is `TestRemove_LeaderLeaves_EarliestJoinedLeads`.

Not in this slice: the change reaching members on other pods (FS-level AC "a leader on pod B
transfers to a member on pod A"), which needs I-NCC9J-3's fan-out.
