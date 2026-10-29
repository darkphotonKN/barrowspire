# CONTEXT — game-service

Ubiquitous language for the **game-service** bounded context. Populate with `/domain-model`.
One term per line: **Term** — one-line definition. Keep consistent with the code and
this member's `SPECIFICATION.md`.

## The `hub` collision — read this first

**`hub` names two unrelated things in this service, and both keep their name.** This is a known
ambiguity, deliberately tolerated, so it is written down rather than left to bite:

- **HUB** — *a place.* The shared, long-lived world players gather in between runs, as
  [`/docs/refactor_plan.md`](../../docs/refactor_plan.md) names it.
- **message hub** — *a component.* The central WebSocket dispatcher (`messageHub.Run`,
  `internal/gameserver/hub.go`) that routes each connection's messages to the right world.

They have nothing to do with each other. A player is *in* the HUB; a message goes *through* the
message hub.

This collision is not theoretical — it derailed a round of FS-29KSH's scoping, where "do the HUB
and the tower share the same hub?" was asked about the world and answered about the dispatcher.
**When either could be meant, write the full term**: "the HUB world" or "the message hub", never
a bare "the hub". Renaming the dispatcher was considered and not taken.

## Terms

### Worlds

- **World** — one isolated ECS simulation: its own `EntityManager`, its own goroutines, its own
  fixed-timestep tick, no mutable state shared with any other world.
- **World type** — which kind of world: `hub` or `run`. Two types, one client. Gains `field`
  with FS-X2F2H (the client calls this **world kind**, mirroring `world_type` on the wire).
- **Hub** — the shared, long-lived world players occupy between runs. One per deployment,
  server-authoritative, capped. Same thing the refactor plan calls the **HUB**; never call it a
  lobby, a town, or a village in code.
- **Run** — a short-lived world built for one match, resolved and torn down. The original
  escape-run game loop. Also called an **instance** where allocation is the subject (ADR-0004,
  the refactor plan); prefer **run** for the world and **instance** only for the allocation unit.
  - Discussion in Chinese calls this 塔 ("the tower"). That is conversational shorthand only:
    it names no layer of the system, so it appears in neither code nor UI copy. **run** is the
    server's word and **delve** is the player's; 塔 is neither, and translating it into either
    one of them is a mistake.
- **Session** — the code-level struct owning a world and its loop (`internal/game`). One session
  per world, so a session is now either a hub session or a run session.
  - **`GameSession` in code means exactly this** — `GetGameSession`, `resolveGameSession`,
    `Player.CurrentGameSessionId`. The "Game" is inert: this service holds no other kind of
    session, and these names predate the hub. They cover **both** world types, so
    `GetGameSession` returning the hub is correct, not a bug, and there is no separate hub
    lookup to go looking for. Renaming was considered during FS-29KSH and declined: it touches
    30 sites across four packages to delete a neutral word, and the churn would land on top of
    the hub work in `git blame`.
- **Delve** — the *player-facing* word for entering a run, owned by
  [`game-client/docs/design-guideline.md`](../../game-client/docs/design-guideline.md). Server
  code says **run**; UI copy says **delve**. Do not mix them in one layer. "Delve" stays the
  Spire's own word: a field visit is not a delve.
- **Field world** (world type `field`, FS-X2F2H) — a long-lived world shared like the hub, with
  monsters and loot and **no queue**: anyone walks in through its gate. Not a run: it is not built
  for a match, never resolves, and is never torn down while its pod lives. Death in it costs
  nothing. Its gains settle when the player leaves, through the match-end outbox path as a
  `returned` result, but a field visit is still not a match; do not call it one.
  - **Gentle Meadows** — the easy field, east of the hub: open, hand-laid map, low-level animals.
  - **Forlorn Forest** — the harder field, west of the hub: a generated branching trail, zombies
    and the rare ghost (FS-3QHQZ).
- **Channel** — one pod's copy of a field world (ADR-0030). Every pod runs one channel of each
  field, created at boot; two players on different pods are in different channels of the same
  field. **Collides with the Redis pub/sub channel** (`matchstart:pod:<podID>`, the hub's state
  channel): when either could be meant, write "field channel" or "Redis channel", never a bare
  "channel".

### Moving between worlds

- **World switch** — moving a player from one world to another by removing their entity from the
  source world and creating it in the target. Internal to the process; the client neither
  reconnects nor re-authenticates ([ADR-0015](../../docs/adr/0015-hub-and-runs-share-one-process-and-one-connection.md)).
- **World identity** — the `(type, id)` pair a state broadcast carries so the client is *told*
  which world it is in rather than inferring it from the payload's shape.
- **Handoff** — moving a matched player from their pod to the **host pod** by reconnecting: the
  client opens a new socket to the host's pod address, then closes the old one (FS-K2HKP). Only
  across pods; a player already on the host pod gets a world switch instead. The two are never
  interchangeable: a world switch keeps the connection, a handoff replaces it.
  - **Handoff player** — a matched player on another pod, who will arrive by handoff
    (`ResolvedMatchedPlayers.HandoffPlayers`). Opposite of a **local player**.
  - **Local player** — a matched player already connected to the host pod, seated in the run at
    creation with a world switch (`ResolvedMatchedPlayers.LocalPlayers`).
  - **Arrival** — a handoff player's connection reaching the host, carrying `?session_id=`.
    Seated (`SeatArrival`) or refused with close code `4002`; never served half-seated.
- **Gate** (FS-0XMCP) — a fixed hub location a player walks into to go to a place, entry
  validated by proximity on the server. The **Spire gate** opens the queue panel (queue or solo
  start; the queue and handoff are unchanged); a **field gate** world-switches the player into
  that pod's channel of the field, never a handoff (ADR-0030). Each field has an entrance gate
  back to the matching hub gate. A gate is map data, not an NPC: it replaces the **Delve NPC** as
  the queue's entry point once FS-0XMCP ships.

### Hub population

- **Occupancy cap** — the maximum number of players the hub admits at once. Refusal at the
  door, not a queue.
- **Concurrency ceiling** — the whole-deployment player limit (50) that ADR-0015's single-process
  decision depends on. Distinct from the occupancy cap even when the numbers coincide: raising
  the ceiling reopens an ADR, raising the cap does not.

### NPCs

- **NPC** — a server-authoritative, non-player entity in the hub. Two kinds, below. Both are
  server-authoritative; only one of them moves.
- **Function NPC** — an NPC that *is* the entry point to a hub function, rather than
  decoration. **Stands at a fixed position** — its placement is map data, not something
  broadcast. Talking to one opens that function. The established pattern for reaching anything
  in the hub; expect more of them.
  - **Delve NPC** — opens the matchmaking queue.
  - **Storekeeper NPC** — opens the loadout.
- **Ambient NPC** — a wandering resident with no function attached, there to make the place feel
  inhabited. Server-authoritative and broadcast per tick, so every player sees one in the same
  position. Not decoration in the technical sense: it costs broadcast and server-side collision.

### Field combat (FS-X2F2H)

- **Kill credit** — in a field world, the XP and the loot roll of a kill belong to the player who
  lands the killing blow, and to no one else. Not shared, not split by damage dealt.
- **Killer-first window** — the 30s after a field kill during which only the killer may take the
  dropped pile; after it, anyone may. Kill credit decides who rolls the loot; the window decides
  who may pick it up.

### The message hub (the other `hub`)

- **Message hub** — the central WebSocket dispatcher (`messageHub.Run`). Owns which connection's
  messages reach which world, and fans a world's broadcasts back to that world's clients only.
  Always written in full to keep it apart from the HUB world.
- **Connection** — one client's WebSocket to one pod, held across any number of world switches on
  that pod and replaced only by a handoff. Never assume connection and world are the same
  lifetime, nor that a player keeps one connection from queue to run.

### Pods (FS-K2HKP)

- **Pod** — one running game-service replica. **pod** is the code's word (`podID`, `PodID`);
  **replica** is fine in prose about scaling. Both mean the same process, never a Kubernetes
  concept beyond that.
- **Pod id** — the pod's identity (`POD_ID`), the key for its liveness and its match-start
  channel. Opaque; never parsed.
- **Pod address** — the WebSocket URL that reaches **this exact pod** (`POD_ADDR`, `podAddr`). Sent
  as `addr` in `world_handoff`. A load-balanced address is wrong here, since it may land on another
  pod.
- **Pod liveness** — the `pod:alive:<podID>` key a pod refreshes about once a second with a 3s
  TTL, and deletes on graceful shutdown. A pod without one is treated as dead: its queued players
  are dropped at pop. Liveness, not a cleanup sweep, because a crashed pod never cleans up.
- **Host pod** — the pod a match's run lives on. Currently the pod of the first popped player.
  Every matched player ends the match connected to it, and returns to *its* HUB world.

### Matchmaking (FS-K2HKP)

- **Queue** — the global Redis list (`queue`) of player ids waiting for a match, shared by every
  pod. Not per pod.
- **Queue entry** — what the queue knows about one queued player, held in the `queue:entries`
  hash: their pod id and their character in play. The queue list carries only ids; the entry
  carries everything else.
- **Match start** — the message (`MatchStart`) a pod receives on its own `matchstart:pod:<podID>`
  channel. It comes in two **steps**, in order:
  - **`create`** — matcher to host pod only: build the run from these players.
  - **`handoff`** — host pod to each other involved pod, after the run exists: send these
    players to the host. Never sent by the matcher, so no player can be told to move before
    the run expecting them exists.
- **Session id** — the run's one id, minted when the host creates the session and named
  `session_id` on the wire. There is no separate run id or match id; do not introduce one.

### Seats (FS-K2HKP)

- **Seat** — a matched player's place in a run. A local player's seat is claimed at creation; a
  handoff player's seat is held for them until they arrive or it is released. Membership, not a
  position (see *arrival slot*).
- **Expected player** — a handoff player whose seat is held but not yet claimed. In code, an entry
  in the session's `playersPendingConnection`; the entry, not the arriving connection, carries
  the character they are seated as. Once seated, no longer expected.
- **Seat release** — dropping every unclaimed seat once `SeatReleaseAfter` (15s) has passed since
  the run was created; a later arrival for one is refused. If nobody is in the run at that point,
  the run is shut down. Checked in the tick; nothing waits on it.
- **Arrival slot** — a reserved spawn position in the party formation, kept for a handoff player
  so they stand with the party. A *position*, unrelated to whether they hold a seat; a run with
  none left spawns the arrival elsewhere.
