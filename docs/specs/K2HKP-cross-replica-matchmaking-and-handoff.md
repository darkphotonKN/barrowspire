# FS-K2HKP: Cross-replica matchmaking and handoff

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Session & matchmaking lifecycle" → "Matchmaking across replicas", "### Cross-context flows" → "Start-a-delve distributed coordination"; `game-client/SPECIFICATION.md` "### Hub" → "Follow a handoff to another server" → this FS · Related ADRs: [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md) (superseded by this feature together with FS-JEAVX — superseding ADR pending via record-decision), [ADR-0004](../adr/0004-game-traffic-bypasses-the-application-gateway.md) §3 (comes back into force) · Depends on: [FS-JEAVX](JEAVX-hub-shared-across-replicas.md) · Supersedes: [FS-29KSH](29KSH-hub-world-and-delve-entry.md) R20–R21 for hub → run only · Project context: [`docs/refactor_plan.md`](../refactor_plan.md) (START-A-DELVE saga) · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md) (*handoff* is redefined here; *pod id*, *pod address*, *host pod*, *pending run*, *seat*, *pod liveness* pending via domain-model)

## Summary

With FS-JEAVX the HUB world spans several `game-service` replicas, but a run is one ECS world
in one replica's memory, and each player's WebSocket lives on whichever replica they connected
to. This feature lets players queued on **any** replica be matched together: the queue lives in
Redis, one replica matches, the replica hosting the run reserves a seat per player, and every
matched player **on another replica hands off** — their client opens a new socket to the host
with the same JWT it already has, and drops the old one. The host recognises them by the JWT's
member id against its reserved seats; no ticket is needed. The return to the HUB world after
the run needs no reconnect, because the HUB world is shared.

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

**Hand off only across replicas.** A matched player already on the host pod keeps their socket;
the host seats them directly. Reconnecting them to their own pod would run the old socket's
disconnect path against the same player record the new socket just took over, and gains nothing.
Exercising the handoff therefore needs two replicas; on one machine that is a second process on
another port (`GAME_PORT`), with `POD_ADDR` defaulting from it.

**Why no handoff ticket (decision record).** A ticket is a bearer capability: it lets a
destination admit a client it cannot otherwise identify, or one it knew nothing about in
advance. Neither holds here. Every replica verifies the same JWT, so the host knows who
connected; and the host reserved the seats itself before anyone was told to move, so it knows
who is expected. JWT identity plus a reserved seat proves everything a ticket would, without a
Redis key per player, a single-use redemption, or a second expiry to keep in step with the seat
timeout.

**Why the host announces the handoff, not the matcher (decision record).** Pub/sub delivers to
each subscriber independently, with no order between them. If the matcher told every pod at
once, a player's pod could send them on their way before the host had reserved their seat, and
they would arrive as an ordinary HUB player. So the matcher tells only the host; the host
reserves the seats, then tells the other pods to send their players over. By the time any
player is told to move, their seat exists.

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
17. The matcher publishes the match on the **host pod's channel only**,
    `PUBLISH pod:{hostPodID} <msg>`: `{runID, hostPodID, players: [{playerID, podID}]}`,
    runID = random UUID. Every replica subscribes to its own `pod:{POD_ID}` channel. A matcher
    that is itself the host still publishes; there is one path.
18. On receiving a match, the host creates a **pending run**: one reserved **seat** per matched
    player, keyed by player id, and starts the seat timer (R25). No run world exists yet.
    Matched players already on the host pod are seated at once, with the character on their
    player record.
19. Only after the seats exist, the host publishes a handoff on each other involved pod's
    channel, listing that pod's players only: `{runID, hostAddr, playerIDs}`. It sends no
    handoff for its own players.
20. On receiving a handoff, a pod sends each listed local player `world_handoff {addr, runID}`.
    A listed player no longer connected there is skipped (R27).
21. The client connects to `addr` with its JWT (`?token=`, as today) **plus**
    `&run=<runID>&character=<characterID>`, the character it is playing. The host checks the
    JWT's member holds an unfilled seat in that pending run, loads the character from
    character-service scoped to that member (as HUB entry does), and fills the seat. The player
    is in no world until the run starts or aborts; the client holds its transition meanwhile.
22. Once the new socket is accepted, the client closes its old socket with a normal closure. The
    old pod's normal disconnect path removes the player from its HUB world; FS-JEAVX expiry
    removes their ghost elsewhere. No "arrived" message is sent to the old pod.
23. A handoff connection is refused at the handshake (close code `4002`) when the member holds
    no unfilled seat in that run (unknown or finished run, not matched, already seated) or the
    character cannot be loaded for that member. The seat stays unfilled.
24. When every seat is filled, the host builds the run from the seated players' characters and
    it starts as runs start today; every seated player gets `world_entered` (run). Players who
    were on the host pod leave its HUB world only now. The full roster is known before the
    first floor is built (FS-77AB6 R22 holds).

### Seat timeout (the saga's compensation)

25. A seat not filled within **15 seconds** of the pending run being created aborts it: the host
    discards the pending run, switches every player who arrived by handoff into its own HUB
    world (ordinary world switch), and re-queues every seated player at the head of the queue
    (`LPUSH`, `player:pod` = host pod). Seated players are told the delve failed and that they
    are queued again.
26. Starting or aborting ends the pending run; a handoff connection for it afterwards is refused
    (R23). A handoff leaves nothing in Redis to expire.
27. A player whose old socket is gone before the handoff (closed tab, dropped network) simply
    never arrives; R25 covers it.

### Return to the HUB world

28. When a run resolves, its players are switched into the **host pod's** HUB world, as today
    (FS-29KSH R22). No handoff, no reconnect.

### Client

29. The client handles `world_handoff` in its single world-transition point (ADR-0015 clause 4):
    open a socket to `addr` with the token, the run id and its character id, then close the old
    socket with a normal closure, behind the existing transition into the run.
30. The main menu's cancel no longer sends `find_game {cancel: true}`; `leave_queue` alone
    cancels.
31. If the new socket is refused or fails, the client keeps its old socket and stays in the HUB
    world; if the old socket is already gone, it reconnects to its original address and enters
    the HUB world.

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
11. As a player, I want only me to be able to fill my seat in a delve, so that no one can take
    my place.
12. As the game-service operator, I want any replica to be able to match, so that no replica is
    special and losing one doesn't stop matchmaking.
13. As the game-service operator, I want a crashed replica's queued players to drop out on
    their own, so that a crash doesn't poison the queue.
14. As the game-service operator, I want the replica's address to come from config, so that the
    hosting setup decides it, not the code.
15. As the game-service operator, I want an abandoned delve to give up its seats on its own, so
    that a missing player never holds anyone else hostage.
16. As a developer, I want the handoff to reuse the JWT the client already has, so that there is
    no second credential to issue, redeem and expire.
17. As a developer, I want to run two replicas on my machine, so that I can test the handoff
    without a cluster.
18. As a developer, I want to test the queue, matcher, liveness and the seat timeout against
    miniredis, including TTL expiry, so that I can test timing without sleeping.
19. As a player, I want my character to come with me into the delve, so that I play the one I
    chose in the HUB world.
20. As a player already on the server hosting the delve, I want to go straight in without a
    reconnect, so that nothing can drop on the way.

## Acceptance Criteria

- [ ] With `POD_ID`/`POD_ADDR` unset, a single replica starts with local defaults and runs a
      full match end to end, with no handoff (both players are on the host pod).
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
- [ ] The match is published on the host pod's channel only; the handoff on another pod's channel
      is published only after the host has reserved the seats.
- [ ] Two replicas: a player queued on A and one queued on B end up in the same run on the host
      pod (first popped player's pod), playing the characters they entered the HUB world with.
- [ ] Only players on other pods get `world_handoff`; a player already on the host pod is seated
      without a reconnect.
- [ ] A handoff connection is refused with `4002` for a member with no unfilled seat in that run
      (not matched, already seated, unknown or finished run) or whose character cannot be loaded
      for them.
- [ ] The run does not tick until all seats are filled.
- [ ] A seat unfilled after 15s aborts the run; arrived players are in the host pod's HUB world,
      told so, and at the head of the queue.
- [ ] After the old socket closes, the player is gone from the old pod's HUB world and their
      ghost expires elsewhere.
- [ ] Run resolution returns players to the host pod's HUB world with no reconnect.
- [ ] Client: `world_handoff` connects with the token, run id and character id and closes the old
      socket from the single transition point; on refusal or failure it stays in (or returns to)
      the HUB world on its original address.
- [ ] Client: main-menu cancel sends only `leave_queue`.
- [ ] Tests run against miniredis, using its clock (`FastForward`) for TTL and timeout cases.

## Edge States

- **Replica crash while players queued:** their entries stay until popped; R13 drops them.
  `player:pod` entries for players never popped stay as small leftovers — acceptable, they are
  overwritten if the player queues again.
- **Host pod crashes after the match, before arrival:** the pending run dies with it. Clients
  already told to move fail to connect and stay on (or fall back to) their original address
  (R31). If the original pod is the host, they reconnect to any address the client has. Nobody
  is re-queued automatically; they queue again.
- **Host pod never receives the match** (crashed between pop and publish, or subscriber
  reconnecting at that moment): no seats, no handoff; every matched player has been popped but
  is told nothing, and their queue panel stops updating. Accepted gap: they queue again by hand.
  Closing it needs a durable record of the match (Redis stream or Temporal), out of scope here.
- **Player arrives at the host before their seat exists:** cannot happen; a player is only told
  to move after the host reserved the seat (R19).
- **Host pod crashes mid-run:** the run is lost (as today on a single replica); players
  reconnect to the HUB world. Gear consequences belong to the GEAR ESCROW saga.
- **Matched player's source pod crashes before sending `world_handoff`:** that player never
  arrives; R25 aborts and re-queues the others.
- **Player disconnects between match and handoff:** never arrives; R25.
- **Player leaves the queue at the same moment they are popped:** the pop wins; the `LREM` finds
  nothing; they receive `world_handoff` and may ignore it → R25 for the other player.
- **Matcher lock expires mid-round (GC pause, slow Redis):** a second matcher may run; the Lua
  pop keeps the outcome correct (R14).
- **Someone else tries to take a seat:** the JWT names the member; a member with no seat in the
  run is refused (R23). Another member's character id cannot be loaded for them (character
  lookup is scoped to the member).
- **Same member connects twice to the same pending run** (retry, two tabs): the first fills the
  seat; the second is refused as already seated (R23).
- **Seated player on the host pod disconnects while the run is pending:** their seat stays
  filled; when the run starts they are in it and the ordinary reconnect grace applies.
- **Redis down:** no queueing or matching (refuse `find_game` with a message); runs already in
  progress continue unaffected; the HUB world degrades per FS-JEAVX.
- **Same player queued from two replicas (two tabs):** refused by the `player:pod` check
  (`HSETNX` or check-then-set inside the queue operation).
- **Handoff message to a non-host pod is lost** (subscriber reconnecting at that moment): that
  pod's players never get `world_handoff`; R25 aborts and re-queues the others.

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
- **Handoff tickets** (rejected above): the JWT plus the host's reserved seat replace them.
- **Starting a run before every seat is filled** (late joiners on a live floor).
- **Gear escrow across the handoff** — owned by the GEAR ESCROW saga; the host pod is where a
  checkout would happen.
- **Temporal** for this saga — revisit if compensation grows beyond TTLs and one timeout.
- **Smarter host choice** (least-loaded, drain-aware).
- **Party queueing, skill-based or region matching.**
- **Reconnecting into an in-progress run on another replica** after a dropped connection.
- Changing `matchSize`.
