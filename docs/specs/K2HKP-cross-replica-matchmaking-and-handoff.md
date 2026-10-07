# FS-K2HKP: Cross-replica matchmaking and handoff

> Status: draft · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Session & matchmaking lifecycle" → "Matchmaking across replicas", "### Cross-context flows" → "Start-a-delve distributed coordination"; `game-client/SPECIFICATION.md` "### Hub" → "Follow a handoff to another server" · Related ADRs: [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md) (to be superseded), [ADR-0004](../adr/0004-game-traffic-bypasses-the-application-gateway.md) §3 (comes back into force) · Depends on: [FS-JEAVX](JEAVX-hub-shared-across-replicas.md) · Project context: [`docs/refactor_plan.md`](../refactor_plan.md) (START-A-DELVE saga)

## Scoping notes (raw)

Split out of the FS-JEAVX scoping session (2026-10-07). This is the refactor plan's
**START-A-DELVE** saga ("matchmaking → allocation → client handoff; distributed coordination
where clients are external actors").

### Why this exists
Once the hub runs on several pods (FS-JEAVX), the in-process queue can only pair players on
the same pod. The first proposal was "just a Redis list: push on queue, pop N and start".
The list part works, but **a list holds player IDs, and a player's socket lives on one pod**.
If pod A pops `[p1, p2]` and p2 is connected to pod B, pod A cannot put p2 in its run: p2's
messages go to pod B. So a match across pods needs one client to move to the run's pod — the
handoff ADR-0015 removed.

### Options considered
- **A — global queue + client handoff. CHOSEN.** Matches happen across all pods; one client
  in each cross-pod pair reconnects to the pod hosting the run.
- **B — global Redis queue, but only same-pod players can match.** No client work, but
  players on a quiet pod wait even when a neighbor pod has a match ready. Rejected.
  (The agent initially recommended B because hosting was out of scope; Kranti chose A: it is
  the refactor plan's intent, and the hosting job comes next anyway — record what hosting
  needs, don't let it drive the design.)
- **C — keep the queue in-process, park cross-pod matching.** Rejected.
- **Saga via Temporal** (already used for settlement). Rejected for now in favor of **Redis
  TTLs + timeouts in code**: the failure cases are only "a ticket expired" and "a seat timed
  out", and it keeps the Redis practice. Revisit if compensation grows (e.g. gear escrow).

### The handoff, as code (agreed walkthrough)
0. **Pod identity — the only hosting seam.** Each pod reads `POD_ID` and `POD_ADDR` from env.
   `POD_ADDR` is a WebSocket address that reaches *this exact pod*. The code only reads it.
1. **Queue.** `find_game` → `RPUSH queue <playerID>` and `HSET player:pod <playerID> <POD_ID>`.
   `leave_queue` and disconnect → `LREM queue 0 <playerID>` and `HDEL player:pod <playerID>`.
2. **Match.** Every pod's matcher goroutine ticks ~1s; only the holder of a TTL lock
   (`AcquireLock("matcher", ~3s)`) matches. One **Lua script** checks the length and pops
   exactly N or nothing. (`LPOP key count` alone is atomic but pops a partial group, which
   then has to be pushed back, losing order and racing other pods.)
3. **Choose the host.** The **first popped player's pod hosts the run** — at least one player
   never moves.
4. **Notify.** Matcher sends `{runID, hostPodID, hostAddr, players}` on each involved pod's
   channel, `PUBLISH pod:{podID} <match>`. Every pod subscribes to its own `pod:{POD_ID}`.
5. **Host builds the run** and reserves a seat per player.
   - Players already on the host pod: internal migration, exactly as today (FS-29KSH).
   - Players on other pods: their pod creates a one-time ticket,
     `SET handoff:{ticket} {playerID, runID} EX 30`, and sends the client
     `world_handoff {addr, ticket}`.
6. **Client reconnects** to `addr` with its JWT plus the ticket. Host runs
   `GETDEL handoff:{ticket}` (atomic → one-time use), checks player + run, seats the player.
   Client then closes the old socket.
7. **Return is free.** When the run ends, the player's socket is on the host pod, so they enter
   *that pod's* hub. Because the hub is shared over pub/sub (FS-JEAVX), it doesn't matter which
   pod's hub they land in. **No reverse handoff.**
8. **Failure handling (the saga part).**
   - Remote player doesn't arrive before the ticket expires → host gives up the seat; run
     either starts short or aborts and re-queues the others (open — see below).
   - Host pod dies before the handoff → tickets expire; clients fall back to reconnecting to
     the hub on any pod.

### Recorded for the hosting job (next big job; do not let it change this design)
- **Each pod needs its own externally reachable address**, exposed as `POD_ADDR`. In k8s,
  typically a StatefulSet with per-pod DNS or per-pod ingress.
- **First connection can go to any pod**: any pod can serve the hub. No sticky sessions
  needed for it.
- **Every pod must reach Redis.** Game traffic still bypasses the gateway (ADR-0004).
- **Draining a pod on shutdown:** hub players can reconnect anywhere; players in a run on
  that pod lose the run. Policy is the hosting job's call.
- Goes into the superseding ADR's consequences too.

### Lane
- Server side: **human lane** (Kranti hand-codes). Agent help: tests (`miniredis` supports
  lists, Lua, pub/sub, TTL) and the Redis wiring slice from FS-JEAVX.
- Client side (`world_handoff` handling: open the new socket with the ticket, close the old
  one, one transition point per ADR-0015 clause 4): frontend is the **agent lane** per
  CLAUDE.md.

### Edge cases raised
- Pod crash leaves stale IDs in `queue` / `player:pod` → can be matched with a gone player.
  Needs cleanup: per-pod membership key with TTL that the matcher checks, or a sweep on
  startup. Not settled which.
- Matcher lock expires mid-match (GC pause, slow Redis) → two matchers. The Lua pop keeps a
  player from being popped twice; the lock only prevents wasted work.
- Ticket replay → `GETDEL` makes it one-shot.
- Player disconnects between match and handoff → seat timeout path.
- Player queued on pod B, then pod B dies → their entry is stale (see cleanup).

### Existing bugs found while scoping (touch when building the queue)
- `leave_queue` (`internal/gameserver/hub.go:272`) replies "Successfully left the queue" but
  never calls `PlayerRemoveQueue`; the player stays queued.
- `MainMenuScene.ts:838-839` cancel sends `leave_queue` **and** `find_game {cancel: true}`;
  the server ignores `cancel`, tries to queue again, and silently hits
  `ErrPlayerAlreadyInQueue`.

### Constraints referenced
- **Superseding ADR required** (routed to record-decision): replicas allowed; hub shared over
  Redis pub/sub; runs stay on one pod; matchmaking global with ticket handoff; ADR-0004 §3
  comes back into force.
- ADR-0015 clause 4 (world identity explicit in the protocol, one client transition point)
  is the seam `world_handoff` plugs into.
- Matchmaking otherwise unchanged: `matchSize = 2`, random pairing (FS-29KSH R28).

### Open questions (not settled)
- Missing player at seat timeout: start the run short, or abort and re-queue the rest?
- Stale-entry cleanup mechanism (TTL membership key vs startup sweep).
- Seat timeout length vs ticket TTL (30s proposed for the ticket).
- Does the host pod need to tell the source pod "player arrived" so it can release its hub
  state, or does the old socket closing cover it?
- Gear escrow at run start across pods — owned by the GEAR ESCROW saga, not here, but the
  host pod is where checkout would happen.
