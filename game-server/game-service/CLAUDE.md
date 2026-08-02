# CLAUDE.md — game-service (The Age of Barrowspire)

## What This Service Is

The **instanced escape-run simulation**: authoritative, short-lived, **one isolated ECS
world per instance**. A party is allocated an instance, the run resolves, results are
reported, the instance is torn down. This is the original pure-extraction game loop —
unchanged so far in the MMO refactor.

> Refactor context lives in [`/docs/refactor_plan.md`](../../docs/refactor_plan.md).
> This service's feature list (DONE vs PLANNED) is [`SPECIFICATION.md`](SPECIFICATION.md) —
> **keep it current** as features land.

## Architecture: coordination, NOT a domain model

The core loop is **ECS + a message-hub pattern** coordinating WebSocket request/response.
This is real-time **coordination**, not business logic.

- **Do NOT apply DDD here** (no model/repository/service/handler layering for the game loop).
- DDD belongs to the surrounding bounded contexts (profile, inventory, economy, progression,
  matchmaking) — see the refactor plan. game-service is the engine they feed into.

## ECS Conventions

- **Components = pure data**, no methods.
- **Systems = all behavior**, stateless processors over components.
- Entities are IDs; the world is rebuilt per instance and discarded on teardown.
- Fixed-timestep authoritative tick; clients predict, server reconciles.
- Each instance keys its own ECS world by instance id — **no shared mutable state across
  instances** (this is what later allows process/container-per-instance).

## Message-Hub WebSocket Pattern

- A **long-lived goroutine per connection** handles that client's WS request/response.
- Messages are routed through the hub to the owning instance's world; broadcasts fan back
  out to that instance's clients only.
- Keep routing generic so the **matchmaking ↔ instance allocation contract** stays stable
  even as allocation moves from multi-instance-in-one-process to per-process later.

## Code Style

Follow the root [`/CLAUDE.md`](../../CLAUDE.md) Go conventions: `slog` (not `log`),
`fmt.Errorf("context: %w", err)`, `ctx` first, no `panic` for errors, inject dependencies
via constructor.
