# FS-0008: Hub world and delve entry

> Status: work-order · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Hub world" (shared hub world · hub is a safe zone · wandering NPCs with dialogue · hub occupancy cap), "### Session & matchmaking lifecycle" → "Switch a player between hub and run", "### Transport" → "World identity in the state protocol" + "Route client messages from server-held session state"; `game-client/SPECIFICATION.md` "### Hub" (hub scene · move between hub and run · delve entry from the hub · loadout access from the hub) → this FS · Related ADRs: [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md) (one process, one connection, 50-player ceiling), [ADR-0004](../adr/0004-game-traffic-bypasses-the-application-gateway.md) (§3 amended by ADR-0015) · Vocabulary: [`game-service/CONTEXT.md`](../../game-server/game-service/CONTEXT.md) · Project context: [`docs/refactor_plan.md`](../refactor_plan.md)

## Summary

Today a player who presses start is dropped straight into a matchmaking queue and then into an
escape run. This feature puts a **hub** in between: a shared, server-authoritative world
where players see each other walk around, and where delving is started by talking to an NPC
rather than by pressing a menu button.

The hub is the first world type this service has had besides the run. That forces a second
change alongside it: the client must be **told** which world it is in, and the message hub must
stop asking the client which world its messages belong to.

## Requirements

### The hub world

1. `game-service` builds exactly one **hub** world at startup and keeps it running for the
   life of the process. It is a `Session` like a run, with its own `EntityManager`, its own
   goroutines, and its own id.
2. The hub ticks at `GameFrameRate` (30 Hz), the same rate as a run. No per-world tick rate
   is introduced.
3. The hub map is **2000×1000** and is defined by hub-owned map data, not reused from
   `InitialMapObjects`.
4. The hub has **boundary walls** and **building obstacles** — buildings are exteriors only,
   with collision, and cannot be entered. They reuse the existing `Wall` entity; no new
   component type is required for them.
5. Movement in the hub uses the existing `MovementSystem` — spatial-hash bucketing,
   swept-AABB collision against walls, depenetration, player–player push, boundary clamp.
6. The hub is a **safe zone**. `attack` and `cast_skill` are rejected there and produce no
   effect on any entity. Combat exists only in runs.
7. The hub holds **no items, containers, doors, switches, or escape doors**. Its broadcast
   carries players and NPCs only.
8. The hub writes nothing to the database. Player position in the hub is never
   persisted.

### NPCs

9. **Function NPCs** stand at fixed positions defined in the hub map data. There are two:
   the **delve NPC** and the **storekeeper NPC**. Their positions never change and are therefore
   not re-broadcast per tick.
10. **Ambient NPCs** are server-authoritative entities that **wander randomly within an assigned
    region**: each picks a destination inside its region, walks to it, pauses, and picks another.
11. Ambient NPC movement runs through the same collision path as players, so they collide with
    walls, buildings, each other, and players.
12. An ambient NPC that becomes wedged — unable to make progress toward its destination for a
    bounded number of ticks — abandons that destination and picks a new one. Random walk against
    hard collision otherwise corners them permanently.
13. Ambient NPCs **can be interacted with** and respond with a single throwaway line. They have
    no function, open no UI, and hold no per-player state.
14. Both NPC kinds use the ECS `NPC` type tag, which is already declared and currently unused.

### World identity and message routing

15. A single outbound message tells a client which world it is in, carrying the world's
    **session id** and its **type** (`hub` or `run`). It is sent at three moments: on
    entering the hub after connecting, on entering a run, and on returning to the hub
    after a run resolves.
16. `session_id` is **removed from all inbound client messages**. The message hub routes on
    `Player.CurrentGameSessionId`, the server's own record, matching what `handler.go:510` and
    `hub.go:259` already do.
17. `ParsePayload` no longer reads `session_id`. The five unchecked type assertions that read it
    (`types/messages.go:73, 87, 100, 113, 130`) are removed with the field, not patched.
18. Outbound state broadcasts continue to carry `session_id` and additionally carry the world
    type.
19. `Player.CurrentGameSessionId` is never `uuid.Nil` for a connected, authenticated player: on
    connect it is set to the hub session before the first broadcast.

### World switch

20. Moving a player between worlds is an **internal migration** — remove the player's entity
    from the source world, create it in the target world — over one uninterrupted WebSocket
    connection. The client neither reconnects nor re-authenticates.
21. On a successful match, each matched player is switched from the hub to the newly built
    run.
22. On run resolution — escape, elimination, or the run ending for any other reason — each
    player is switched back to the hub and placed at the **fixed spawn point**. Escape and
    death land in the same place.
23. A player's hub entity does not persist while they are in a run: they are absent from the
    hub and from its broadcast, and do not count against the occupancy cap.

### Delve entry

24. Interacting with the delve NPC opens a **dialogue box with options**. The queue is joined
    only on the affirmative choice; walking into or past the NPC never queues a player.
25. A queued player continues to move around the hub normally.
26. Queue state is **private**: no other player can see that a player is queued, and it is not
    carried in the hub broadcast to anyone else.
27. A queued player sees a **persistent corner panel** showing queue progress, fed by the
    existing `queue_status {current,total}` message, visible anywhere in the hub.
28. Matchmaking behaviour is unchanged: `matchSize = 2`, random pairing, existing queue service.

### Loadout entry

29. Interacting with the storekeeper NPC opens the loadout UI. The loadout remains REST-only
    (`getItemInstances`, `getLoadout`, `PUT /api/items/loadout`) — no new endpoints, no new
    WebSocket actions.
30. The loadout is no longer reachable from the main menu.

### Occupancy

31. The hub enforces an **occupancy cap** on concurrent occupants.
32. When the hub is full, entry is refused before the player reaches it: the start action
    returns a refusal with a message and the player remains in the main menu. There is no
    admission queue and no waiting screen.
33. The occupancy cap is a hub-door check, not a WebSocket connection limit. Connections are
    not refused at the handshake.

### Client

34. The main menu keeps character select and create unchanged. Pressing start leads to the
    hub, not to the queue.
35. A new Phaser hub scene renders the hub map, players, both NPC kinds, and buildings,
    with a **camera that follows the player** across the 2000×1000 map.
36. The client updates its current world and switches scenes in **one place**, on the world
    identity message of R15. World changes are never inferred from broadcast shape.

## User Stories

1. As a player, I want to arrive in the hub after choosing my character, so that the game
   starts in a place rather than in a queue.
2. As a player, I want to see other players moving around the hub, so that the world feels
   inhabited by real people.
3. As a player, I want to walk freely around a hub world larger than my screen, so that it feels
   like a location rather than a menu backdrop.
4. As a player, I want walls and buildings to block me, so that the hub has shape.
5. As a player, I want residents wandering around, so that the place feels alive even when few
   players are online.
6. As a player, I want to talk to a resident and get a line back, so that I can tell they are
   there on purpose and not broken.
7. As a player, I want the NPC who sends me delving to always be in the same place, so that I
   can find it without hunting.
8. As a player, I want a dialogue box with a choice before I queue, so that I never end up
   queued by brushing past someone.
9. As a player, I want to keep walking around while I wait for a match, so that queuing does not
   pin me to a spot.
10. As a player, I want a panel that shows I am still queued, so that I do not forget and get
    surprised.
11. As a player, I want other players not to see that I am queued, so that my intentions are my
    own.
12. As a player, I want to change my loadout without leaving the hub, so that gearing up
    happens where I am rather than back in a menu.
13. As a player, I want to be moved into the run the instant a match is found, so that there is
    no extra step between deciding to go and going.
14. As a player, I want to land back in the hub when my run ends, so that the loop closes
    without me navigating anywhere.
15. As a player, I want to return to the same spawn point whether I escaped or died, so that the
    return is predictable.
16. As a player, I want the hub to stay peaceful, so that I cannot be attacked while
    deciding what to do.
17. As a player, I want my connection to survive going into and out of a run, so that nothing
    can fail between the hub and the tower.
18. As a player, I want to be told the hub is full rather than left waiting, so that I can
    decide for myself when to try again.
19. As a player who dropped connection in the hub, I want to come back to the spawn point
    cleanly, so that a brief disconnect is not a puzzle.
20. As a player, I want NPCs to be in the same place for me as for everyone else, so that I can
    tell someone where to stand.
21. As a developer, I want the hub to be a `Session` like a run, so that world lifecycle,
    ticking, and broadcasting have one shape and not two.
22. As a developer, I want the client told which world it is in, so that scene switching has one
    trigger instead of being inferred from payload shape.
23. As a developer, I want message routing to use the server's own record of a player's world,
    so that a client cannot address another world's session.
24. As a developer, I want `session_id` gone from inbound payloads, so that the five unchecked
    type assertions that panic on a missing value go with it.
25. As a developer, I want one message type covering all three world transitions, so that adding
    a fourth world later does not add a fourth message.
26. As a developer, I want the hub to reuse `MovementSystem`, so that collision behaviour
    does not fork into two implementations that drift.
27. As a developer, I want ambient NPCs to escape corners on their own, so that a wedged
    wedged NPC is not a bug report.
28. As a developer, I want the world-switch path to be a single seam, so that moving runs to
    their own processes later touches one place on the client.
29. As an operator, I want the hub to refuse entry above its cap, so that the process is not
    driven past what ADR-0015 assumed.
30. As an operator, I want players in runs excluded from the hub occupancy count, so that
    the cap measures who is actually in the hub.

## Acceptance Criteria

- [ ] Starting from the main menu lands the player in the hub, not in a queue.
- [ ] Two clients logged in as different players see each other move in the hub in real
      time.
- [ ] The hub map is 2000×1000; the camera follows the player and the map scrolls.
- [ ] Walking into a boundary wall or a building stops the player; no part of the map can be
      escaped.
- [ ] The delve NPC and storekeeper NPC are at fixed positions and are in the same positions for
      two different clients.
- [ ] Ambient NPCs move; two different clients observe the same ambient NPC at the same position
      at the same time.
- [ ] An ambient NPC placed against a corner does not remain stuck there indefinitely.
- [ ] Interacting with an ambient NPC returns a line and opens nothing.
- [ ] Interacting with the delve NPC opens a dialogue box; the queue is joined only on the
      affirmative option.
- [ ] Declining the dialogue leaves the player unqueued.
- [ ] A queued player can still move around the hub.
- [ ] A queued player sees the queue panel from anywhere in the hub; a second player looking
      at them sees no indication.
- [ ] Interacting with the storekeeper NPC opens the loadout, and equipment changes persist via
      the existing REST endpoints.
- [ ] The loadout cannot be reached from the main menu.
- [ ] `attack` sent from the hub changes no health value on any entity.
- [ ] Two players queueing are both switched into one run without either client reconnecting —
      verified by the WebSocket connection id being unchanged across the transition.
- [ ] On run end, both players are back in the hub at the fixed spawn point, whether they
      escaped or died.
- [ ] A player inside a run does not appear in the hub broadcast.
- [ ] The world identity message is received exactly at the three transitions in R15 and carries
      the correct type each time.
- [ ] No inbound client message contains `session_id`; a message that includes one anyway is
      routed by server state regardless.
- [ ] `grep session_id` over `ParsePayload` returns nothing.
- [ ] Sending a `move` message with no `session_id` does not panic the server.
- [ ] With the hub at its cap, a further player pressing start receives a refusal and stays
      in the main menu.
- [ ] A player who is in a run does not count toward the hub cap.
- [ ] Disconnecting in the hub and reconnecting places the player at the fixed spawn point.
- [ ] `go test ./...` passes and `golangci-lint run` is clean.

## Edge States

**Empty**
- Nobody else in the hub: the player sees only ambient NPCs and the two function NPCs.
- Nobody else queued: the player waits indefinitely. This is expected — see *Accepted
  consequences*.

**Full**
- Hub at cap: start is refused with a message; the player stays in the main menu and retries
  at their own discretion. No admission queue is maintained.
- Hub at cap while players are in runs: those players are not counted, and their return is
  not blocked by the cap — a returning player is never refused entry to the hub.

**Disconnect**
- Disconnecting in the hub: treated as leaving. Reconnecting is a fresh entry at the fixed
  spawn point, matching R8's "position is never persisted". The existing 30-second reconnect
  window does not apply to the hub and the player does not hold a hub slot while
  disconnected.
- Disconnecting while queued: the player leaves the hub, so they leave the queue with it.
  Reconnecting means queuing again.
- Disconnecting inside a run: unchanged from today's behaviour (state kept, 30-second window).
- Disconnecting during a world switch: the switch either completed or it did not. A player who
  reconnects finds themselves in whichever world `Player.CurrentGameSessionId` names — the
  server's record is the single source of truth for this, which is the point of R16.

**Concurrent**
- Two players interacting with the delve NPC in the same tick: both queue; if that reaches
  `matchSize`, both are matched into the same run.
- The last hub slot contested by two players: one gets it, the other is refused. The cap is
  checked server-side, not by the client.
- A match completing at the same moment a player disconnects: the disconnect path and the
  world-switch path both act on `Player.CurrentGameSessionId`; the run's existing
  last-player-leave teardown handles the case where nobody arrives.

**Unauthorized / malformed**
- An inbound message carrying a `session_id` for a world the player is not in: ignored. Routing
  uses server state, so the field has no effect.
- A malformed payload missing a field: returns an error to that client. It must not panic — R17
  removes the assertions that currently would.
- `attack` or `cast_skill` in the hub: rejected. Not an error to the player necessarily, but
  no damage is applied.
- Interacting with an entity that is out of range or does not exist: the existing interaction
  range check applies; no NPC dialogue opens.

**Restart**
- A process restart destroys the hub and every in-progress run at once, and every player is
  disconnected. This is a known consequence of ADR-0015, not something this feature mitigates.
- The hub session gets a new id on restart. Clients are told the new id by R15's message on
  reconnecting; no client compares hub ids across connections.

## WebSocket message surface

This feature changes no HTTP endpoints. It changes the WebSocket contract, which
`game-service` owns directly (ADR-0004) and which is not part of the generated OpenAPI surface.

**Inbound (client → server)**

| Action | Payload change | Notes |
|---|---|---|
| `move` | **`session_id` removed** | Valid in both worlds |
| `interact` | **`session_id` removed** | Hub: NPC dialogue. Run: unchanged |
| `attack` | **`session_id` removed** | Rejected in the hub |
| `equip` / `unequip` | **`session_id` removed** | Run only |
| `cast_skill` | **`session_id` removed** | Rejected in the hub |
| `find_game` | unchanged | Sent on the affirmative dialogue option, not on a menu button |

**Outbound (server → client)**

| Message | Change |
|---|---|
| world identity (new) | `{session_id, world_type}` — sent on hub entry, run entry, and return. Whether `game_found` retires into this or remains as a named special case is settled at implementation; one payload shape either way |
| state broadcast | gains world type; keeps `session_id`; hub broadcasts carry players and NPCs only |
| `queue_status` | unchanged; now drives the corner panel |
| `end_game` | unchanged; followed by a world identity message for the return |

## Design decisions carried from scoping

Recorded with rationale so they are not relitigated. The architectural half of D1/D2/D3/D9 is
also in [ADR-0015](../adr/0015-hub-and-runs-share-one-process-and-one-connection.md).

- **D1 — The hub lives inside `game-service`.** Same process, port, and message hub as runs.
  Reuses auth, connection lifecycle, and reconnect handling as built.
- **D2 — One WebSocket connection for the whole session.** Departs from `refactor_plan.md:42`'s
  two-connection handoff and amends ADR-0004 §3. With every world in one process there is
  nothing to hand off, and one connection deletes the "failed to reconnect to the hub while
  holding loot" failure mode rather than handling it.
- **D3 — Everything rests on a 50-player concurrency ceiling.** 25 runs plus one hub = 26
  worlds at 30 Hz in one process. **Void the moment `game-service` needs a second replica** — the
  hub can only live on one pod, so a run allocated elsewhere is unreachable over one
  connection. Raising the ceiling reopens ADR-0015.
- **D4 — Runs are untouched.** `matchSize=2` random matchmaking and `RulesSystem` unchanged.
  Only the entry point moves.
- **D5 — NPCs are how hub functions are reached.** Delve and storekeeper today; expect more.
- **D6 — Two NPC kinds.** Function NPCs fixed (position is map data); ambient NPCs wander and are
  server-authoritative so everyone sees the same hub.
- **D7 — Hub collision is the runs' collision.** One `MovementSystem`, no fork.
- **D8 — 30 Hz.** Cap-dependent: at several hundred players the hub would become the most
  expensive world in the system, since it is the only one doing N per-player formats per tick.
- **D9 — Explicit world identity outbound; server-state routing inbound.** See R15–R19.
- **D10 — Fixed spawn point, no hub persistence.**
- **D11 — One hub, occupancy-capped, no sharding.**
- **D12 — Loadout moves into the hub.**
- **D13 — Main menu keeps character select/create.**
- **D14 — 2000×1000 with a following camera.** Roughly two screens wide, one and a half tall
  against a 1080×720 viewport.
- **D15 — Dialogue box with options.** Doubles as the confirmation that prevents accidental
  queueing. Not a dialogue tree.
- **D16 — Persistent corner queue panel.** Rejected showing it above the NPC: the player is
  explicitly allowed to walk away, which is exactly when they need to see it.
- **D17 — A full hub is refused at the main menu.** No admission queue, deliberately — the
  one queue that exists already has an unfixed exit.

## Rejected alternatives

- **Single-player hub** (client-only scene, or client-only with world types split
  server-side). The cheap path; explicitly turned down because seeing other players was the
  point.
- **A separate `hub-service`.** Auth, player identity, and reconnect written twice, and
  hub→run becomes a real cross-service problem, for headroom the cap says will not be used.
- **A deliberately extractable hub package inside `game-service`.** Pays a
  boundary-maintenance cost continuously and in practice is rarely cashed in.
- **Two WebSockets, tearing the hub connection down.** Reconnect at the worst moment —
  immediately after extraction.
- **Two WebSockets, backgrounding the hub connection.** The strongest rejected option and
  what the refactor plan actually specifies. Rejected only because at 50 players there is no
  second endpoint to reach.
- **Solo runs (one run per player).** Would have deleted matchmaking, turned the delve NPC into
  a door, doubled world count, and required changing `RulesSystem` (which ends a session at
  `activePlayers ≤ 1` and would end a solo run instantly). Reversed in favour of keeping
  existing matchmaking.
- **A lower hub tick rate** (5–10 Hz with client interpolation). Rejected once the ceiling
  dropped to 50.
- **Client-side ambient NPCs.** Free on the server, but each client would see its own residents
  in its own places. Consistency preferred, and it keeps the door open for ambient NPCs to gain
  function later.
- **Fixed patrol paths for ambient NPCs.** Predictable and collision-free, but mechanical and
  every NPC needs a hand-drawn route.
- **Mostly-idle ambient NPCs.** Cheapest broadcast, but the hub stops feeling lived in.
- **Keeping `session_id` inbound and adding a world type beside it.** The minimal diff.
  Rejected once it was established that the server already holds the routing answer — it
  preserves both the redundancy and the client-controlled route.
- **Replacing `session_id` with a `world {type, id}` object everywhere.** Churn: the id is not
  the new information, and `session_id` is a truthful name for both world types per
  `CONTEXT.md`.
- **Deferring the routing fix to a separate issue.** The hub is being touched either way;
  deferring means shipping the hub on a shape already known to be wrong.
- **An admission queue for a full hub.** A second queue to maintain while the first one's
  exit is still broken.

## Accepted consequences

- **Off-peak, the game cannot be entered.** With `matchSize=2` and random matchmaking, a player
  who queues when nobody else is queuing waits indefinitely. **Chosen, not missed** — do not
  investigate later as a bug.
- **A restart takes everything down at once.** One process holds the hub and every run.
- **The hub pod is a single point.** All players connect to it, its tick runs there, and it
  fans broadcasts to everyone. Sharding the hub and moving runs out are different problems;
  neither solves the other.
- **A player who queues deliberately cannot cancel.** D15 and D16 prevent accidental queueing and
  forgetting, but `leave_queue` remains broken and out of scope, so the only exit is closing the
  browser — and the queue still holds them.

## Out of Scope

- **Chat.** `chat` is declared on both client and server and implemented on neither; it stays
  that way.
- **Grouping / parties.** Until it exists, delve companions are random strangers.
- **Hub sharding.** One hub, no ids-for-later.
- **Fixing `leave_queue`.** Deferred work, not an accepted design. Currently broken two ways:
  `RemovePlayerFromQueue` is commented out, and the not-found path nil-derefs.
- **Moving runs to their own process or service.** R15's world identity message is the seam that
  keeps this cheap later; building it is a separate feature.
- **Any change to run gameplay** — combat placement, `RulesSystem`, item pickup, the known loot
  and item-count bugs.
- **Persistent player state** — accounts, inventory, progression across runs.
- **Dialogue trees**, per-player NPC memory, quests, or any dialogue data format beyond a fixed
  line and a two-option prompt.
- **Enterable interiors** or additional hub sub-areas.
- **Measuring actual process capacity.** ADR-0015 records that the 50 ceiling is a product
  decision and not a benchmark; a `/spike` would settle it and is not this work order.

## Open questions for implementation

Small enough to settle while building; recorded so they are settled deliberately.

- Does `game_found` retire into the world identity message, or survive as a named special case?
  One payload shape either way.
- Does `gameStore.sessionId` get renamed to `worldId`? Its meaning changes from "the run I am
  in" to "the world I am in".
- How are function NPCs made visually distinct from ambient NPCs, given both now respond to
  interaction? Owned by
  [`game-client/docs/design-guideline.md`](../../game-client/docs/design-guideline.md), not here.

## Housekeeping surfaced during scoping

Not this feature's work, recorded so it is not lost:

- `game-client/CLAUDE.md` says *"MAIN MENU label stays 'MAIN MENU' (a named hub is future
  game-logic work — do not rename it)"*. This feature **is** that future work; the note needs
  revisiting when the hub lands.
- `character-service` exists under `game-server/` but is absent from the root
  `SPECIFICATION.md` service map. Pre-existing drift, unrelated to this feature.
