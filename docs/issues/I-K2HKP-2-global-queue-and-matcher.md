---
id: I-K2HKP-2
status: done
implements: FS-K2HKP
blocked_by: [I-K2HKP-1]
labels: []
title: "FS-K2HKP slice 2: Global Redis queue and matcher"
---

Implements FS-K2HKP §Requirements (Pod identity, Pod liveness, Queue, Matching, Allocation and handoff R16–R17)

## What to Build

**Human lane: Kranti builds this, pairing with an agent for decisions and correctness.**

One feature block: **queueing and matching move into Redis.** When this is done, any replica
can queue a player, one replica per round finds a group, and dead replicas' players never get
matched. Each queued player carries a **queue entry** with their pod and the character they are
playing, so a match already knows the whole party. The match is published to the host pod as a
`create` step, but nothing acts on it yet beyond logging: creating the run and the handoff are
slice 3.

The flow, end to end:
pod identity from env → liveness heartbeat → `find_game` writes the queue entry
`HSETNX queue:entries <playerID> {pod, character: {id, name, class, level, experience}}` and
`RPUSH queue`; `leave_queue` / disconnect remove both → `enter_hub` as another character is
refused while queued → matcher round (no lock, R11 amended) → atomic all-or-nothing pop (Lua) → read each
popped player's pod from their queue entry, drop players whose pod is dead, push survivors back
to the head → the match returns each player's id, pod and character → choose the host pod (first
popped player's) → publish the `create` step
`{step: create, pod: hostPodID, runID, players: [{playerID, podID, character}]}` on the host's
`matchstart:pod:{hostPodID}` channel only.

The queue panel finds this pod's queued players by the pod inside each queue entry. A queue
entry that is not valid JSON or has no pod is handled like the existing missing-pod error.

The details (key names, TTLs, why liveness is a heartbeat, why characters ride the queue entry)
are in the FS; read §Requirements 1–17 (including 7a, 13a) while building rather than ticking
them off one by one.

Note: until slice 3 lands, a match is published but no one is moved into a run. Build this on
a branch with slice 3, or temporarily keep the old in-process run start for same-pod matches.

## Done when

- `find_game` stores a queue entry with the player's pod and character in play; queueing twice
  is refused; switching character while queued is refused.
- Two players queued on different replicas get matched together, and the `create` step arrives on
  the host pod's channel only, carrying the run id and each player's pod and character.
- One queued player is never popped alone; cancelled and disconnected players are never matched;
  a crashed replica's players (pod read from the queue entry) are dropped and the survivor keeps
  their place; a malformed queue entry errors like a missing pod and the others are restored in
  order.
- The in-process queue service is gone, the `leave_queue` bug is fixed, and the queue panel
  shows the global count.
- Tests against miniredis cover the queue entry round trip, the pop, the double-matcher race,
  and liveness expiry.

## Blocked By

I-K2HKP-1 (miniredis harness)

## Spec Reference

FS-K2HKP §Requirements 1–17 (incl. 7a, 13a), §Edge States (crash, several matchers at once, leave-at-pop,
two tabs, Redis down, queued player switches character, malformed queue entry, host never
receives the `create` step), User Stories 1, 3, 5–7, 9, 12–14, 18, 24. Client cancel fix (R30) is
part of slice 4.

## Amended

FS-K2HKP R11 amended: no matcher lock. Step values renamed `create` / `handoff` on
`matchstart:pod:{podID}`. The remaining work moved to I-K2HKP-5.
