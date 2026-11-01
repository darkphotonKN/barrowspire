# ADR-0036 — Party state lives in Redis and membership spans pods; joining is in place, travel to the leader is explicit

Status: accepted
Date: 2026-11-01
Scope: `game-server/game-service`, `game-client`
Supersedes: [ADR-0034](0034-a-party-lives-on-one-pod-joining-is-a-hub-handoff.md)
Realized by: [FS-NCC9J](../specs/NCC9J-party-membership-across-pods.md) (membership across pods,
travel to the leader, presence of every player); touches [FS-BJNYC](../specs/BJNYC-party-instance-entry.md),
[FS-XGW7H](../specs/XGW7H-party-chat.md), [FS-V780R](../specs/V780R-party-loot-rule.md)

## Context

ADR-0034 made a party live on one pod, its *party pod*: the party's state in that pod's memory,
Redis holding only pointers, every member connected to it, and accepting an invite a hub handoff
onto it. FS-R82NV built that on one pod (formation, kick, transfer, leave, succession, create) and
began the cross-pod half (presence index, pod inbox, cross-pod invite and decline).

Playing it forward, Nick did not want accepting an invite to pull a player across pods: a player
should become a member where they stand, and choose when to go to their teammates. Once members
may stand on different pods, a pod-memory home raises two questions ADR-0034 never had to answer:

- **Who may lead?** A home pod holds the state; a leader on another pod (by transfer, or by
  succession to the earliest-joined) would act on a party it does not hold. Either leadership is
  restricted to members on the home pod, or the home follows the leader, which needs a hand-over
  protocol for in-flight operations, open invites and replies.
- **What survives a pod?** ADR-0034 accepted that a party pod crash drops the party. With members
  spread out, one pod dying would dissolve a party most of whose members are elsewhere and fine.

Nick wanted both: a leader on any pod, and a party that outlives any one pod. Forces measured in
the session: a party is ~1 KB and a presence entry ~300 B, so even 100 000 online is tens of MB;
refresh writes stay well inside one Redis. Redis is already critical to game-service (the match
queue, `pod:alive`, handoff announcements, world chat). The hub loop and each world's tick must
never block on a network call.

The decision was attacked in a challenge-me session (2026-11-01) before it was recorded.

## Decision

**A party's state lives in Redis; no pod is its home.** Members may be on any pod. The leader may
be on any pod, so transfer and succession are unrestricted. A pod dying disconnects its own
players and nothing more.

**Mutations are small Lua scripts.** Each of invite, accept, decline, leave/kick, transfer and
create is one script that does only the final atomic check and write (an accept: the invite is
still open → remove it, add the member, set their pointer). Refusal order, notice copy and who may
do what stay in Go, as checks made before the script runs. **An invite reserves a slot**: open
invites (a sorted set scored by expiry, pruned by the scripts) count toward the cap with the
members, so an accept never meets a full party and needs no count of its own.

**Joining is in place.** Accepting an invite makes the invitee a member on whatever pod they
stand, with no handoff.

**Travel to the leader is explicit.** A member moves to the village of the leader's current pod by
a handoff they trigger themselves, from a button beside the leader in the party frames, only while
standing in their own village. A field is still never a handoff destination (ADR-0030); members
meet in a field by entering it from the same pod's village, so ADR-0034's amendment of ADR-0030
(teammates share fields) still holds.

**Delivery is by pod inbox letters.** The pod that makes a change looks each member's pod up in
the presence index and sends a `party_update` letter to that pod's inbox. A member arriving on a
pod reads the full party state from Redis.

**Each pod caches the parties of the players connected to it.** Reads (frames, panel, party chat
audience, field loot allocation) come from the cache; writes go to Redis; letters update the cache;
a periodic re-read corrects any missed letter. The hub loop and world ticks never wait on Redis.
A stale cache can only affect an early refusal or what is shown, never an outcome: the script
decides against Redis. A run snapshots what it needs from its party at entry (ADR-0035).

**The presence index covers every connected player** with a character, with their pod and world,
not only hub-seated players.

**Members are kept alive by TTL.** Each member's record is refreshed by the pod they are on now;
it shows `away` after about 30 seconds without a refresh, for every kind of drop (a deliberate
buffer, so a refresh or a brief drop never flashes "away"), and the member is removed, with
succession if they led, by the next pod to touch the party once the record expires after 5 minutes.

## Consequences

- **Redis is a hard dependency for every party mutation.** While it is down, no one can invite,
  accept, leave, kick or transfer; reads keep working from the pods' caches, and runs are
  unaffected. Mitigation: run Redis highly available (Sentinel, or a managed standard tier); the
  client is already `redis.UniversalClient`. A Redis restart without persistence loses every party,
  which ephemeral parties (ADR-0035) accept. Under ADR-0034 a Redis outage stopped only cross-pod
  party traffic; now it stops all of it. Accepted.
- **No hand-over protocol, ever.** Leadership changes and pod deaths move no state.
- **Concurrency moves from one goroutine to Redis.** ADR-0034's "one hub loop serialises a party"
  becomes "one script serialises each mutation". Rules stay testable in Go; the scripts stay small,
  and need their own tests (miniredis runs Lua).
- **Every party action is asynchronous on the pod:** the Go pre-checks run on the loop, the script
  runs off it, and the answer comes back to the loop (the pattern FS-R82NV slice 3 introduced).
- **Fan-out costs a presence lookup per member per change.** Party changes are click-rate, so this
  is negligible; a letter missed during a move is covered by the arrival read.
- **Party chat (FS-XGW7H) must cross pods**, presumably by the same inbox fan-out. That spec has to
  say so; ADR-0034's "party chat is delivered in-process" no longer holds.
- **Loot (FS-V780R) is allocated only among members in the pickup's world**, read from the cache.
- **Reconnecting to the pod that still holds a player is a separate, general capability**
  (FS-MCYWK), not a party rule: ADR-0034's recall of a member to the party pod is gone.
- **What FS-R82NV built carries over unevenly.** The same-pod party merges first and is then
  rebuilt on Redis; FS-R82NV slice 3's presence keeper, pod inbox and ordered writer carry into
  FS-NCC9J; the planned hub-handoff-on-accept and expected-arrival slices are dropped.

### Rejected

- **A home pod** (ADR-0034) with leadership limited to members on it: cheaper, but neither a leader
  on any pod nor survival of a pod.
- **The home following the leader:** a hand-over protocol for state, open invites and replies in
  flight, for every transfer, succession and leader move.
- **One Redis channel per party** for fan-out: pods would subscribe and unsubscribe dynamically as
  members come, go and move, and miss updates at the edges.
- **Optimistic transactions (WATCH/MULTI)** or **a per-party lease lock** around Go read-modify-write:
  workable, but with invites reserving slots the atomic steps are small enough for Lua, which has no
  lock-holder-crash case.
- **Invites that reserve nothing**, fullness checked only at accept: simpler, but an invitee could be
  told "full" after being invited, and invites could be spammed.
- **The client remembering its pod** for reconnects: lost on another computer or browser (see FS-MCYWK).
