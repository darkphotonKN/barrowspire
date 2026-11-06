# ADR-0060 — A run floor's static layout is sent once as a floor map; snapshots drop walls and, on dungeon floors, are cut per recipient by distance

Status: accepted
Date: 2026-11-06
Scope: `game-service` run worlds and `game-client`'s run scene: the WebSocket messages between
them. Not the hub or field worlds, not the HTTP contract.
Specified by [FS-KE075](../specs/KE075-floor-1-dungeon.md) §F, §G, §H.40-41, §H.48.
Amends: none. [ADR-0015](0015-hub-and-runs-share-one-process-and-one-connection.md) (one process,
one connection; a floor change is not a world switch) stands unchanged.

## Context

Decided in the charter Nick approved on 2026-11-06 ("核准") as charter defaults A9 and A10, with
his later constraint "floor 1 only". Recorded without adversarial review: no `challenge-me` pass.

Forces:

- **Every tick re-sends everything.** A run's state, walls included, goes to every player 30
  times a second as JSON (`ClientGameState`, `types/messages.go:72-103`; `handler.go:439`),
  about 6–12 KB per player per tick at today's 1440×960.
- **Floor 1 becomes sixteen times the area** (FS-KE075): hundreds of wall rects and 45–70
  monsters. Sending all of it each tick to each player multiplies the bytes by the same order.
- **Walls never change during a floor.** They are rebuilt only on a floor change.
- **The client deletes what a snapshot omits** (`updateWalls` and the like), so leaving something
  out of a snapshot today means "it is gone".
- **Every outbound message can be dropped.** Sends are non-blocking and fail on a full queue
  (`gameserver/server.go:1418-1424`), and states are pushed from one goroutine per recipient
  (`session.go:1680-1684`), so a one-off message has no delivery or order guarantee against the
  states around it.
- **The per-recipient state aliases pooled slices** (FS-QG1HR D2 race B, open).

## Decision

1. **A run floor's static layout travels in one message, `floor_map`**: the floor's size, its
   wall rects, and on a floor built on a cell grid its cell size and regions. It is sent to a
   member after every `world_entered` for the run, to every recipient on every floor change before
   the new floor's first state, and on the client's request (`request_floor_map`, rate-limited).
   It is never sent per tick.
2. **Run snapshots carry no walls**, on every floor: one transport for layout, whichever generator
   built the floor. Anything that changes during a floor (doors opening, containers, monsters)
   stays in the snapshot.
3. **The client must survive a lost or late map.** It keeps the latest map outside the scene,
   builds a floor only once its map is in, asks again while a snapshot's floor has none, and drops
   a snapshot for a floor older than its map.
4. **On a dungeon floor (one built on a cell grid, ADR-0061), dynamic entities are cut per
   recipient by distance**: monsters, drop piles and containers are sent only within the
   **interest radius** (1600 px) of the recipient's interest centres (their body, or every living
   party member's when they have none). Party members and the floor's fixed interactables (doors,
   switch, escape door, stairs) are always sent. Today that is floor 1 only. Floors 2–3 are not
   cut: their 1440×960 has a 1731 px diagonal, so a cut would drop a corner monster and change
   today's play, which the owner ruled out ("floor 1 only").
5. **The client treats a missing dynamic entity as "out of range", not "destroyed"** on a cut
   floor: removing it replays nothing, and an entity that reappears is drawn in its current state
   with no one-shot effect.
6. **A cut list is a fresh slice**, never an alias of the pooled backend state.
7. **Interest is not anti-cheat and not visibility.** It is a bandwidth rule. What the player may
   see is the client's presentation (ADR-0063); a server-side visibility cut is a later decision,
   tied to interest management.
8. **Room roles stay server-only**; the map carries geometry, never what a room is for.

## Consequences

- Per-tick bytes on floor 1 are bounded by what lies within 1600 px of the party rather than by the
  floor's size; the map costs one message per floor per player (FS-KE075 measures both).
- A floor can no longer be drawn from a snapshot alone. A client that never gets its map asks for
  it; a server that never answers leaves the floor undrawn while play continues.
- The hub and field worlds still send walls per tick; moving them to the floor-map path is a
  separate decision when they grow.
- Off-screen entities can blink in and out at the radius; there is no hysteresis in v1.
- A later floor that becomes a dungeon floor gets interest with no new decision.
- Server-side fog, or any cut by what a player can see rather than how far it is, needs a new ADR;
  the interest cut here is the hook it would extend.
- The client's run state type gains a second source (map plus snapshot); code-review can flag any
  run-scene code that reads walls from a snapshot.
