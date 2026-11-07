---
id: I-ADR0069-1
status: open
implements: ADR-0069
blocked_by: []
labels: []
title: "ADR-0069: the outbox relay locks its batch with FOR UPDATE SKIP LOCKED and publishes inside one transaction per batch"
---
Implements ADR-0069 §Decision 2–6

**Author:** agent (charter run, 2026-11-07)

## What to Build

`game-server/common/outbox` reads pending rows with a plain `SELECT … LIMIT` and marks each one
published in its own statement afterwards, so two replicas of a service publish every event twice.

Replace the read-then-mark pair with one repository operation that owns the batch's transaction:

- begin a transaction under the caller's context;
- `SELECT id, routing_key, exchange, payload, created_at FROM outbox WHERE published_at IS NULL
  ORDER BY created_at ASC LIMIT $1 FOR UPDATE SKIP LOCKED`;
- hand the locked rows to the worker, which publishes them in order and **stops at the first
  failed publish**, returning the ids it sent;
- `UPDATE outbox SET published_at = NOW()` for exactly those ids, in the same transaction;
- commit. Every other exit (empty batch, nothing sent, any error) rolls back, so the transaction
  always ends.

The worker's per-batch deadline goes from 30 s to 5 s. The transaction is begun under that
deadline, so `database/sql` rolls it back when the deadline passes even if the publish call is
still blocked (`BeginTx`: "If the context is canceled, the sql package will roll back the
transaction"). The publish call itself ignores the deadline (amqp091-go v1.10.0
`PublishWithContext`: "Context is not honoured"), which ADR-0069 accepts.

Keep `NewRepo`, `NewService` and `NewOutboxWorker` signatures and the `OutboxRetriever` name, so
none of the six services' wiring changes. Each service's batch size stays as it is. The per-row
mark-published retry goes: a failed statement aborts a Postgres transaction, so it cannot be
retried inside one. No schema change.

## Acceptance Criteria

- [ ] The batch query carries `FOR UPDATE SKIP LOCKED`, binds the batch size (nil → 20), and runs
      inside a transaction that is committed after the mark, or rolled back on every other exit
      (sqlmock tests on the repository).
- [ ] Only the ids the worker reports as sent are marked; an empty batch or a batch where nothing
      was sent writes nothing.
- [ ] A publish failure mid-batch: the rows before it are published and committed, the failed row
      and the rows after it are unpublished and can be locked by the next batch (real Postgres).
- [ ] While one batch holds rows, a second batch gets the other rows or none and returns at once,
      without waiting on the first (real Postgres).
- [ ] When the deadline passes mid-publish, the transaction ends and the rows can be locked by
      another batch while the first publish call is still blocked; nothing from the timed-out
      batch is marked (real Postgres).
- [ ] `Run` gives each batch a 5 s deadline.
- [ ] Existing worker tests adapted: `MessageId` is the row id, the same row on two ticks carries
      the same `MessageId`, the mark happens before the batch context is cancelled, wake and
      non-blocking `Wake` unchanged.
- [ ] Real-Postgres tests take their DSN from the opt-in `OUTBOX_TEST_DB_DSN` and work in a
      throwaway schema, as `common/inbox` does with `INBOX_TEST_DB_DSN`; they never default to a
      service's dev database.
- [ ] `go test ./...`, `go vet ./...` and `go test -race ./outbox/...` pass in `common`; the six
      services (auth, game, items, marketplace, stats, wallet) build, vet and test.

## Blocked By

None

## Spec Reference

ADR-0069 §Decision 2 (one transaction per batch, SKIP LOCKED), 3 (stop at the failed row, commit
what was sent), 4 (5 s deadline, transaction always ends), 5 (no schema change, batch sizes
kept), 6 (at-least-once).
