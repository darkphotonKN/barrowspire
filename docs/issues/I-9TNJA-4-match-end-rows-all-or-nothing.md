---
id: I-9TNJA-4
status: done
implements: FS-9TNJA
blocked_by: [I-9TNJA-3]
labels: []
title: "FS-9TNJA slice 4: both match-end outbox rows are written in one transaction"
---
Implements FS-9TNJA §Requirements 13–17

**Author: agent**

## What to Build

`PublishMatchComplete` today makes two independent `CreateOutbox` calls; if the second fails only
`ItemsExtracted` ever goes out. Make the pair all-or-nothing:

- In `internal/game`, define a narrow interface for beginning a transaction (consumer owns it;
  `*sqlx.DB` satisfies it, e.g. `BeginTxx(ctx, *sql.TxOptions) (*sqlx.Tx, error)`), and narrow the
  outbox dependency to what the service uses (`CreateOutboxTx`).
- `NewService` receives both via its constructor; the service never constructs a DB handle.
- `PublishMatchComplete`: begin → `CreateOutboxTx(ItemsExtracted)` → `CreateOutboxTx(GameMatchEnded)`
  → commit, both on `GameEventsExchange`. Any failure rolls back and logs with the session id.
  Routing keys, exchange, payloads unchanged.
- Wire it in `config/routes.go` with game-service's DB (from I-9TNJA-3).
- Update every `NewService` caller in tests.

Test without a live DB using a SQL mock (e.g. `go-sqlmock`, new test-only dependency in
game-service's `go.mod`) to obtain a real `*sqlx.Tx` and assert the statement sequence.

## Acceptance Criteria

- [ ] Table-driven test: both inserts succeed → commit; begin fails → no inserts, no commit; first
      insert fails → rollback, no commit; second insert fails → rollback, no commit; commit fails →
      error logged.
- [ ] Both rows carry the existing routing keys (`ItemsExtracted`, `GameMatchEnded`) on
      `GameEventsExchange`, with unchanged payloads (existing payload tests still pass).
- [ ] The tx-begin interface is declared in `internal/game`; `NewService` takes it; no concrete DB
      type is created inside the service.
- [ ] `internal/matchmaker`, `internal/match_queue`, `.proto` files untouched.
- [ ] `GOWORK=off go build ./... && go vet ./... && go test ./...`, `make lint`, `make test` pass in
      game-service.

## Blocked By

- I-9TNJA-3 (game-service's own DB must exist and be wired in `config/routes.go`; a transaction on
  the stats DB is meaningless, and both slices edit `routes.go`).

## Spec Reference

FS-9TNJA §Requirements 13–17; §User Stories 3, 13, 15–16; §Edge States (Postgres unreachable at
match end, second insert fails, commit fails, ordering).

## TDD Approach

- RED: "second insert fails → rollback, no commit" against the current two-call code (fails: no
  transaction at all).
- GREEN: inject the tx beginner, wrap both `CreateOutboxTx` calls in one transaction.

## Predicted files

- `game-server/game-service/internal/game/service.go`
- `game-server/game-service/internal/game/service_test.go`
- `game-server/game-service/internal/game/integration_test.go`, `extraction_test.go`,
  `loadout_item_test.go`, `run_progress_test.go` (`NewService` callers / outbox mocks)
- `game-server/game-service/config/routes.go`
- `game-server/game-service/go.mod`, `go.sum` (test dependency)
