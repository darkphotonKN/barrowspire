# Refactor Plan — The Age of Barrowspire (extraction → MMO-RPG)

**This document is the source of truth WHILE the repo is in its refactor phase.** The root
[`/CLAUDE.md`](../CLAUDE.md) references it; **any task should consult this plan first.** It
records the current status, the target architecture, and the open design decisions.

---

## Current Status

This repo is a **standalone fork** of an instanced extraction game, being evolved into an
MMO-RPG. Done so far:

- ✅ **Rename + port-offset** — services/modules renamed and ports offset so this fork runs
  **alongside the original**.
- ✅ **Client theming tweaks** — some look-and-feel changes in the client (see
  [`theming_plan.md`](theming_plan.md)).

Everything else is **planned / not started**. The **server is otherwise unchanged** from the
original pure-extraction game — no hub, no persistence, no matchmaking broker, no DDD
services, no sagas yet.

---

## The Plan — Target Architecture

### Two world types, one client

- **HUB (persistent):** shared social/staging space. **Light sim only** — position sync,
  chat, presence, grouping. Long-lived.
- **INSTANCED ESCAPE RUNS:** the existing ECS game — spun up per party, authoritative,
  short-lived. Unchanged in spirit from the original game.

### Matchmaking / session broker

A matchmaking/session service brokers the flow between the two worlds:

```
party queues
  → allocate an instance (warm pool or spawn)
  → seed roster + run modifiers
  → hand clients off (tear down / background hub WS, connect to instance WS)
  → run resolves
  → results reported
  → clients return to hub
```

### Instance allocation model

- Start as **multi-instance-in-one-process**: multiple **isolated ECS worlds keyed by
  instance id** inside one process.
- The **matchmaking ↔ instance allocation CONTRACT stays generic** so allocation can later
  move to **process/container-per-instance** without rewriting client handoff.

### Go concurrency model

- **Hub** = a long-lived per-player loop.
- **Each instance** = an isolated ECS world.
- **Matchmaking** = a coordinator over the above.
- Microservices stay **structurally identical** for now.

---

## Design Stance — where DDD applies (and where it does NOT)

- The **core game loop is ECS + a message-hub pattern** coordinating WebSocket
  request/response. This is **coordination, NOT a domain model** — **do NOT apply DDD to
  it.** (Detail in [`/game-server/game-service/CLAUDE.md`](../game-server/game-service/CLAUDE.md).)
- **DDD applies to the SURROUNDING services** — these are the bounded contexts:
  **profile, inventory, economy/wallet, progression, matchmaking/market.**

### Persistent player state — a NEW requirement

The original escape game is **stateless per session**. The MMO requires **persistent player
state**: accounts, inventory, progression, and a durable profile in a DB. This is net-new
and underpins most of the bounded contexts above.

---

## SAGA Work

SAGAs coordinate **cross-context business transactions** across the DDD services above.
Candidates and verdicts:

| Flow | Verdict | Notes |
|------|---------|-------|
| **Player-to-player TRADE** | ✅ Saga | Pure two-party **atomic-swap** pattern. |
| **GEAR ESCROW across the run lifecycle** | ✅ Saga (**flagship**) | Checkout on delve → instance authoritative → return/forfeit on extract/death/crash. Includes **crash-recovery compensation**. |
| **START-A-DELVE** | ✅ Saga | Matchmaking → allocation → client handoff. **Distributed coordination where clients are external actors.** |
| **EXTRACTION REWARDS fan-out** | ❌ Not a saga | Usually **idempotent event fan-out**, not a coordinated transaction. |
| **PARTY FORMATION** | ❌ Not a saga | A **state machine**, not a saga. |

---

## Pointers

- Game (ECS / escape-run) feature status → [`/game-server/game-service/SPECIFICATION.md`](../game-server/game-service/SPECIFICATION.md)
- Game-service architecture/rules → [`/game-server/game-service/CLAUDE.md`](../game-server/game-service/CLAUDE.md)
- Look-and-feel plan/status → [`theming_plan.md`](theming_plan.md)
- Authoritative art spec → [`/game-client/docs/design-guideline.md`](../game-client/docs/design-guideline.md)
- Backend service architecture (existing) → [`/game-server/docs/ARCHITECTURE.md`](../game-server/docs/ARCHITECTURE.md)
