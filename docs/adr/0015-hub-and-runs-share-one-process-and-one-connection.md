# ADR-0015 — The hub and escape runs share one process and one client connection, bounded by a 50-player concurrency cap

Status: accepted
Date: 2026-09-08
Scope: `game-server/game-service`, `game-client`
Amends: [ADR-0004](0004-game-traffic-bypasses-the-application-gateway.md) §3 (Decision clause 3 —
matchmaking hands the client the allocated pod's address)
Realized by: [FS-29KSH](../specs/29KSH-hub-world-and-delve-entry.md) (hub world and delve entry)

## Context

FS-29KSH introduces a second world type: a shared, persistent **hub** that players enter
before delving, with the existing escape run reached by talking to an NPC there. That raises a
question the codebase has never had to answer, because it has only ever had one world type:
**when a player moves between worlds, does the client reconnect?**

Two prior records already answered it, and both said yes.

**`docs/refactor_plan.md:42`** describes the handoff as:

```
→ hand clients off (tear down / background hub WS, connect to instance WS)
```

Two connections, two endpoints. And it says why, at `refactor_plan.md:51-53`: start with
multiple instances in one process, but keep the matchmaking ↔ allocation contract generic **so
allocation can later move to process/container-per-instance without rewriting client handoff.**

**[ADR-0004](0004-game-traffic-bypasses-the-application-gateway.md) §3** is stronger, because it
is an accepted decision rather than a plan:

> Because game-service pods hold world state, routing to them is **allocation**, not load
> balancing. Matchmaking allocates an instance and hands the client that pod's address.

That ADR already anticipated exactly this pair of world types — its Context names "the HUB is a
shared world and an escape run is an instance pinned to one pod" — and concluded that the client
is handed an address. Being handed an address means opening a connection to it.

### What is actually built

`game-service` is a single process holding `sessions map[uuid → *Session]`. Each session owns its
own `ecs.EntityManager` and goroutines and shares no mutable state. Worlds are already isolated
at the world level; they are not isolated at the process level, and nothing allocates them
anywhere but locally. The tick is 30 Hz (`common/constants/game.go:57`), and matchmaking pairs
players two at a time (`config/routes.go:48`, `NewQueueService(2)`).

### The force that decides it

**A concurrency ceiling of 50 players was set as part of FS-29KSH.** At that ceiling the whole
system is 25 runs plus one hub — 26 ECS worlds at 30 Hz — inside one process. That is not a
close call; it holds with room.

At that size the two-connection handoff has nothing to hand off. The run the player is being
sent to is already at the address the client is connected to. Building the handoff anyway would
buy cross-service authentication, two connection lifecycles, and a reconnect at the single worst
moment in the game loop: immediately after a run resolves, with the player carrying extracted
loot. One connection deletes that class of failure rather than handling it.

### Alternatives considered and rejected

- **Two connections, tearing the hub connection down** (one reading of
  `refactor_plan.md:42`). Rejected: returning to the hub becomes a reconnect that can fail
  right after a successful extraction.
- **Two connections, backgrounding the hub one** (the other, better reading — the hub
  socket stays open but idle while the run socket is live). This does *not* have the failure
  mode above and is the strongest version of the rejected option. Rejected only because at 50
  players there is no second endpoint for it to reach: the ceremony has no payload.
- **A separate `hub-service`.** Rejected: authentication, player identity, and reconnect
  handling would each be implemented twice, and hub→run would become a genuine
  cross-service problem, in exchange for scaling headroom the cap says will not be used.
- **Keeping the hub inside `game-service` but as a deliberately extractable package.**
  Rejected as a compromise that pays a boundary-maintenance cost continuously and, in practice,
  is rarely cashed in.

### Recorded after adversarial review

This decision was challenged before being locked. The grilling is what surfaced the ADR-0004
conflict, corrected the trigger condition from "if runs ever move to another service" to the
much lower "if `game-service` ever runs a second replica", and produced clause 4 below.

## Decision

**Within a 50-concurrent-player ceiling, the hub and every escape run live in one
`game-service` process, and each client holds exactly one WebSocket connection for its whole
session.**

1. The hub is a world type inside `game-service`, sharing the process, the `:5668` listener,
   and the message hub with escape runs. It is not a separate service and not a separate
   process.
2. Moving a player between the hub and a run is an **internal migration**, not a handoff:
   the server removes the player's entity from one world and creates it in the other, and
   re-routes that connection's messages. The client neither reconnects nor re-authenticates.
   There is no client handoff to keep generic, and `refactor_plan.md`'s "tear down / background
   hub WS, connect to instance WS" does not apply while this ADR stands.
3. **ADR-0004 §3 is amended, not overturned.** Its reasoning — that routing to world-holding
   pods is allocation and never round-robin — remains correct and remains binding the moment
   there is more than one pod. What is suspended is only its mechanism: while `game-service`
   runs as a single replica, matchmaking hands the client no address, because there is only one.
4. **The world a client is in is explicit in the protocol.** State messages carry world identity
   (type and id); the client is told it has changed worlds rather than inferring it from the
   shape of the broadcast, and consolidates that into one transition point. This is deliberate
   insurance: it is the seam an address is added to later, so that reinstating a real handoff is
   an extra step in an existing state machine rather than growing one from nothing.

### The condition this decision depends on

**Clauses 1–3 are void the moment `game-service` needs a second replica.** Not when runs move to
another service — a second replica is enough. The hub is a shared world and can therefore
live on only one pod; a run allocated to any other pod is unreachable over a single connection.
At that point ADR-0004 §3 resumes in full and a superseding ADR is required.

Raising the 50-player ceiling is therefore not a configuration change. It is a decision to
reopen this ADR.

## Consequences

**Accepted / positive:**

- No cross-service authentication, no second connection lifecycle, no ambiguity about which
  endpoint a reconnecting client belongs to.
- The "failed to reconnect to the hub while holding loot" failure mode does not exist,
  rather than being handled.
- Runs remain isolated at the world level exactly as built, so moving them to their own
  processes later is a relocation of `Session` and its systems, not a rewrite of them.
- Clause 4 keeps the cost of that later move concentrated in one place on the client.

**Costs / follow-ups:**

- **A restart takes down the hub and every in-progress run together.** With one process
  there is no partial-availability story: every deploy is a full outage for everyone online.
- **The single process is now also a single point for the shared world.** Every player connects
  to it, its hub tick runs there, and it fans hub broadcasts to everyone.
- **Sharding the hub and moving runs out are different problems, and neither solves the
  other.** Extracting runs leaves the hub a single pod; sharding the hub leaves runs
  co-resident. A future scaling effort must name which one it is doing.
- **The ceiling is unmeasured.** Nobody has established what one `game-service` process actually
  sustains; 50 was chosen as a product cap, not derived from a benchmark. A spike that spawns
  synthetic worlds until 30 Hz slips would tell us how much headroom the cap really has, and is
  cheap. Until then the cap's safety margin is an assumption.
- **Nothing enforces the ceiling's role as a constraint.** As with ADR-0004's clause 3, a
  deployment or config change can raise the player cap or add a replica without anything
  pointing at this ADR. There is no gate.
