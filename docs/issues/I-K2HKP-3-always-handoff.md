---
id: I-K2HKP-3
status: open
implements: FS-K2HKP
blocked_by: [I-K2HKP-2]
labels: []
title: "FS-K2HKP slice 3: Hand off into the run"
---
Implements FS-K2HKP §Requirements (Allocation and handoff R18–R24, Seat release, Return to the HUB world)

## What to Build

**Human lane: Kranti builds this, pairing with an agent for decisions and correctness.**
**Backend only** — the client piece is I-K2HKP-4.

One feature block: **a `create` step turns into a running delve.** The host pod creates the run
session at once from the match's characters, levels the first floor to the whole party, and
lets it tick immediately; matched players already on the host are moved in on the spot. Only
then does the host publish a `handoff` step to each other involved pod, which tells its listed
players to reconnect to the host with the JWT they already have plus the session id. The host seats
each arrival it expects, or refuses with `4002`. Seats nobody claims within 15s are released and
the run carries on with whoever arrived; a run nobody reached is shut down. No abort, no
requeue, no handoff tickets. Returning to the HUB world after the run stays a plain world switch
on the host pod.

The flow, end to end:
`create` step received → create the run session from the match's characters, matched ids as its
**expected players**, first floor levelled to the full party, tick starts, 15s seat timer starts
→ host-pod players: ordinary world switch into the run (`world_entered` run), no reconnect →
publish `handoff {step: handoff, pod, sessionID, hostAddr, players: [{playerID}]}` on each other
involved pod's channel, that pod's players only → on `handoff`, that pod sends each listed,
connected player `world_handoff {addr, session_id}` through the normal per-connection writer
(skip anyone not connected; don't touch the HUB world or the queue) → client connects
`?token=…&session_id=…` → host checks the JWT member is an expected, not-yet-seated player of that run,
fetches their loadout **before** taking the session lock, seats them, `world_entered` (run) — or
refuses with `4002` → the client's normal-closure close of its old socket runs the old pod's
ordinary disconnect path → after 15s: unclaimed seats released (later connects refused); if
nobody arrived, shut the session down.

Details in the FS §Requirements 18–28 and §Edge States.

## Done when

- On one replica with default env, a match runs end to end with no handoff (both players on the
  host).
- On `create`, the run exists at once, its first floor is levelled to the whole matched party, and
  it ticks without waiting for arrivals.
- The `handoff` step is published only after the host created the run; only players on other
  pods get `world_handoff`, and a player already on the host is moved in without a reconnect.
- On two replicas, players from both end up in one run on the host pod, playing the characters
  they queued with.
- A handoff connection is refused with `4002` for a member not expected in that run, already
  seated, whose seat was released, whose loadout cannot be fetched, or for an unknown or ended
  run.
- An arriving player's loadout is fetched before the session's lock is taken, so a slow
  items-service only delays the one joining.
- A seat unfilled after 15s is released and the run continues; a run nobody reached after 15s is
  shut down.
- After the old socket closes, the player is gone from the old pod's HUB world.
- Run resolution returns players to the host's HUB world with no reconnect.
- Tests cover seating, each `4002` refusal, the 15s seat release and the empty-run shutdown.

## Blocked By

I-K2HKP-2 (global queue and matcher)

## Spec Reference

FS-K2HKP §Requirements 18–28, §Edge States (host crash before arrival, host crash mid-run,
arrival before the run exists, source pod crash, disconnect before handoff, leave-at-pop,
nobody arrives, someone else takes a seat, double connect, arrival after release, items-service
slow or down, seated player disconnects, lost handoff message), User Stories 2, 4, 8, 11, 15–17,
19–22, 25. Supersedes FS-29KSH R20–R21 for hub → run.
