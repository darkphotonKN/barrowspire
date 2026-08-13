# 2D Multiplayer Game - Go Server Project

## Project Overview

Real-time 2D multiplayer game with Go backend and Phaser 3 frontend.

- Grid-based WASD movement
- Item interactions (pickup/drop/use)
- Authoritative server architecture
- **Focus**: Go learning and complex server implementation

## The Age of Barrowspire — MMO-RPG Refactor

This repo is a standalone fork of an instanced extraction game now being evolved into an
**MMO-RPG**. Target shape: one client, two world types —

- a persistent **HUB** (shared social/staging space; light sim = position sync + chat +
  presence + grouping), and
- **instanced ESCAPE RUNS** (the existing ECS game, spun up per party, authoritative,
  short-lived).

A **matchmaking/session** service brokers the flow (queue → allocate instance → seed roster
→ hand clients off → resolve → return to hub). Go concurrency model: hub = long-lived
per-player loop, each instance = isolated ECS world, matchmaking = coordinator.
Microservices stay structurally identical for now.

> **The repo is CURRENTLY IN A REFACTOR PHASE.** [`docs/refactor_plan.md`](docs/refactor_plan.md)
> is the authoritative source of truth for the current plan and status — **any task must
> consult it first.** So far ONLY rename + port-offset (runs alongside the original) and
> some client theming tweaks are done; the server is otherwise unchanged.

**Doc routing:**
- Whole-project refactor plan/status → [`docs/refactor_plan.md`](docs/refactor_plan.md)
- Game (ECS / escape-run) feature scope → [`game-server/game-service/SPECIFICATION.md`](game-server/game-service/SPECIFICATION.md) and [`game-server/game-service/CLAUDE.md`](game-server/game-service/CLAUDE.md)
- Any appearance work → [`docs/theming_plan.md`](docs/theming_plan.md) (plan/status) and the authoritative art spec [`game-client/docs/design-guideline.md`](game-client/docs/design-guideline.md)

## Technology Stack

### Backend

- **Language**: Go 1.21+
- **WebSocket**: `github.com/gorilla/websocket`
- **Architecture**: Entity Component System (ECS)n
- **Game Loop**: Fixed timestep (60 ticks/second)
- **Event Broker**: RabbitMQ
- **Service Discovery**: Consul

### Frontend

- **Engine**: Phaser 3 (TypeScript/JavaScript)
- **Langauge**: Typescript
- **Framework**: React for the Game and Platform UI

## Common Commands

```bash
# Run server
go run cmd/server/main.go

# Run tests
go test ./...

# Run tests with coverage
go test -cover ./...

# Build
go build -o bin/game-server cmd/server/main.go

# Format code
go fmt ./...

# Lint
golangci-lint run
```

## Backend Server (code inside /game-server)

### Project Structure for Individual Game-Server Microservices

This project focuse on a microservice architecture with the game-service
being the core following teh ECS pattern but also the below project structure and following the same SOLID principles etc as described below, where as all the rest follow the SOLID principles as well as a domain driven design lite (read following sections).

```
project-root/
├── cmd/
│   └── main.go              # Entrypoint only — wiring happens in config/
├── config/
│   ├── database.go          # DB connection + migrations
│   └── routes.go            # Route registration + dependency injection
├── internal/
│   ├── {domain}/            # One folder per domain (user, payment, order, etc.)
│   │   ├── model.go         # Entity + validation
│   │   ├── repository.go    # Data access interface + implementation
│   │   ├── service.go       # Business logic interface + implementation
│   │   └── handler.go       # HTTP handlers (defines its own Service interface)
│   ├── interfaces/          # Shared interfaces used across domains
│   ├── middleware/          # HTTP middleware
│   └── util/                # Generic helpers
├── migrations/              # SQL migrations (sequential numbering)
├── .gitignore/              # files to ignore, make sure we include binary build files and the like
├── .air.toml                # for air hotreloading when using make dev, make sure to configure to match where our main.go is, its NOT what is default init
└── Makefile
```

### Domain Package Pattern

Each domain is self-contained. Handler defines what it needs from Service. Service defines what it needs from Repository. This follows ISP — consumers own their interfaces.

```
internal/payment/
├── model.go         # Payment, Subscription entities
├── repository.go    # Repository interface + *repository implementation
├── service.go       # Service interface + *service implementation
├── handler.go       # Handler struct + Service interface it consumes
├── processor.go     # PaymentProcessor interface (for Stripe abstraction)
└── stripe.go        # Stripe implementation of PaymentProcessor
```

### Code Style (CRITICAL)

- Use `slog` for structured logging (NOT `log`)
- Error handling: wrap with `fmt.Errorf("context: %w", err)`
- Context propagation: always pass `ctx context.Context` as first param
- Naming: follow Go conventions (no get/set prefixes, no stuttering)

### Interface & Dependency Design

- **Define interfaces at point of use**, not implementation (consumer owns the interface)
- **Follow ISP**: interfaces expose only what the consumer needs
- **Follow DIP**: depend on interfaces, not concrete types
- **Follow IoC**: receiver controls dependencies (inject via constructor, never create internally)

Example — handler defines what it needs from service:

```go
// internal/payment/handler.go
type Service interface {
    CreateCustomer(ctx context.Context, userId uuid.UUID, email string) (string, error)
    ProcessPayment(ctx context.Context, req *PaymentRequest) (*PaymentResponse, error)
    // Only methods handler actually uses — NOT the full service
}
```

Example — service defines what it needs from repository:

```go
// internal/payment/service.go
type Repository interface {
    Create(ctx context.Context, payment *Payment) error
    GetByID(ctx context.Context, id uuid.UUID) (*Payment, error)
    // Only methods service actually uses
}
```

Example — cross-domain dependency via narrow interface:

```go
// internal/payment/service.go
type PaymentUserService interface {
    GetByID(ctx context.Context, id uuid.UUID) (*user.User, error)
    UpdateStripeCustomer(ctx context.Context, userID uuid.UUID, customerID string) error
    // Only what payment service needs from user service
}
```

### Testing Requirements

- **TDD workflow**: Write failing tests first, then implement
- Test files live next to implementation: `service.go` → `service_test.go`
- Use table-driven tests for multiple cases
- Integration tests use `internal/testutil/suite.go` for setup

```bash
make test                    # All tests
make test-payment           # Single domain
go test ./internal/payment -run TestSpecificFunction -v
```

### Git Workflow

- Commit messages: `type: description` (feat, fix, test, refactor, chore, docs)
- Commit tests separately from implementation when doing TDD
- Never commit code that fails `make lint && make test`

### Architecture Rules

<!-- Add project-specific rules here -->

- All external services (Stripe, SendGrid, etc.) must be behind interfaces
- Database queries only in repository layer
- Business logic only in service layer
- Handlers do: parse request, call service, format response — nothing else
- No domain logic in handlers

### Environment Variables

```bash
# Required
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=password
DB_NAME=myapp

# Optional
PORT=8000
JWT_SECRET=xxx
```

## Common Patterns

### Creating a New Domain

1. Create folder: `internal/{domain}/`
2. Create files: `model.go`, `repository.go`, `service.go`, `handler.go`
3. Define interfaces at consumer level (handler defines Service interface, etc.)
4. Wire up in `config/routes.go`
5. Add migration if needed

### Adding External Service Integration

1. Define interface in the domain that uses it: `internal/payment/processor.go`
2. Create implementation: `internal/payment/stripe.go`
3. Inject via constructor in `config/routes.go`
4. Write integration tests with real service in test mode

## What NOT To Do

- Don't use `log` package — use `slog`
- Don't create dependencies inside functions — inject via constructor
- Don't put business logic in handlers
- Don't define interfaces in the implementing package
- Don't use `panic` for error handling
- Don't skip tests
- Don't modify files outside the scope of the current task

### ECS Guidelines

- Components = pure data (no methods)
- Systems = all behavior
- [ADD YOUR RULES]

## Spec & docs routing

- **Tier-1 specs** — per-service `game-server/<service>/SPECIFICATION.md` and `game-client/SPECIFICATION.md` (thin, living index of that surface's capabilities). Root `SPECIFICATION.md` is the **service map only** — never capability lines.
  - **Thin spec lines are capability names only** — no design detail (that lives in the FS one hop away); sections grouped by bounded context, never by status; status lives in the checkbox. Full rule + survival test: `docs/specs/README.md`.
- **Tier-2 feature specs** — root `docs/specs/NNNN-*.md` (`FS-NNNN`, deep, write-once work orders), globally numbered across all services. Read an FS only when working that feature.
- **Decisions** — `docs/adr/` (Nygard ADRs, append-only, immutable).
- **Vocabulary** — per-service `CONTEXT.md`. Bounded-context terms live with their service, never at root — two services may legitimately use one word differently.
- **Tracker config** — `docs/agents/tracker.md`.
- **Conventions live in git next to the artifact they govern** — `docs/specs/README.md` defines the thin-line format, the FS lifecycle (`draft → work-order → shipped`), and FS contents (incl. `§API surface`); `docs/agents/README.md` defines `tracker.md`'s schema. Skills *point at* these conventions; they never embed a copy.

**Spec resolution.** A capability line goes in the `SPECIFICATION.md` of whatever surface changes. A feature spec gets the next **global** number in root `docs/specs/`. A cross-surface feature is **one FS** with a thin line per affected surface. New or redefined domain terms go to that service's `CONTEXT.md`. `game-server/common/` gets no spec — a behavior change there belongs to the FS of the feature driving it.

**Check `docs/adr/` before any architectural change** — a decision recorded there is a constraint, not a suggestion.

**Generated artifacts are never hand-edited** — proto-generated Go under `common/api/proto` is regenerated from `.proto`, never patched in place.

## Skills

`.claude/skills/` is a **symlink into the `ai-software-engineering` SSOT** — shared across repos and never edited from here. A change only barrowspire needs belongs in *this* file, not in a skill.

| Command                                | What it does                                                  |
| -------------------------------------- | ------------------------------------------------------------- |
| `/setup` (or `setup check`)            | Scaffold or audit the workspace structure; idempotent         |
| `/scope-it`                            | Explore requirements; lock them as thin lines + a draft FS    |
| `/write-a-spec`                        | Promote a capability into an `FS-NNNN` work order             |
| `/spec-to-issues docs/specs/NNNN-*.md` | Break a work-order FS into vertical-slice issues              |
| `/develop #N`                          | Implement one issue (RED → GREEN → REFACTOR, then pre-flight) |
| `/code-review`                         | Gate a diff (Standards + Spec axes)                           |
| `/spec-audit`                          | Periodic drift check against the thin specs                   |

**Disciplines** (invoke as needed): `challenge-me`, `record-decision`, `domain-model`, `deep-modules`, `architecture-sweep`, `spike`, `diagnose`, `write-tests`, `handoff`.

> `develop` refuses an issue that doesn't reference `Implements FS-NNNN §…`, and refuses one whose FS is still a `draft`.

### Workflow — two lanes, on purpose

**Frontend (game-client) — agent lane, spec-first:**

1. `/scope-it` (or `/challenge-me` first if the plan already arrived formed)
2. `/write-a-spec` → FS-NNNN
3. `/spec-to-issues docs/specs/[NNNN-slug].md`
4. `/develop #[issue]`
5. `/code-review`, then commit `feat(scope): description (#issue-number)`

**Backend (game-server) — human lane, code-first:**

- Mostly hand-coded, deliberately — this is the learning surface. **Default to NOT touching it.**
- Use `/develop` only for large features, and only when asked.
- Skipping the spec chain here is expected, not drift. `/spec-audit` reconciles it later — it flags "code has, spec lacks" so the thin line can be added after the fact rather than blocking the work.

### Project Structure for CLAUDE.md and claude rules

```
/
├── game-server/       ← Go backend (hand-coded, learning focus, unless overwritten, always default to NOT touching this)
│   └── CLAUDE.md      ← Server-specific patterns
├── game-client/       ← Phaser 3 + React frontend
│   └── CLAUDE.md      ← Client-specific patterns (if exists)
└── CLAUDE.md          ← This file (root, shared rules)
```

### When at root level

- Can run skills that affect either project
- Feature specs should specify which project: "game-client" or "game-server"
- Cross-project features: create separate issues per project

Requires: `gh auth login`

## The API contract

New to how the HTTP contract works here? Read **[`docs/contract-guide.md`](docs/contract-guide.md)**
first — it names the five artifacts, says which are authored and which are generated by a tool,
and explains what "the contract" means versus "the docs" versus "the spec".

Short version: `game-server/api-gateway/openapi.yaml` and `game-client/src/api/generated/` are
**derived from typed handler signatures and never hand-edited** — not by a person, not by an
agent. Edit the handler, run `make openapi && make client`, commit all three together.
