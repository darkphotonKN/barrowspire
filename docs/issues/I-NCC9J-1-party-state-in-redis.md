---
id: I-NCC9J-1
status: open
implements: FS-NCC9J
blocked_by: []
labels: [ready-for-agent]
title: "FS-NCC9J slice 1: party state in Redis — create, invite, accept, decline on one pod (game-service)"
---
Implements FS-NCC9J §Requirements R1–R4, R6, R8, R10, R12–R15, R22

**Lane: human (HITL).** Discuss each choice before writing code.

## What to Build

- The party moves from the pod's memory (FS-R82NV's `partyRegistry` maps) to Redis: party record,
  members in join order, open invites as a sorted set scored by expiry, member pointers.
- One Lua script per mutation for this slice: create, invite (reserves a slot: members + open
  invites ≤ size, pruning expired first), accept (consumes the reservation, sets the pointer, voids
  the accepter's other invites), decline. Go keeps the refusal order and copy as pre-checks; a
  script returns a refusal code when its final check fails.
- The party cache: each pod's copy of its players' parties; reads on the hub loop come from it;
  re-read every 10 s; dropped when the pod holds none of a party's members.
- Arrival read: a player seated on the pod gets a full `party_update` read from Redis.
- Redis unreachable → every mutation refused `party_notice` `unavailable` (new code).
- Expiry by the invite's score: no server expiry notice (R12); an accept after expiry → `expired`.
- Single pod only in this slice: fan-out to other pods is slice 3.

## Acceptance Criteria

- [ ] Every existing FS-R82NV same-pod party test passes on the Redis-backed party (regression), apart from the expiry notice R12 removes.
- [ ] Each script is unit-tested on miniredis, including its refusal returns.
- [ ] With size 2 and one open invite, a second invite is refused `party_full`; an accept always fits.
- [ ] Two accepts of the same invite: the second finds nothing.
- [ ] An accept after 60 s is refused `expired`; the slot is free again.
- [ ] A player seated on the pod receives a full `party_update`.
- [ ] With Redis down, create/invite/accept/decline are refused `unavailable`.
- [ ] No Redis call on the hub loop for a party read (reads come from the cache).
- [ ] `go test ./... -race` on touched party tests green.

## Blocked By

None

## Spec Reference

FS-NCC9J §Requirements R1–R4, R6, R8, R10, R12–R15, R22; §User Stories 5, 19, 20, 22–24; §Edge States (concurrent, Redis unreachable, unauthorized).

## TDD Approach

- RED: a miniredis test that the invite script refuses a second invite when members + open invites reach the size.
- GREEN: the party key layout and the invite script; then move the registry's create/invite/accept/decline onto the scripts, keeping the existing tests green.
