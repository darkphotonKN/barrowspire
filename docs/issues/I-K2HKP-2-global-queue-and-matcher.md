---
id: I-K2HKP-2
status: open
implements: FS-K2HKP
blocked_by: [I-K2HKP-1]
labels: []
title: "FS-K2HKP slice 2: Global Redis queue and matcher"
---

Implements FS-K2HKP §Requirements (Pod identity, Pod liveness, Queue, Matching)

## What to Build

**Human lane: Kranti builds this, pairing with an agent for decisions and correctness.**

One feature block: **queueing and matching move into Redis.** When this is done, any replica
can queue a player, one replica per round finds a group, and dead replicas' players never get
matched. The match is published to the host pod, but nothing acts on it yet beyond logging:
seats and the handoff are slice 3.

The flow, end to end:
pod identity from env → liveness heartbeat → `find_game` / `leave_queue` / disconnect against
the Redis queue → matcher round under a lock → atomic all-or-nothing pop (Lua) → drop players
whose pod is dead, push survivors back to the head → choose the host pod (first popped player's)
→ publish the match `{runID, hostPodID, players: [{playerID, podID}]}` on the host's
`pod:{hostPodID}` channel only.

The details (key names, TTLs, why liveness is a heartbeat) are in the FS; read §Requirements
1–17 while building rather than ticking them off one by one.

Note: until slice 3 lands, a match is published but no one is moved into a run. Build this on
a branch with slice 3, or temporarily keep the old in-process run start for same-pod matches.

## Done when

- Two players queued on different replicas get matched together, and the match message
  arrives on the host pod's channel only, carrying the run id and each player's pod.
- One queued player is never popped alone; cancelled and disconnected players are never matched;
  a crashed replica's players are dropped and the survivor keeps their place.
- The in-process queue service is gone, the `leave_queue` bug is fixed, and the queue panel
  shows the global count.
- Tests against miniredis cover the pop, the double-matcher race, and liveness expiry.

## Blocked By

I-K2HKP-1 (miniredis harness)

## Spec Reference

FS-K2HKP §Requirements 1–17, §Edge States (crash, lock expiry, leave-at-pop, two tabs, Redis
down), User Stories 1, 3, 5–7, 9, 12–14, 18. Client cancel fix (R30) is part of slice 3.
