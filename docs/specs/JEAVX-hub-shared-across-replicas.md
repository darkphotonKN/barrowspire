# FS-JEAVX: Hub shared across replicas

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Hub world" → "Hub shared across replicas", "Hub occupancy cap across replicas" → this FS · Related ADRs: [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md) (superseded by this feature — superseding ADR pending via record-decision), [ADR-0004](../adr/0004-game-traffic-bypasses-the-application-gateway.md) · Builds on: [FS-29KSH](29KSH-hub-world-and-delve-entry.md) · Followed by: [FS-K2HKP](K2HKP-cross-replica-matchmaking-and-handoff.md) · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md) (new terms *replica*, *ghost*, *pod id* pending via domain-model)

## Summary

Today the HUB world lives in one `game-service` process, so every hub player must be connected
to that one process. This feature lets `game-service` run as several **replicas** that together
present **one** HUB world: each replica simulates the players connected to it, publishes a thin
slice of their state to Redis pub/sub every tick, and merges what the other replicas publish
into the state it sends its own clients. A player sees everyone in the HUB world no matter
which replica either of them is connected to. The occupancy cap is enforced across all replicas.

Escape runs are untouched: each run stays an isolated world on one replica. Cross-replica
matchmaking is [FS-K2HKP](K2HKP-cross-replica-matchmaking-and-handoff.md).

**Lane:** human lane — hand-coded by Kranti. Agent help is limited to (a) writing tests and
(b) the Redis wiring slice (R1–R3). No pub/sub helpers or wrappers: publish and subscribe are
written directly against go-redis.

## Requirements

### Redis wiring (agent-assisted slice)

1. No new Redis layer is introduced. The existing `config.InitRedis` / `redis.UniversalClient`
   (`game-service/config/redis.go`, wired at `cmd/server/main.go:88-101` from `REDIS_MODE`,
   `REDIS_ADDR`, `REDIS_PASSWORD`) is the one client.
2. The raw `redis.UniversalClient` is **constructor-injected** from `main` through
   `SetupRouter` to the HUB world's `Session` (and anything else this FS adds that needs it).
   Nothing in this feature reads the `config.GetClient()` global.
3. The existing `cache.Cache` (`common/utils/cache`) stays available for key/value, TTL and lock
   operations. Pub/sub is **not** added to it; publish/subscribe use the raw client.

### Replica identity

4. Each replica has a **pod id**, read from the `POD_ID` env var. When `POD_ID` is unset (local
   dev), a random id is generated at startup and logged. The pod id is fixed for the life of
   the process.

### Publishing local HUB world state

5. Once per HUB world tick, after the systems run, the replica publishes one message to a single
   shared channel (`hub:state`) carrying its pod id and a **thin slice** of every player in its
   local HUB world.
6. The thin slice per player is: player id, username, class, position, direction. Nothing else
   — no inventory, equipment, health, mana, or escape flag.
7. NPCs, walls, buildings and other hub entities are **not** published (R14).
8. A replica with zero local HUB world players still publishes (an empty list), so other
   replicas can tell an idle replica from a dead one.
9. The payload is JSON, matching the WebSocket messages' existing encoding.
10. Only the HUB world publishes. Run worlds never publish to Redis.

### Receiving and merging remote state

11. Each replica subscribes to `hub:state` and keeps the latest received thin slice per remote
    player, with the time it was last received. The subscriber runs in its own goroutine and
    hands data to the tick without blocking it.
12. A replica **ignores its own messages** (matched by pod id).
13. Remote players are **ghosts**: they appear in the HUB world broadcast to local clients in
    the existing `players` map, in the same `PlayerState` shape, but they are **never ECS
    entities on this replica**. They do not collide, push, block, or pass through any system.
14. NPCs are local to each replica and not shared. Players on different replicas may see
    different ambient NPCs. Function NPCs are at fixed map positions, so they look the same
    everywhere.
15. **Ghost expiry:** a ghost with no update for **1 second** is removed from the merged view.
    This covers a dead replica, a player who left the HUB world for a run, and a disconnect.
16. If the same player id appears both locally and as a ghost (e.g. they moved replicas
    recently), the local entity wins and the ghost is dropped.
17. The client needs no change: ghosts arrive as ordinary entries in `players`.

### Occupancy cap across replicas

18. The occupancy cap (`constants.HubOccupancyCap`) is enforced against the **total** HUB world
    population across all replicas, not each replica's local count.
19. Each replica writes its local HUB world count to `hub:occ:{podID}` with a 3-second TTL,
    refreshed about once a second.
20. On HUB world entry (`Session.Admit` for the hub), the replica sums all `hub:occ:*` keys
    (using `SCAN`, never `KEYS`, then `MGET`) and refuses with the existing `ErrWorldFull`
    behavior when the total is at or above the cap.
21. A dead replica's count stops counting once its key expires (≤3s). There is no counter
    that needs a crash to be repaired.
22. The admission check is soft: concurrent entries on different replicas may overshoot the cap
    by a small number. No lock is taken around check-and-admit.

### Redis unavailable

23. The HUB world's local simulation never depends on Redis. If publishing or subscribing
    fails, the replica logs it (`slog`), keeps ticking, and serves its clients local-only
    (no ghosts). Ghosts age out under R15 on their own.
24. If the occupancy keys cannot be read, the replica falls back to its local count for the
    cap check and logs it.
25. The subscriber reconnects on its own when Redis comes back (go-redis `PubSub` behavior);
    ghosts reappear once messages resume.

### Lifecycle

26. Publishing and subscribing start when the HUB world session starts and stop on shutdown.
    On shutdown the replica deletes its `hub:occ:{podID}` key (best effort; the TTL covers a
    crash).

## User Stories

1. As a player, I want to see every player in the HUB world, so that the place feels shared
   even when the server is split across machines.
2. As a player, I want players on other servers to move smoothly enough to follow, so that the
   HUB world doesn't look broken.
3. As a player, I want to see other players' names and classes, so that I know who is around.
4. As a player, I want players who leave for a delve to disappear from my view, so that the
   HUB world shows who is really there.
5. As a player, I want players whose server crashed to vanish within a second, so that I am not
   looking at frozen statues.
6. As a player, I want my own movement to stay instant, so that sharing the HUB world doesn't
   add lag to me.
7. As a player, I want to never see myself twice, so that the HUB world isn't confusing.
8. As a player, I want the HUB world to keep working if the shared layer goes down, so that I
   can still move, talk to NPCs and queue.
9. As a player, I want to be refused at the door when the whole HUB world is full, so that it
   doesn't get overcrowded no matter which server I land on.
10. As a player, I want the HUB world to free up space when a server dies, so that I'm not
    locked out by players who are gone.
11. As a player, I want to walk through other servers' players without getting stuck on them,
    so that lag on their side never blocks me.
12. As a player, I want ambient NPCs to keep wandering on my server, so that the HUB world stays
    alive.
13. As the game-service operator, I want to add replicas without changing code, so that the
    HUB world scales by configuration.
14. As the game-service operator, I want each replica identified by a pod id in logs and keys,
    so that I can tell which replica did what.
15. As the game-service operator, I want local dev to work without setting `POD_ID`, so that a
    single replica runs as it does today.
16. As the game-service operator, I want a single replica to behave exactly as it does today,
    so that this feature is safe to ship before hosting changes.
17. As a developer, I want the raw Redis client injected rather than read from a global, so
    that I can test with miniredis.
18. As a developer, I want the run worlds untouched, so that this change can't break escape
    runs.

## Acceptance Criteria

- [ ] The raw `redis.UniversalClient` reaches the HUB world session through constructors; no
      new code calls `config.GetClient()`.
- [ ] With `POD_ID` unset, the replica starts, generates and logs a pod id.
- [ ] Every HUB world tick publishes exactly one `hub:state` message with the pod id and the
      thin slice (id, username, class, position, direction) of each local player; an empty
      HUB world publishes an empty list.
- [ ] Run worlds publish nothing.
- [ ] Two replicas against one Redis: a player on replica A appears in the `players` map sent to
      a client on replica B, and vice versa.
- [ ] A replica never shows its own players as ghosts.
- [ ] A ghost is never an ECS entity: a local player can walk through a ghost's position.
- [ ] Stopping replica A's publishing: its players disappear from replica B's broadcast within
      1s (+ one tick).
- [ ] A player who switches from the HUB world to a run on replica A disappears from replica B's
      view within 1s.
- [ ] When a player id is both local and a ghost, only the local entity is broadcast.
- [ ] NPCs are not published and do not appear as ghosts.
- [ ] `hub:occ:{podID}` holds the local count with a ~3s TTL, refreshed about once a second.
- [ ] HUB world entry is refused (`ErrWorldFull`, existing "The hub is full" client message)
      when the summed count across replicas is at the cap; allowed below it.
- [ ] A dead replica's occupancy stops counting within 3s.
- [ ] The occupancy sum uses `SCAN`, not `KEYS`.
- [ ] With Redis stopped mid-run: the HUB world keeps ticking, local players still move, errors
      are logged with `slog`, ghosts age out, and the cap falls back to the local count.
- [ ] With Redis restored, ghosts reappear without restarting the replica.
- [ ] On graceful shutdown, `hub:occ:{podID}` is deleted.
- [ ] A single replica (no others publishing) behaves exactly as today.
- [ ] Tests cover publish, receive, merge, self-filter, expiry, cap sum, and Redis-down, using
      miniredis (already in `common/go.mod`).

## Edge States

- **Empty:** no remote replicas → no ghosts; broadcast is local-only, as today.
- **Concurrent entry:** two replicas admit at the same instant near the cap → may overshoot by a
  few (R22, accepted).
- **Replica crash:** its ghosts expire in 1s on every other replica; its occupancy key expires
  in 3s.
- **Player moves HUB world → run:** they stop being published by their replica and expire from
  others within 1s. Returning publishes them again on the next tick.
- **Player reconnects to a different replica** (e.g. after FS-K2HKP's handoff, or a dropped
  socket): the new replica owns them locally; the old replica stops publishing them; any
  overlap is resolved by R16 until the old ghost expires.
- **Redis down / slow:** local sim unaffected; local-only view; cap on local count (R23–R25).
- **Late or out-of-order messages:** pub/sub may skip messages; the next tick replaces the last.
  A message older than the stored one for a player is not required to be detected — each
  replica publishes in order on one connection.
- **Malformed message on `hub:state`:** dropped and logged; never crashes the subscriber.
- **Ghost fields the client expects** (health, mana, equipment) are zero-valued. The HUB world
  is a safe zone, so no health bars depend on them.
- **Large population per replica:** message size grows linearly with local players; acceptable
  under the occupancy cap (40).

## Out of Scope

- **Hosting:** k8s manifests, replica counts, ingress, per-pod addressing, Redis deployment
  mode. Hosting prerequisites are recorded in FS-K2HKP and the superseding ADR.
- **Cross-replica matchmaking and the handoff** → FS-K2HKP.
- **Escape runs** — they stay on one replica and never use Redis.
- **Cross-replica player interaction** (push, trade, emotes, chat).
- **Sharing NPC state** between replicas.
- **Client-side ghost interpolation / smoothing.**
- **An exact (locked) occupancy cap.**
- **Pub/sub helpers or wrappers** around go-redis.
- **Changing the concurrency ceiling** — that belongs to the superseding ADR.
- Fixing `ReleaseLock`'s error formatting (spotted while scoping, not this feature).
