# FS-K2HKP: Cross-replica matchmaking and handoff

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Session & matchmaking lifecycle" → "Matchmaking across replicas", "### Cross-context flows" → "Start-a-delve distributed coordination"; `game-client/SPECIFICATION.md` "### Hub" → "Follow a handoff to another server" → this FS · Related ADRs: [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md) (superseded by this feature together with FS-JEAVX — superseding ADR pending via record-decision), [ADR-0004](../adr/0004-game-traffic-bypasses-the-application-gateway.md) §3 (comes back into force) · Depends on: [FS-JEAVX](JEAVX-hub-shared-across-replicas.md) · Supersedes: [FS-29KSH](29KSH-hub-world-and-delve-entry.md) R20–R21 for hub → run only · Project context: [`docs/refactor_plan.md`](../refactor_plan.md) (START-A-DELVE saga) · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md) (*handoff* is redefined here; *pod id*, *pod address*, *host pod*, *handoff ticket*, *pod liveness* pending via domain-model)

## Summary

With FS-JEAVX the HUB world spans several `game-service` replicas, but a run is one ECS world
in one replica's memory, and each player's WebSocket lives on whichever replica they connected
to. This feature lets players queued on **any** replica be matched together: the queue lives in
Redis, one replica matches, and **every matched player hands off** — their client opens a new
socket to the replica hosting the run, carrying a one-time ticket, and drops the old one. The
return to the HUB world after the run needs no reconnect, because the HUB world is shared.

This is the refactor plan's **START-A-DELVE** saga, with Redis TTLs and code timeouts as its
compensation mechanism instead of Temporal.

**Lane:** human lane — Kranti hand-codes the queue/matcher and the handoff, pairing with an
agent for decisions and correctness. The only agent-owned work is the Redis test harness,
which touches no feature logic.

### Why a handoff, not a relay (decision record for the learner)

There are two ways to bring a run and its players together across replicas:

- **Relay** — replicas pipe a player's inputs and the run's state to each other over Redis.
  Right for the HUB world (FS-JEAVX): it only needs render-only ghosts, and a lost frame costs
  nothing. Wrong for a run: every input and every tick crosses the network twice, combat feels
  it, and the run fails if *either* replica has a problem.
- **Handoff** — the player's client opens a socket to the replica running the run. One reconnect
  behind the existing transition screen, then plain local traffic for the whole run. This is the
  standard shape (MMO dungeon instances, match lobbies handing clients a game server address).

**Always hand off, even on the same replica.** Every matched player reconnects to the run's
pod address, including players already connected to it. One code path instead of two, and a
single-replica dev setup exercises the whole handoff. The cost is a pointless few-ms reconnect
for same-replica players, hidden by the transition.

ADR-0015's worry — a reconnect *after* extraction, while holding loot — does not happen: when
the run ends the player's socket is already on the host pod, and they enter that pod's HUB world
with an ordinary world switch.

## Requirements

### Pod identity (the hosting seam)

1. Each replica reads `POD_ID` and `POD_ADDR` from env. `POD_ADDR` is a WebSocket URL that
   reaches **this exact replica**. Local dev defaults: `POD_ID` generated (shared with FS-JEAVX
   R4), `POD_ADDR` = `ws://localhost:5668/game/ws`.
2. The code only reads these values. How a replica gets a reachable address is the hosting
   job's concern (see *Hosting prerequisites*).

### Pod liveness

3. Each replica refreshes `pod:alive:{podID}` with `EX 3` about once a second for as long as it
   runs, and deletes it on graceful shutdown.
4. **Why:** the queue now lives in Redis and **outlives the replicas**. An in-memory queue dies
   with its replica, so it can never hold a dead player. A Redis queue can: if a replica crashes,
   its disconnect handlers never run, and its players' ids stay queued. Liveness lets the matcher
   tell a live entry from a dead one without anyone having to clean up after a crash.
5. **Why a heartbeat key and not a cleanup sweep:** a sweep on startup only runs if the crashed
   replica comes back; a replica that is scaled away never sweeps. A heartbeat with a TTL
   is "alive until proven otherwise by silence": nobody has to notice the death, Redis expires
   the key. 3s TTL vs 1s refresh tolerates two missed beats (GC pause, slow Redis) before
   declaring death.

### Queue

6. `find_game` (sent from the delve NPC dialogue) adds the player to one global Redis queue:
   `RPUSH queue <playerID>` and `HSET player:pod <playerID> <podID>`. Queueing twice is
   rejected as today (`ErrPlayerAlreadyInQueue`).
7. `leave_queue` removes the player: `LREM queue 0 <playerID>` and `HDEL player:pod <playerID>`,
   and replies only after removal. (Fixes the existing bug where `leave_queue` replied
   "Successfully left the queue" without removing anyone.)
8. A disconnect while queued removes the player the same way.
9. The queue progress panel (`queue_status {current,total}`) is fed from the global queue
   length, not a per-replica count.
10. The in-process `queueService` is removed; Redis is the only queue.

### Matching

11. Every replica runs a matcher goroutine that ticks about once a second. Each tick it tries
    `AcquireLock("matcher", 3s)`; only the winner matches that round, then releases.
12. Matching pops **exactly `matchSize` players or none**, in one Lua script (length check +
    pop, atomic). `LPOP key count` alone is not used: it pops a partial group that then has to
    be pushed back, losing order and racing other replicas.
13. Before committing a match, the matcher drops any popped player whose pod (`player:pod`) has
    no `pod:alive` key, cleans their `player:pod` entry, and pushes the surviving players back to
    the **head** of the queue (`LPUSH`) so they keep their place.
14. The lock is for efficiency only: the Lua pop is what guarantees no player is matched twice,
    even if the lock expires mid-round and two matchers run.
15. Matchmaking is otherwise unchanged: `matchSize = 2`, first-come pairing (FS-29KSH R28).

### Allocation and handoff

16. The **host pod** is the pod of the first popped player.
17. The matcher creates one **handoff ticket** per matched player:
    `SET handoff:{ticket} {playerID, runID, hostPodID} EX 15`, ticket = random UUID.
18. The matcher publishes the match on each involved pod's channel, `PUBLISH pod:{podID} <msg>`,
    including the host pod's: `{runID, hostPodID, hostAddr, players: [{playerID, ticket}]}`.
    Every replica subscribes to its own `pod:{POD_ID}` channel.
19. On receiving a match, the **host pod** builds the run with one reserved seat per player and
    does not start its tick until every seat is filled.
20. On receiving a match, every pod sends each of its matched local players
    `world_handoff {addr, ticket}`. This is sent to **all** matched players, including those
    already on the host pod.
21. The client connects to `addr` with its JWT (`?token=`, as today) **plus** `&ticket=<ticket>`.
    The host pod runs `GETDEL handoff:{ticket}` (atomic: a ticket works once), checks the
    ticket's player matches the JWT's player and that the run is on this pod, and seats the
    player. A world-identity message (`world_entered`, run) follows as today.
22. The client then closes its old socket. The old pod's normal disconnect path removes the
    player from its HUB world; FS-JEAVX expiry removes their ghost elsewhere. No "arrived"
    message is sent to the old pod.
23. A connection with an invalid, expired, reused, or mismatched ticket is refused at the
    handshake.
24. When all seats are filled, the run starts as runs start today.

### Seat timeout (the saga's compensation)

25. A seat not filled within **15 seconds** of the run being built aborts the run: the host pod
    tears it down, switches every player who did arrive into its own HUB world (ordinary world
    switch), and re-queues them at the head of the queue (`LPUSH`, `player:pod` = host pod).
    Arrived players are told the delve failed and that they are queued again.
26. Unused tickets expire on their own (R17); nothing deletes them.
27. A player whose old socket is gone before the handoff (closed tab, dropped network) simply
    never arrives; R25 covers it.

### Return to the HUB world

28. When a run resolves, its players are switched into the **host pod's** HUB world, as today
    (FS-29KSH R22). No handoff, no reconnect.

### Client

29. The client handles `world_handoff` in its single world-transition point (ADR-0015 clause 4):
    open a socket to `addr` with the token and ticket, then close the old socket, behind the
    existing transition into the run.
30. The main menu's cancel no longer sends `find_game {cancel: true}`; `leave_queue` alone
    cancels.
31. If the new socket is refused or fails, the client reconnects to its original address and
    enters the HUB world.

## User Stories

1. As a player, I want to be matched with anyone queued, so that I don't wait just because my
   partner landed on another server.
2. As a player, I want the move into a delve to feel like the transition I already see, so that
   switching servers is invisible to me.
3. As a player, I want to keep my place in the queue if my match falls through, so that someone
   else's failure doesn't send me to the back.
4. As a player, I want to be told when a delve failed to start and that I'm queued again, so
   that I'm not left on a blank screen.
5. As a player, I want leaving the queue to actually remove me, so that I don't get pulled into
   a delve I cancelled.
6. As a player, I want to never be matched with someone who has already left the game, so that
   I don't wait for a ghost partner.
7. As a player, I want the queue panel to show the real queue, so that its count means
   something.
8. As a player, I want returning from a delve to need no reconnect, so that I never lose my
   extracted loot to a dropped connection on the way home.
9. As a player, I want to keep moving around the HUB world while queued, so that waiting isn't
   dead time.
10. As a player, I want a failed reconnect to land me back in the HUB world, so that a hiccup
    doesn't log me out.
11. As a player, I want nobody else to be able to use my handoff, so that no one can take my
    seat.
12. As the game-service operator, I want any replica to be able to match, so that no replica is
    special and losing one doesn't stop matchmaking.
13. As the game-service operator, I want a crashed replica's queued players to drop out on
    their own, so that a crash doesn't poison the queue.
14. As the game-service operator, I want the replica's address to come from config, so that the
    hosting setup decides it, not the code.
15. As the game-service operator, I want abandoned handoffs to clean themselves up, so that
    Redis doesn't fill with dead tickets.
16. As a developer, I want one handoff path for every match, so that there is one thing to build
    and test.
17. As a developer, I want a single replica on my machine to run the full handoff, so that I
    can test it without a cluster.
18. As a developer, I want to test the queue, matcher, liveness and tickets against miniredis,
    including TTL expiry, so that I can test timing without sleeping.

## Acceptance Criteria

- [ ] With `POD_ID`/`POD_ADDR` unset, a single replica starts with local defaults and runs a
      full match end to end, including the handoff.
- [ ] `pod:alive:{podID}` exists with ~3s TTL while the replica runs and disappears ≤3s after it
      stops ticking; it is deleted on graceful shutdown.
- [ ] `find_game` puts the player in the Redis queue and `player:pod`; queueing twice is refused.
- [ ] `leave_queue` removes the player from both before replying; disconnect while queued does
      the same.
- [ ] `queue_status` reflects the global queue length.
- [ ] The in-process queue service is gone.
- [ ] With one player queued, the matcher pops nothing and the player stays queued in place.
- [ ] Two matchers running the same round never match the same player twice.
- [ ] A popped player whose pod has no `pod:alive` key is dropped and cleaned up; the survivor
      is back at the head of the queue.
- [ ] Two replicas: a player queued on A and one queued on B end up in the same run on the host
      pod (first popped player's pod), each having reconnected with a ticket.
- [ ] Every matched player gets `world_handoff`, including those already on the host pod.
- [ ] A ticket works once; a reused, expired, unknown, or other-player ticket is refused at the
      handshake.
- [ ] The run does not tick until all seats are filled.
- [ ] A seat unfilled after 15s aborts the run; arrived players are in the host pod's HUB world,
      told so, and at the head of the queue.
- [ ] After the old socket closes, the player is gone from the old pod's HUB world and their
      ghost expires elsewhere.
- [ ] Run resolution returns players to the host pod's HUB world with no reconnect.
- [ ] Client: `world_handoff` reconnects with the ticket and closes the old socket from the
      single transition point; on failure it returns to the HUB world on its original address.
- [ ] Client: main-menu cancel sends only `leave_queue`.
- [ ] Tests run against miniredis, using its clock (`FastForward`) for TTL and timeout cases.

## Edge States

- **Replica crash while players queued:** their entries stay until popped; R13 drops them.
  `player:pod` entries for players never popped stay as small leftovers — acceptable, they are
  overwritten if the player queues again.
- **Host pod crashes after the match, before arrival:** tickets expire in 15s; clients fail to
  connect and fall back to their original address (R31). If the original pod is the host, they
  reconnect to any address the client has. Nobody is re-queued automatically; they queue again.
- **Host pod crashes mid-run:** the run is lost (as today on a single replica); players
  reconnect to the HUB world. Gear consequences belong to the GEAR ESCROW saga.
- **Matched player's source pod crashes before sending `world_handoff`:** that player never
  arrives; R25 aborts and re-queues the other.
- **Player disconnects between match and handoff:** never arrives; R25.
- **Player leaves the queue at the same moment they are popped:** the pop wins; the `LREM` finds
  nothing; they receive `world_handoff` and may ignore it → R25 for the other player.
- **Matcher lock expires mid-round (GC pause, slow Redis):** a second matcher may run; the Lua
  pop keeps the outcome correct (R14).
- **Ticket replay or theft:** `GETDEL` makes it single-use; the ticket's player id must also match
  the JWT's.
- **Redis down:** no queueing or matching (refuse `find_game` with a message); runs already in
  progress continue unaffected; the HUB world degrades per FS-JEAVX.
- **Same player queued from two replicas (two tabs):** refused by the `player:pod` check
  (`HSETNX` or check-then-set inside the queue operation).
- **Pub/sub message to a pod is lost** (subscriber reconnecting at that moment): that pod's
  players never get `world_handoff`; R25 aborts and re-queues the others.

## Hosting prerequisites (recorded for the next job; not built here)

- Each replica needs its **own externally reachable WebSocket address**, given to it as
  `POD_ADDR`. In k8s, typically a StatefulSet with per-pod DNS or per-pod ingress routing.
- The **first connection can go to any replica**: any replica can serve the HUB world. No
  sticky sessions are needed for it.
- Every replica must reach Redis. Game traffic still bypasses the gateway (ADR-0004).
- **Draining a replica:** HUB world players can reconnect anywhere; players in a run on it lose
  the run. Drain policy (wait for runs to resolve, stop accepting matches as host) is the
  hosting job's call — it may want a "do not host" flag the matcher respects.
- Also goes into the superseding ADR's consequences.

## Out of Scope

- **Hosting**: manifests, addressing, ingress, Redis deployment mode.
- **Relaying run traffic between replicas** (rejected above).
- **Gear escrow across the handoff** — owned by the GEAR ESCROW saga; the host pod is where a
  checkout would happen.
- **Temporal** for this saga — revisit if compensation grows beyond TTLs and one timeout.
- **Smarter host choice** (least-loaded, drain-aware).
- **Party queueing, skill-based or region matching.**
- **Reconnecting into an in-progress run on another replica** after a dropped connection.
- Changing `matchSize`.
