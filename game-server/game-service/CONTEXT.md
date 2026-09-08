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

This collision is not theoretical — it derailed a round of FS-0008's scoping, where "do the HUB
and the tower share the same hub?" was asked about the world and answered about the dispatcher.
**When either could be meant, write the full term**: "the HUB world" or "the message hub", never
a bare "the hub". Renaming the dispatcher was considered and not taken.

## Terms

### Worlds

- **World** — one isolated ECS simulation: its own `EntityManager`, its own goroutines, its own
  fixed-timestep tick, no mutable state shared with any other world.
- **World type** — which kind of world: `hub` or `run`. Two types, one client, one process.
- **Hub** — the shared, long-lived world players occupy between runs. One per deployment,
  server-authoritative, capped. Same thing the refactor plan calls the **HUB**; never call it a
  lobby, a town, or a village in code.
- **Run** — a short-lived world built for one match, resolved and torn down. The original
  escape-run game loop. Also called an **instance** where allocation is the subject (ADR-0004,
  the refactor plan); prefer **run** for the world and **instance** only for the allocation unit.
- **Session** — the code-level struct owning a world and its loop (`internal/game`). One session
  per world, so a session is now either a hub session or a run session.
  - **`GameSession` in code means exactly this** — `GetGameSession`, `resolveGameSession`,
    `Player.CurrentGameSessionId`. The "Game" is inert: this service holds no other kind of
    session, and these names predate the hub. They cover **both** world types, so
    `GetGameSession` returning the hub is correct, not a bug, and there is no separate hub
    lookup to go looking for. Renaming was considered during FS-0008 and declined: it touches
    30 sites across four packages to delete a neutral word, and the churn would land on top of
    the hub work in `git blame`.
- **Delve** — the *player-facing* word for entering a run, owned by
  [`game-client/docs/design-guideline.md`](../../game-client/docs/design-guideline.md). Server
  code says **run**; UI copy says **delve**. Do not mix them in one layer.

### Moving between worlds

- **World switch** — moving a player from one world to another by removing their entity from the
  source world and creating it in the target. Internal to the process; the client neither
  reconnects nor re-authenticates ([ADR-0015](../../docs/adr/0015-hub-and-runs-share-one-process-and-one-connection.md)).
- **World identity** — the `(type, id)` pair a state broadcast carries so the client is *told*
  which world it is in rather than inferring it from the payload's shape.
- **Handoff** — reserved, and currently **not a thing this service does**. It means the
  two-connection transfer described at `refactor_plan.md:42`, suspended by ADR-0015. Do not use
  it for a world switch; the distinction is the whole point of that ADR.

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

### The message hub (the other `hub`)

- **Message hub** — the central WebSocket dispatcher (`messageHub.Run`). Owns which connection's
  messages reach which world, and fans a world's broadcasts back to that world's clients only.
  Always written in full to keep it apart from the HUB world.
- **Connection** — one client's WebSocket, held for the whole session across any number of world
  switches. One connection, many worlds — never assume connection and world are the same
  lifetime.
