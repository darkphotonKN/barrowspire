# FS-K2HKP: Cross-replica matchmaking and handoff

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Session & matchmaking lifecycle" → "Matchmaking across replicas", "### Cross-context flows" → "Start-a-delve distributed coordination"; `game-client/SPECIFICATION.md` "### Hub" → "Follow a handoff to another server" → this FS · Related ADRs: [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md) (superseded by this feature together with FS-JEAVX — superseding ADR pending via record-decision), [ADR-0004](../adr/0004-game-traffic-bypasses-the-application-gateway.md) §3 (comes back into force) · Depends on: [FS-JEAVX](JEAVX-hub-shared-across-replicas.md) · Supersedes: [FS-29KSH](29KSH-hub-world-and-delve-entry.md) R20–R21 for hub → run only · Project context: [`docs/refactor_plan.md`](../refactor_plan.md) (START-A-DELVE saga) · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md) (*handoff* is redefined here; *pod id*, *pod address*, *host pod*, *queue entry*, *expected player*, *seat*, *pod liveness* pending via domain-model)

## Summary

With FS-JEAVX the HUB world spans several `game-service` replicas, but a run is one ECS world
in one replica's memory, and each player's WebSocket lives on whichever replica they connected
to. This feature lets players queued on **any** replica be matched together: the queue lives in
Redis, and each queue entry carries the player's pod and the character they are playing. One
replica matches; the replica hosting the run creates it at once from those characters and it
starts ticking; every matched player **on another replica hands off** — their client opens a
new socket to the host with the same JWT it already has, and drops the old one. The host
recognises them by the JWT's member id against the run's expected players; no ticket is needed.
Players join the running delve as they arrive; one who doesn't arrive within 15s is simply
left out. The return to the HUB world after the run needs no reconnect, because the HUB world
is shared.

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
the host moves them into the run directly. Reconnecting them to their own pod would run the old
socket's disconnect path against the same player record the new socket just took over, and gains
nothing. Exercising the handoff therefore needs two replicas; on one machine that is a second
process on another port (`GAME_PORT`), with `POD_ADDR` defaulting from it.

**Why the character rides the queue entry (decision record).** The first floor is levelled to
the party (FS-77AB6 R22), so the host needs every player's character before it builds the run.
The origin pod already resolved that character from character-service at HUB entry, and
`find_game` refuses a player without one, so it is in hand at queue time: a few small,
server-resolved fields (id, name, class, level, experience), never client input. Writing it into
the queue entry means the match arrives at the host complete: the host builds the run at once,
levelled to the real party, and an arriving player only needs their loadout fetched. The
alternative — loading characters as players arrive — would force the floor to be built before
the party's levels are known, or the run to wait for everyone. Levels don't go stale while
queued: experience is only earned in runs, and a queued player can't switch character (R7a).

**Why the run starts without waiting for everyone (decision record).** A delve is PvE, not a
balanced PvP match: a missing player makes it harder, not void. So the run ticks from the moment
it is created, players already on the host are in it at once, and the others join a live floor
as they arrive, each delayed only by their own reconnect. The compensation shrinks to releasing
seats nobody claimed — no abort, no re-queue, no players dragged back to the HUB world because
someone else's network failed.

**Why no handoff ticket (decision record).** A ticket is a bearer capability: it lets a
destination admit a client it cannot otherwise identify, or one it knew nothing about in
advance. Neither holds here. Every replica verifies the same JWT, so the host knows who
connected; and the host created the run with its expected players before anyone was told to
move, so it knows who is expected. JWT identity plus an expected-player seat proves everything a
ticket would, without a Redis key per player, a single-use redemption, or a second expiry to
keep in step with the seat timeout.

**Why the host announces the handoff, not the matcher (decision record).** Pub/sub delivers to
each subscriber independently, with no order between them. If the matcher told every pod at
once, a player's pod could send them on their way before the host had created the run, and
they would arrive with nothing to join. So the matcher tells only the host; the host creates the
run, then tells the other pods to send their players over. By the time any player is told to
move, the run expecting them exists.

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
   `RPUSH queue <playerID>` and a **queue entry** in the `player:pod` hash,
   `HSETNX player:pod <playerID> <entry>`, where the entry is JSON: the player's pod id and the
   **character in play** the pod resolved at HUB entry,
   `{pod, character: {id, name, class, level, experience}}`. Queueing twice is rejected as today
   (`ErrPlayerAlreadyQueued`).
7. `leave_queue` removes the player: `LREM queue 0 <playerID>` and `HDEL player:pod <playerID>`,
   and replies only after removal. (Fixes the existing bug where `leave_queue` replied
   "Successfully left the queue" without removing anyone.)
7a. `enter_hub` as a different character while queued is refused until the player leaves the
    queue, so the character in the queue entry is always the one they are playing.
8. A disconnect while queued removes the player the same way.
9. The queue progress panel (`queue_status {current,total}`) is fed from the global queue
   length, not a per-replica count. A pod finds its own queued players by the pod id inside each
   queue entry.
10. The in-process `queueService` is removed; Redis is the only queue.

### Matching

11. Every replica runs a matcher goroutine that ticks about once a second. Each tick it tries
    `AcquireLock("matcher", 3s)`; only the winner matches that round, then releases.
12. Matching pops **exactly `matchSize` players or none**, in one Lua script (length check +
    pop, atomic). `LPOP key count` alone is not used: it pops a partial group that then has to
    be pushed back, losing order and racing other replicas.
13. Before committing a match, the matcher drops any popped player whose pod (read from their
    queue entry) has no `pod:alive` key, cleans their `player:pod` entry, and pushes the
    surviving players back to the **head** of the queue (`LPUSH`) so they keep their place.
13a. A committed match returns each player's id, pod and character, from their queue entries.
14. The lock is for efficiency only: the Lua pop is what guarantees no player is matched twice,
    even if the lock expires mid-round and two matchers run.
15. Matchmaking is otherwise unchanged: `matchSize = 2`, first-come pairing (FS-29KSH R28).

### Allocation and handoff

16. The **host pod** is the pod of the first popped player.
17. The matcher publishes a match-start step **`host`** on the **host pod's channel only**,
    `PUBLISH pod:{hostPodID} <msg>`: `{step: host, pod: hostPodID, runID, players: [{playerID,
    podID, character}]}`, runID = random UUID. Every replica subscribes to its own
    `pod:{POD_ID}` channel. A matcher that is itself the host still publishes; there is one path.
18. On `host`, the host creates the run session at once from the match's characters, with the
    matched player ids as its **expected players**, and builds the first floor levelled to the
    full party (FS-77AB6 R22 holds unchanged). The run ticks immediately. It starts the seat
    timer (R25). There is no separate pending structure: the session holds who it expects.
19. Matched players already on the host pod are moved into the run at once (ordinary world
    switch, `world_entered` run), with no reconnect.
20. After creating the run, the host publishes a match-start step **`handoff`** on each other
    involved pod's channel, listing that pod's players only: `{step: handoff, pod, runID,
    hostAddr, players: [{playerID}]}`. It sends no handoff for its own players.
21. On `handoff`, a pod sends each listed player connected to it `world_handoff {addr, run_id}`
    through the normal per-connection writer. A listed player not connected there is skipped;
    their seat lapses (R25). The pod does not remove anyone from its HUB world and does not
    touch the queue.
22. The client connects to `addr` with its JWT (`?token=`, as today) **plus** `&run=<runID>`. The
    host checks the JWT's member is an expected, not-yet-seated player of that run, fetches their
    loadout (items-service) **before** taking the session's lock, then seats them in the running
    world and sends `world_entered` (run).
23. Once the new socket is accepted, the client closes its old socket with a normal closure
    (make-before-break). The old pod's normal disconnect path removes the player from its HUB
    world; FS-JEAVX expiry removes their ghost elsewhere. No "arrived" message is sent to the old
    pod.
24. A handoff connection is refused at the handshake (close code `4002`) when the member is not
    an expected player of that run, is already seated, the run is unknown or ended, their seat
    has been released (R25), or their loadout cannot be fetched. A refused member's seat stays
    open until released.

### Seat release (the saga's compensation)

25. A seat not filled within **15 seconds** of the run being created is released: the member is
    no longer expected, and a later handoff connection for it is refused (R24). The run carries
    on with whoever arrived. No abort, no re-queue.
26. If nobody has arrived after 15 seconds, the host shuts the session down. (An empty run
    otherwise only shuts down when someone leaves it, which never happens if nobody came.)
27. A player whose old socket is gone before the handoff (closed tab, dropped network) simply
    never arrives; R25 covers it. A handoff leaves nothing in Redis to expire.

### Return to the HUB world

28. When a run resolves, its players are switched into the **host pod's** HUB world, as today
    (FS-29KSH R22). No handoff, no reconnect.

### Client

29. The client handles `world_handoff` in its single world-transition point (ADR-0015 clause 4):
    open a socket to `addr` with the token and the run id, and only once it is accepted close the
    old socket with a normal closure, behind the existing transition into the run. A
    `world_handoff` for a run the client is already moving to is ignored.
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
3. As a player, I want to keep my place in the queue if my partner's server died before we were
   matched, so that someone else's failure doesn't send me to the back.
4. As a player, I want my delve to start even if my partner never makes it, so that someone
   else's connection doesn't cost me my run.
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
15. As the game-service operator, I want unclaimed seats to be released, and a delve nobody
    reached to shut down, on their own, so that abandoned runs don't linger.
16. As a developer, I want the handoff to reuse the JWT the client already has, so that there is
    no second credential to issue, redeem and expire.
17. As a developer, I want to run two replicas on my machine, so that I can test the handoff
    without a cluster.
18. As a developer, I want to test the queue, matcher, liveness and queue entries against
    miniredis, including TTL expiry, so that I can test timing without sleeping.
19. As a player, I want my character to come with me into the delve, so that I play the one I
    chose in the HUB world.
20. As a player already on the server hosting the delve, I want to go straight in without a
    reconnect, so that nothing can drop on the way.
21. As a player, I want to start playing the moment I arrive, so that I'm not waiting on anyone
    else's loading or latency.
22. As a player, I want monsters on the first floor matched to my whole party, so that a
    teammate arriving a second later doesn't find a floor levelled for someone else.
23. As a player, I want a handoff refused to leave me where I was, so that a failed move never
    disconnects me.
24. As a player, I want switching characters to be refused while I'm queued, so that I enter
    the delve as the character I queued with.
25. As the game-service operator, I want an arriving player's items-service call not to stall
    the run for everyone already in it, so that a slow dependency only delays the one joining.

## Acceptance Criteria

- [ ] With `POD_ID`/`POD_ADDR` unset, a single replica starts with local defaults and runs a
      full match end to end, with no handoff (both players are on the host pod).
- [ ] `pod:alive:{podID}` exists with ~3s TTL while the replica runs and disappears ≤3s after it
      stops ticking; it is deleted on graceful shutdown.
- [ ] `find_game` puts the player in the Redis queue with a `player:pod` queue entry holding their
      pod id and character in play; queueing twice is refused.
- [ ] `enter_hub` as a different character while queued is refused.
- [ ] `leave_queue` removes the player from both before replying; disconnect while queued does
      the same.
- [ ] `queue_status` reflects the global queue length.
- [ ] The in-process queue service is gone.
- [ ] With one player queued, the matcher pops nothing and the player stays queued in place.
- [ ] Two matchers running the same round never match the same player twice.
- [ ] A popped player whose pod (read from the queue entry) has no `pod:alive` key is dropped and
      cleaned up; the survivor is back at the head of the queue.
- [ ] A committed match returns each player's pod and character from their queue entries.
- [ ] The `host` step is published on the host pod's channel only; a `handoff` step on another
      pod's channel is published only after the host has created the run.
- [ ] On `host`, the run is created at once, its first floor levelled to the whole matched party,
      and it ticks without waiting for arrivals.
- [ ] Two replicas: a player queued on A and one queued on B end up in the same run on the host
      pod (first popped player's pod), playing the characters they queued with.
- [ ] Only players on other pods get `world_handoff`; a player already on the host pod is moved
      into the run without a reconnect.
- [ ] A handoff connection is refused with `4002` for a member who is not expected in that run,
      is already seated, whose seat was released, or for an unknown or ended run.
- [ ] The arriving player's loadout is fetched before the session's lock is taken.
- [ ] A seat unfilled after 15s is released and the run continues with whoever arrived; a run
      nobody reached after 15s is shut down.
- [ ] After the old socket closes, the player is gone from the old pod's HUB world and their
      ghost expires elsewhere.
- [ ] Run resolution returns players to the host pod's HUB world with no reconnect.
- [ ] Client: `world_handoff` connects with the token and run id and closes the old socket only
      after the new one is accepted, from the single transition point; on refusal or failure it
      stays in (or returns to) the HUB world on its original address.
- [ ] Client: main-menu cancel sends only `leave_queue`.
- [ ] Tests run against miniredis, using its clock (`FastForward`) for TTL and timeout cases.

## Edge States

- **Replica crash while players queued:** their entries stay until popped; R13 drops them.
  `player:pod` entries for players never popped stay as small leftovers — acceptable, they are
  overwritten if the player queues again.
- **Host pod crashes after the match, before arrival:** the run dies with it. Clients
  already told to move fail to connect and stay on (or fall back to) their original address
  (R31). If the original pod is the host, they reconnect to any address the client has. Nobody
  is re-queued automatically; they queue again.
- **Host pod never receives the `host` step** (crashed between pop and publish, or subscriber
  reconnecting at that moment): no run, no handoff; every matched player has been popped but
  is told nothing, and their queue panel stops updating. Accepted gap: they queue again by hand.
  Closing it needs a durable record of the match (Redis stream or Temporal), out of scope here.
- **Player arrives at the host before the run exists:** cannot happen; a player is only told to
  move after the host created the run (R20).
- **Host pod crashes mid-run:** the run is lost (as today on a single replica); players
  reconnect to the HUB world. Gear consequences belong to the GEAR ESCROW saga.
- **Matched player's source pod crashes before sending `world_handoff`:** that player never
  arrives; their seat is released (R25) and the run continues without them.
- **Player disconnects between match and handoff:** never arrives; R25.
- **Player leaves the queue at the same moment they are popped:** the pop wins; the `LREM` finds
  nothing; they receive `world_handoff` (or, on the host pod, are moved into the run) and may
  leave → the run continues without them.
- **Nobody arrives** (every matched player was on other pods and none made it): R26 shuts the
  session down after 15s.
- **Matcher lock expires mid-round (GC pause, slow Redis):** a second matcher may run; the Lua
  pop keeps the outcome correct (R14).
- **Someone else tries to take a seat:** the JWT names the member; a member who is not expected
  in the run is refused (R24). The character seated is the one from their own queue entry, never
  one named by the client.
- **Same member connects twice to the same run** (retry, two tabs): the first is seated; the
  second is refused as already seated (R24).
- **Player arrives after their seat was released** (slow network, >15s): refused (R24); they
  stay in the HUB world on their old socket.
- **Items-service slow or down when a player arrives:** only that player's join is delayed or
  fails; the running world is not locked during the call (R22). A failed loadout fetch refuses
  the connection like any other refusal.
- **Seated player disconnects mid-run:** the ordinary reconnect grace applies, on the host pod.
- **Queued player switches character:** refused while queued (R7a); after leaving the queue they
  may switch and queue again.
- **Queue entry is not valid JSON or lacks a pod** (corruption): treated like the existing missing
  pod case — the matcher errors, that player is popped, the others are restored in order.
- **Redis down:** no queueing or matching (refuse `find_game` with a message); runs already in
  progress continue unaffected; the HUB world degrades per FS-JEAVX.
- **Same player queued from two replicas (two tabs):** refused by the `player:pod` check
  (`HSETNX` or check-then-set inside the queue operation).
- **Handoff message to a non-host pod is lost** (subscriber reconnecting at that moment): that
  pod's players never get `world_handoff`; their seats are released (R25) and the run continues
  with whoever is in it.

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
- **Handoff tickets** (rejected above): the JWT plus the run's expected players replace them.
- **Rebalancing a run for players who never arrived** (monster levels stay set for the matched
  party).
- **Refreshing a queued character's data** (level, class) while queued: switching is refused
  instead (R7a).
- **Gear escrow across the handoff** — owned by the GEAR ESCROW saga; the host pod is where a
  checkout would happen.
- **Temporal** for this saga — revisit if compensation grows beyond TTLs and one timeout.
- **Closing the "host never receives the match" gap** (durable match record).
- **Smarter host choice** (least-loaded, drain-aware).
- **Party queueing, skill-based or region matching.**
- **Reconnecting into an in-progress run on another replica** after a dropped connection.
- Changing `matchSize`.
