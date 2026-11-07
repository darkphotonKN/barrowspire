---
id: I-ADR0069-1
status: done
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

- [x] The batch query carries `FOR UPDATE SKIP LOCKED`, binds the batch size (nil → 20), and runs
      inside a transaction that is committed after the mark, or rolled back on every other exit
      (sqlmock tests on the repository).
- [x] Only the ids the worker reports as sent are marked; an empty batch or a batch where nothing
      was sent writes nothing.
- [x] A publish failure mid-batch: the rows before it are published and committed, the failed row
      and the rows after it are unpublished and can be locked by the next batch (real Postgres).
- [x] While one batch holds rows, a second batch gets the other rows or none and returns at once,
      without waiting on the first (real Postgres).
- [x] When the deadline passes mid-publish, the transaction ends and the rows can be locked by
      another batch while the first publish call is still blocked; nothing from the timed-out
      batch is marked (real Postgres).
- [x] `Run` gives each batch a 5 s deadline.
- [x] Existing worker tests adapted: `MessageId` is the row id, the same row on two ticks carries
      the same `MessageId`, the mark happens before the batch context is cancelled, wake and
      non-blocking `Wake` unchanged.
- [x] Real-Postgres tests take their DSN from the opt-in `OUTBOX_TEST_DB_DSN` and work in a
      throwaway schema, as `common/inbox` does with `INBOX_TEST_DB_DSN`; they never default to a
      service's dev database.
- [x] `go test ./...`, `go vet ./...` and `go test -race ./outbox/...` pass in `common`; the six
      services (auth, game, items, marketplace, stats, wallet) build, vet and test.

## Blocked By

None

## Done (2026-11-07, charter run, branch `fix/outbox-for-update`, not merged)

Every criterion has a test. `RelayPendingBatch` (repository, forwarded by the service) owns the
batch's transaction; the worker's `publishBatch` stops at the first failed publish. Constructor
signatures and the `OutboxRetriever` name are unchanged, so no service wiring changed.

- sqlmock: `TestRelayPendingBatch_Limit_BindsBatchSizeInATransaction`,
  `…_Rows_HandedOverAndSentOnesMarkedThenCommitted`, `…_NothingSent_WritesNothingAndEndsTheTransaction`,
  `…_DBError_WrappedAndTheTransactionEnded` (begin, lock, mark, commit).
- Real Postgres (`OUTBOX_TEST_DB_DSN`, a throwaway schema per test, `outbox_relay_test_<random>`):
  `TestPublishOutboxEvents_PublishFailsMidBatch_SentRowsMarkedRestReleased`,
  `TestRelayPendingBatch_SecondBatchWhileFirstHolds_GetsTheOthersWithoutWaiting` (second batch
  ~ms, third gets none), `TestRelayPendingBatch_DeadlinePassesMidPublish_TransactionEndsAndRowsRelease`
  (300 ms deadline; rows retaken by another pool while the publish is still blocked).
- `TestRun_EachBatch_HasAFiveSecondDeadline`; the existing worker tests adapted.
- Mutation checks: dropping `SKIP LOCKED` fails the second-batch test (waits 2 s); dropping the
  lock fails the PG lock tests and I-ADR0069-2's test (9640 duplicates); beginning the transaction
  without ctx fails the deadline test.
- The old `ErrOutboxItemNotFound` in `common/constants` became unused; removed in fix round 1.

## Fix round 1 (2026-11-07, review verdict "needs changes")

- **HIGH-1, slow broker.** `publishBatch` publishes only while at least `commitMargin` (1 s) of the
  5 s batch is left, and otherwise commits what it sent. Before: at 1:5 scale (60 ms a publish,
  1 s batch) 4 ticks sent 80 messages and committed 0, and pending stayed at 40. After, same scale with
  a 200 ms margin (`TestPublishOutboxEvents_SlowBroker_EveryBatchCommitsAndTheOutboxDrains`):
  14 / 14 / 12 rows committed in 3 ticks of ~0.86 s, 40 sends for 40 rows. At production scale
  (300 ms a publish, 5 s batch, 1 s margin): 14 / 14 / 12 in 3 ticks of ~4.2 s, 40 sends, and
  nothing more on ticks 4 and 5.
  `TestPublishOutboxEvents_TooLittleTimeLeft_PublishesNothingMore` covers a done context and less
  than the margin left.
- **LOW-1.** The backlog is read under its own 2 s context after the batch context is cancelled
  (`TestRun_Backlog_ReadUnderItsOwnContextAfterTheBatch`).
- **LOW-2.** A failed step keeps its name (`begin`, `lock`, `mark published`, `commit`) and the
  original error around the shared helper's sentinel (`TestRelayPendingBatch_DeadlineError_KeepsItsStep`).
- **LOW-3.** `LockPendingBatch` renamed `RelayPendingBatch`.
- **LOW-6/7/8.** The deadline test unblocks its held batch in `t.Cleanup`; the two-relay drain loop
  is capped at 10× the batches a round needs; each DB test gets its own randomly named schema.
- **LOW-5.** `make test-db` in `game-server/common` and `docs/db-tests-guide.md`.

## Spec Reference

ADR-0069 §Decision 2 (one transaction per batch, SKIP LOCKED), 3 (stop at the failed row, commit
what was sent), 4 (5 s deadline, transaction always ends), 5 (no schema change, batch sizes
kept), 6 (at-least-once).
