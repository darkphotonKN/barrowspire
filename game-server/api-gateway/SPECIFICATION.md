# SPECIFICATION — api-gateway

> ⚠️ **GENERATED DRAFT (spec-bootstrap).** Reverse-engineered from the code on
> 2026-07-24 — it captures what the gateway _does_, not what was necessarily
> _intended_. Correct it, don't trust it. Lines marked `> REVIEW:` are inferences or
> suspected accidents that a human must confirm. This is the "run zero" baseline; future
> `/spec-audit` runs are cheap deltas against it.

Living spec. Describes **behavior, routing surface, middleware, and downstream contracts** —
not code or file paths. Marked ✅ DONE vs ⏳ PLANNED. Cross-service architecture context:
[`/docs/refactor_plan.md`](../../docs/refactor_plan.md).

## Assumptions (verify these first)

- The gateway's job is **only** Gin HTTP routing + a middleware/setup suite + forwarding to
  downstream services (gRPC via Consul, plus one AMQP path). It holds **no business logic and
  no database of its own** — `cmd/main.go` explicitly notes it is stateless.
- Any in-repo DB artifacts (SQL migrations, `schema.sql`, local entity models) and any handler
  logic that duplicates a downstream service are **legacy** left over from before those
  concerns moved into their own services, and are **out of scope** for this spec. They are
  listed under [Legacy / to remove](#legacy--to-remove) rather than documented as behavior.
- Downstream services are discovered by Consul service name; the gateway is a client to each.

## Capabilities

<!-- Thin capability index. Format authority: /docs/specs/README.md — capability names only;
     the routing contract and middleware detail live in the prose sections below. -->

### Edge

- [x] Terminate client HTTP behind a single entry point
- [x] Request logging middleware
- [x] CORS middleware
- [x] OpenTelemetry tracing middleware
- [x] JWT authentication on private route groups
- [x] Consul register / health-check / deregister lifecycle
- [x] Error responses on every route → FS-none
- [x] Uniform, machine-readable error contract → FS-0001
- [x] Gateway HTTP surface serialized → FS-0002

### Downstream routing

- [x] Route member traffic to auth
- [x] Route stats traffic to stats
- [x] Route notification traffic to notification
- [x] Route payment traffic to payments, plus the unauthenticated Stripe webhook
- [x] Route item traffic to items
- [x] Route example traffic to examples
- [ ] Route ledger read traffic to ledger → FS-0003

### Integration patterns

- [x] gRPC fan-out over Consul-discovered clients
- [ ] Synchronous signup → FS-0007

## Purpose

api-gateway is the single entry point for **request/response platform traffic**. It terminates
client HTTP, runs a cross-cutting middleware suite (tracing, CORS, JWT auth), and **fans each
route out to the owning downstream microservice** over gRPC (Consul-discovered) or, for one
path, RabbitMQ. It is **stateless** — it owns no persistence and no domain rules. ✅ DONE

It is **not** the entry point for the realtime game surface. game-service owns its entire
client surface and clients connect to it directly; the gateway holds no route to it, HTTP or
WebSocket (ADR-0004). A game route added here would contradict an accepted decision — read it
first.

## Responsibilities vs non-responsibilities

**IS:** ✅

- Gin router + route groups under the `/api` prefix (plus a bare `/webhook/stripe`).
- Middleware suite: request logging, CORS, OpenTelemetry (otelgin) tracing, JWT auth.
- Service discovery lifecycle: Consul register / health-check / deregister.
- Translating an authenticated HTTP request into a downstream gRPC (or AMQP) call and
  returning the downstream response.

**IS NOT:** (anything here found in-code is legacy — see [Legacy](#legacy--to-remove))

- A database owner. No migrations, no schema, no direct SQL.
- A holder of domain/business logic. Handlers marshal request → call downstream → map response.
- A saga orchestrator or event processor beyond publishing the signup command.

## Setup & lifecycle (`cmd/main.go`)

On startup, in order: ✅ DONE

1. Load `.env` (autoloaded), configure structured logger by `ENVIRONMENT`.
2. Init OpenTelemetry (`OTEL_ENABLED`, `COLLECTOR_ENDPOINT`, `SERVICE_VERSION`); deferred shutdown.
3. Register with Consul (`CONSUL_ADDR`) under service name **`api-gateway`** at `localhost:<PORT>`;
   background goroutine health-checks every 1s (fatal on failure); deregister on shutdown.
4. Connect to RabbitMQ (`RABBITMQ_*`) and declare the **`AuthEventsExchange`** topic exchange.
5. Build the Gin router via `SetupRouter(registry, ch)` and serve on `:<PORT>` (default **7114**).

> REVIEW: the health-check goroutine calls `log.Fatal` on a single failed check — a transient
> Consul blip takes the whole gateway down. Is that intended, or should it retry/backoff?

## Middleware suite

Applied in `SetupRouter`, in order: ✅ DONE

1. **Request logger** — prints method, path, host for every request.
   > REVIEW: this is a raw `fmt.Println` debug middleware, not structured `slog`. Likely
   > temporary; confirm whether it should stay / become slog.
2. **CORS** — currently `AllowOrigins: ["*"]`, all common methods, `AllowCredentials: true`.
   > REVIEW: marked `TODO: CORS for development, remove in PROD`. `*` + credentials is a known
   > footgun; treat as dev-only, not the intended production contract.
3. **otelgin** — distributed tracing spans for every request, service `api-gateway`.
4. **JWT auth** (`auth.AuthMiddleware()`) — applied **per route group**, only on private routes.

## Auth model

`AuthMiddleware` (applied to private groups): ✅ DONE

- Requires `Authorization: Bearer <jwt>`; missing/malformed → `401`.
- Parses & validates the token with `JWT_SECRET` (HMAC); invalid/expired → `401`.
- Extracts the `sub` claim as a UUID member id; on success sets `userId` (UUID) and
  `userIdStr` (string) on the Gin context for downstream handlers/gRPC metadata.
  > REVIEW: signing method is not asserted inside the keyfunc (accepts whatever alg the token
  > declares as long as the secret verifies). Confirm this is acceptable / matches auth-service.

## HTTP surface → downstream (routing contract)

All under `/api` unless noted. Each group forwards to the downstream service named in **bold**
(the Consul service name), via gRPC unless marked AMQP. ✅ DONE

**example → `examples`**

- `GET /api/example/:id`, `POST /api/example`

**member → `auth`** (public + private)

- Public: `POST /api/member/signup` _(gRPC, synchronous → 201 with the member)_,
  `POST /api/member/signin`
- Private (JWT): `GET /api/member`, `PATCH /api/member/update-password`,
  `PATCH /api/member/update-info`, `POST /api/member/avatar/upload-request`,
  `POST /api/member/avatar/confirm`

**stats → `stats`**

- `GET /api/stats/player/:playerId`, `GET /api/stats/leaderboard`
  > REVIEW: stats routes have no `AuthMiddleware` — public by design, or missing auth?

**notification → `notification`** (JWT)

- `GET /api/notification/`, `PATCH /api/notification/:id/read`, `PATCH /api/notification/read-all`

**payment → `payments`** (JWT, except webhook)

- `POST /api/payment/customer`, `POST /api/payment/subscription/setup`,
  `POST /api/payment/subscribe`, `GET /api/payment/subscriptions/:customerId`,
  `GET /api/payment/subscription/permission`
- `POST /webhook/stripe` — **no auth**, no `/api` prefix (Stripe posts directly).

**items → `items`** (JWT)

- Query: `GET /api/items/weapons`, `GET /api/items/types`, `GET /api/items/rarities`,
  `GET /api/items/instances`, `GET /api/items/loadout`, `PUT /api/items/loadout`
- Creation: `POST /api/items/complete-weapon`, `/complete-armor`, `/complete-consumable`
- `POST /api/items/weapon`, `POST /api/items/template`
  > REVIEW: labeled "Legacy/Advanced APIs" in code (create weapon/template separately). Candidate
  > for removal in favor of the `complete-*` endpoints.

**game → (NOT ROUTED, and will not be)** — game-service owns its entire client surface and
`game-client` connects to it directly on `:5668`. This is a decision, not a gap: ADR-0004.

## Downstream integration patterns

- **gRPC via Consul** ✅ — each gateway client lazily dials its downstream once via
  `discovery.ServiceConnection(ctx, "<consul-name>", registry)`, caches the `*grpc.ClientConn`
  (re-dials only if `Shutdown`), and calls the generated `pb.New<Svc>Client(conn)`. Consul
  names in use: `examples`, `auth`, `items`, `notification`, `stats`, `payments`.
> **The gateway no longer publishes to the broker at all.** AMQP fire-and-forget existed for
> signup alone — JSON body → `proto.Marshal` → publish to `AuthEventsExchange` with routing key
> `AuthMemberCreate`, answering `202` without waiting for a reply. FS-0007 replaced it with a
> synchronous gRPC call, and the routing key, both publishers, and auth-service's consumer are
> gone. gRPC via Consul is now the gateway's only downstream integration pattern.
>
> REVIEW: `cmd/main.go` still dials RabbitMQ and `SetupRouter` still takes a `*amqp.Channel`
> nothing reads, so the gateway keeps requiring `RABBITMQ_*` for a dependency it no longer uses.
> Finish the removal or record why the connection is retained.

## Constraints / invariants (observed)

- Stateless: no request state persists in the gateway between calls.
- Downstream connections are process-lived and shared (one cached conn per downstream client).
- Private routes require a valid JWT; `userId`/`userIdStr` are the only identity passed onward.
- Default port `7114`; registers itself in Consul as `api-gateway`.

## Legacy / to remove

Present in the tree but **out of scope** — the gateway is declared stateless and these
duplicate concerns now owned by dedicated services. Listed so audits don't mistake them for
gateway behavior. ⏳ (cleanup)

- `migrations/` (38 files) + `schema.sql` — includes `create_members`, `base_items`, `items`,
  etc., i.e. tables now owned by auth-service / item-service. No code in the gateway reads them.
- `internal/models/entities.go` — local entity models with no DB behind them.
- `docker-compose.yml`, `.air.toml`, `bin/`, `tmp/` — tooling, not behavior.
  > REVIEW: confirm none of the above is still referenced before deletion, then remove so the
  > gateway's statelessness is structural, not just aspirational.

## Assumptions & open questions

- Are `stats` routes intentionally unauthenticated?
- Should the `fmt.Println` debug middleware and the `*`-origin CORS be replaced before prod?
- Which item creation endpoints are the supported contract vs. legacy admin/seed tools?
- Should the health-check loop tolerate transient Consul failures instead of `log.Fatal`?
