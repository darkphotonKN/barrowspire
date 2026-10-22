# FS-9TNJA: game-service owns its outbox

> Status: shipped · SPECIFICATION.md: `game-server/game-service/SPECIFICATION.md` "### Results" → "Match-end outbox in game-service's own database" → this FS · Related ADRs: [ADR-0023](../adr/0023-one-postgres-instance-database-and-role-per-service.md) · Companion: [FS-BVM9H](BVM9H-match-end-consumer-inboxes.md) (consumer-side dedup)

## Summary

When a run ends, game-service writes the match result (`ItemsExtracted`, `GameMatchEnded`) to a
transactional outbox. Today that outbox lives in **stats-service's database** and is drained by
stats-service's worker, which breaks database-per-service (ADR-0023) and only works through a
local `.env` hack, since the `game_service` role cannot connect to the stats DB. This feature moves
the outbox into game-service's own database, has game-service drain it with its own worker, writes
both match-end rows in one transaction, and stamps every outbox publish (all services) with the
outbox row id as its AMQP `MessageId` so consumers can deduplicate (FS-BVM9H).

Decisions marked **charter default** were set by the approved charter for this FS, with the
reason given; everything else is harvested from the scoping session.

## Background and decisions

- **Keep an outbox even though game-service has no other state.** At match end the result exists
  only in that pod's memory; the outbox row is the first durable record. `ItemsExtracted` is
  player loot, so losing it is permanent harm.
- **Outbox lives in game-service's own DB** (`barrowspire_game_service_db`, role `game_service`,
  already created by `game-server/postgres/init.sql`; `DB_*` already in game-service's `.env`).
- **At-least-once is the contract.** Duplicate publishes (multi-replica workers, async
  mark-published retry) are accepted here and absorbed downstream by consumer inboxes (FS-BVM9H).
- **Charter default: worker cycle 5s.** Kranti's call; a latency choice only. Duplicate safety
  is not this cycle's job.
- **Charter default: both match-end rows in ONE transaction via `CreateOutboxTx`.** Today they
  are two independent `CreateOutbox` calls in `internal/game/service.go`; if the second fails,
  only the first is ever published, so stats and items disagree about the same match.
- **Charter default: the transaction-begin capability is injected into `internal/game`'s service
  via its constructor, through a narrow interface defined in `internal/game`.** Consumer owns the
  interface (ISP), the service depends on the abstraction (DIP), and nothing concrete is created
  inside the service (IoC). `*sqlx.DB` satisfies it at the wiring site.
- **Charter default: game-service uses its own DB through `config.InitDB` + `runMigrations`**
  (boot-time golang-migrate, `file://migrations`), the existing pattern the other services use.
  `InitStatsServiceDB` is deleted. The migrations redesign (go:embed, migrate Job) is deliberately
  deferred and not part of this FS.
- **Charter default: `migrations/000001_create_outbox.up.sql` is copied exactly from
  `auth-service/migrations/000009_create_outbox.up.sql`; the down migration drops the table**
  (and its indexes, as auth's down does). One outbox schema across services, so `common/outbox`
  works unchanged against every one.
- **Charter default: game-service runs its own outbox worker,** wired like
  `stats-service/cmd/server/main.go`, reusing game-service's existing AMQP channel `ch`. A
  service publishes its own rows; stats-service no longer carries game-service's events.
- **Charter default: fix `GetUnpublishedOutboxItems` ignoring `limit`** by adding `LIMIT $1`.
  Pre-existing bug in `common/outbox` affecting every service; a one-line fix in a package this
  FS already touches.
- **Charter default: every outbox publish carries AMQP `MessageId` = outbox row id.** Add a
  `MessageId` field to `common/broker`'s `Message`, map it to `amqp.Publishing.MessageId` in the
  AMQP publisher, and have the outbox worker set it from `evt.ID`. The row id is stable across
  republishes of the same row, which is exactly what an inbox dedup key needs; FS-BVM9H uses
  `delivery.MessageId` as that key. It benefits every service's outbox and needs no `.proto`
  change. It ships as its own early slice so FS-BVM9H's issues can depend on it.
- **Consumers unchanged:** same exchange (`GameEventsExchange`), same routing keys.
- **No data migration.** The stats DB is empty on the new Postgres; there are no pending
  game-service rows to move out of stats' outbox.
- **Spec decision: the "both rows or neither" test runs without a live database.** Agents never
  start backend services, so the transactional test uses a SQL mock (e.g. `go-sqlmock`, a new
  test-only dependency) to assert begin → insert → insert → commit, and rollback with no commit
  when either insert fails. The same tool covers the `LIMIT` fix. Kranti verifies end to end on
  his own stack.

### Rejected

- **Publish straight to RabbitMQ** (even with durable queues and publisher confirms): does not
  survive "RabbitMQ unreachable at that moment, then the pod dies".
- **Keep writing to the stats DB with stats credentials:** couples the services and hands one
  service another's credentials.
- **`FOR UPDATE SKIP LOCKED` row claiming in `common/outbox`** to stop multi-replica workers
  double-publishing: not a correctness guarantee (publish, then crash before mark, still
  republishes). Dedup belongs downstream (FS-BVM9H). May return later purely as an efficiency
  tweak.

## Requirements

### Broker message identity (all services)

1. `common/broker`'s `Message` carries a `MessageId` string.
2. The AMQP publisher maps `Message.MessageId` to `amqp.Publishing.MessageId`; an empty value
   publishes with no message id, as today.
3. The outbox worker sets `MessageId` to the outbox row's `id` (UUID string form) on every publish.
4. Republishing the same outbox row produces the same `MessageId`.

### Outbox batching (all services)

5. `GetUnpublishedOutboxItems` returns at most `limit` rows (default 20 when `limit` is nil), still
   oldest first by `created_at`, via `LIMIT $1`.

### game-service's own database

6. game-service connects to its own database using `DB_*` env (`config.InitDB`), and no longer
   reads `STATS_DB_*`.
7. game-service runs its migrations at boot (golang-migrate, `file://migrations`) before serving;
   a migration failure aborts startup with a logged error.
8. `game-service/migrations/000001_create_outbox.up.sql` is byte-for-byte the body of
   `auth-service/migrations/000009_create_outbox.up.sql`; `000001_create_outbox.down.sql` drops the
   outbox indexes and table.
9. `config.InitStatsServiceDB` is deleted; nothing in game-service references the stats DB.
10. The outbox repository/service used by `internal/game` is built on game-service's own DB.

### game-service's own outbox worker

11. game-service starts a `commonoutbox.OutboxWorker` with a **5s** cycle and batch size 20,
    publishing through `commonbroker.NewAmqpPublisher(ch)` on game-service's existing channel.
12. The worker runs on a context cancelled at shutdown (SIGINT/SIGTERM), as stats-service does.

### Match end is all-or-nothing

13. At match end, the `ItemsExtracted` row and the `GameMatchEnded` row (both on
    `GameEventsExchange`) are written with `CreateOutboxTx` inside **one** transaction.
14. If beginning the transaction, either insert, or the commit fails, the transaction is rolled
    back, no row is persisted, and the failure is logged with the session id.
15. `internal/game` defines its own narrow interface for beginning a transaction, and its service
    receives it through `NewService`; the service never constructs a DB handle.
16. The outbox dependency the service consumes exposes only what it uses (`CreateOutboxTx`).
17. Routing keys, exchange, and payloads are unchanged from today.

### Verification

18. TDD per repo CLAUDE.md: each behavior gets a failing table-driven test first; tests are
    committed separately from implementation.
19. In game-service and in `common`: `GOWORK=off go build ./... && go vet ./... && go test ./...`
    pass, plus `make lint` and `make test`.

## User Stories

1. As a delver, I want my extracted loot to reach my stash even if RabbitMQ is down when my run
   ends, so that a broker blip never costs me items.
2. As a delver, I want my extracted loot recorded even if the game pod dies right after the run
   ends, so that a pod restart never costs me items.
3. As a delver, I want my match stats and my extracted items to always agree, so that I never see
   a match counted with no loot or loot with no match.
4. As a delver, I want results to show up within a few seconds of a run ending, so that returning
   to the HUB feels immediate.
5. As the game-service owner, I want my outbox in my own database, so that game-service no longer
   depends on stats-service's schema, credentials, or uptime.
6. As the stats-service owner, I want my worker to publish only my own rows, so that a stats
   outage or redeploy cannot stall game results.
7. As an operator, I want game-service to create its outbox table at boot, so that a fresh
   environment needs no manual SQL.
8. As an operator, I want game-service to refuse to start when its migrations fail, so that it
   never accepts runs it cannot record.
9. As an operator, I want no cross-database credentials in game-service's env, so that each role
   only touches its own database (ADR-0023).
10. As a platform maintainer, I want every outbox publish stamped with a stable message id, so
    that any consumer can deduplicate redeliveries with one rule.
11. As the items-service and stats-service consumers (FS-BVM9H), I want `delivery.MessageId` to
    equal the outbox row id, so that the same row published twice is recognised as one event.
12. As a platform maintainer, I want the outbox worker to fetch a bounded batch, so that a backlog
    cannot load an unbounded result set into memory on one tick.
13. As a backend developer, I want the transaction capability injected via the constructor through
    a narrow interface, so that the match-end write is unit-testable without a database.
14. As a backend developer, I want the outbox schema identical across services, so that
    `common/outbox` behaves the same everywhere.
15. As a backend developer, I want routing keys and the exchange unchanged, so that no consumer
    has to change for this move.
16. As a backend developer, I want a test proving "both rows or neither", so that a regression to
    two independent writes is caught.
17. As Kranti, I want the matchmaker and match queue untouched, so that my in-progress work merges
    cleanly.
18. As Kranti, I want the old `STATS_DB_*` lines named as a manual cleanup, so that I can remove
    them from my local `.env` when I pull this.

## Acceptance Criteria

- [ ] `commonbroker.Message` has `MessageId`; the AMQP publisher sets `amqp.Publishing.MessageId`
      from it (table-tested via a pure mapping, empty and non-empty cases).
- [ ] The outbox worker publishes each row with `MessageId == evt.ID.String()` (tested with a fake
      publisher and retriever), and the same row republished carries the same id.
- [ ] `GetUnpublishedOutboxItems` issues `... ORDER BY created_at ASC LIMIT $1` with the given
      limit, and 20 when nil (tested).
- [ ] `game-service/migrations/000001_create_outbox.up.sql` matches auth's `000009` up body;
      the down drops the indexes and table.
- [ ] `game-service/cmd/server/main.go` uses `config.InitDB()` and runs migrations at boot;
      `InitStatsServiceDB` no longer exists; `grep -r STATS_DB game-server/game-service` finds
      nothing in tracked files.
- [ ] game-service starts an outbox worker with a 5s cycle and batch 20 on its existing AMQP
      channel, cancelled on shutdown.
- [ ] `PublishMatchComplete` writes both rows through `CreateOutboxTx` in one transaction; a
      table-driven test covers: both succeed → commit; begin fails → no inserts; first insert
      fails → rollback, no commit; second insert fails → rollback, no commit; commit fails →
      logged, nothing persisted.
- [ ] `internal/game` declares the tx-begin interface it consumes; `NewService` takes it; all
      existing callers (`config/routes.go`, tests) are updated.
- [ ] Routing keys, exchange, and payload bytes are unchanged (existing payload tests still pass).
- [ ] `internal/matchmaker`, `internal/match_queue`, `.proto` files, routing keys, and exchanges
      are untouched by the diff.
- [ ] Build, vet, tests, `make lint`, `make test` pass in game-service and `common`.

## Edge States

- **RabbitMQ unreachable at match end:** rows are committed; the worker retries every 5s until a
  publish succeeds.
- **Pod dies after commit, before publish:** rows survive in game-service's DB; any game-service
  pod's worker publishes them.
- **Postgres unreachable at match end:** the transaction fails, nothing is written, the error is
  logged. **Residual risk:** if the pod then dies, the result is lost. Accepted for now (see Out
  of Scope).
- **Second insert fails:** rollback; neither event is published. No half-recorded match.
- **Commit fails:** treated as a failed write; logged with session id. (Postgres guarantees no
  partial commit.)
- **Publish succeeds, mark-published fails or is still retrying** (async 10s/20s/40s backoff) while
  the 5s cycle re-fetches the row: the row is republished with the **same** `MessageId`. Accepted;
  consumers dedupe (FS-BVM9H).
- **Multiple game-service replicas** (FS-JEAVX / FS-K2HKP) each run a worker on the same table:
  routine duplicate publishes, same `MessageId`. Accepted; FS-BVM9H should land before
  game-service runs more than one replica.
- **Backlog larger than the batch:** at most 20 rows per tick, oldest first; the backlog drains
  over successive ticks.
- **Ordering:** both match-end rows share `created_at` (transaction time), so their relative
  publish order is arbitrary. No consumer depends on it.
- **Migration already applied** (restart): golang-migrate reports no change and boot continues.
- **Migration fails** (bad SQL, no permission): startup aborts with a logged error.
- **Empty outbox:** the worker tick fetches nothing and does nothing.
- **Message published without a `MessageId`** (any non-outbox publisher): behaves as today; the
  field is optional on `Message`.

## Deployment notes (manual, not issues)

- **Kranti: remove the `STATS_DB_*` lines from `game-server/game-service/.env`.** The `.env` is
  gitignored and not in any worktree, so no issue can make this change. `DB_*` lines must point at
  `barrowspire_game_service_db` with role `game_service` (already present).
- The shared Dockerfile already copies `<service>/migrations` when present; game-service now has
  one, so its image picks it up with no Dockerfile change. `file://migrations` resolves against the
  process working directory, so `air` / `go run` must run from `game-server/game-service`.
- Agents never start or stop backend services; end-to-end verification happens on Kranti's stack.

## Out of Scope

- Consumer-side deduplication / inboxes in items-service and stats-service (FS-BVM9H).
- `FOR UPDATE SKIP LOCKED` row claiming or any other multi-replica coordination in `common/outbox`.
- In-memory retry with backoff and graceful-shutdown flush (SIGTERM → flush → exit) for the
  "Postgres down at match end, then pod dies" case. Tied to the SIGTERM handling auth-service also
  lacks; note only.
- The migrations redesign (go:embed, migrate Job).
- KinD manifests: game-service's ConfigMap needs `DB_*` once it gets a manifest under
  `game-server/deploy/kind/`. Later.
- Changing stats-service's own worker cycle or wiring.
- Any change to `internal/matchmaker`, `internal/match_queue`, `.proto` files, routing keys, or
  exchanges.
- Real match start time in `PublishMatchComplete` (existing TODO).
