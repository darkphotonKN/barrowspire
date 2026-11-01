---
id: I-NCC9J-2
status: open
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
