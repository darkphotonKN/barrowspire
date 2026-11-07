# ADR-0069 — The outbox relay locks its batch with `FOR UPDATE SKIP LOCKED` and publishes inside that transaction: the one sanctioned DB transaction across a third-party call

Status: accepted
Date: 2026-11-07
Scope: `game-server/common/outbox` (the relay worker shared by auth, game, items, marketplace,
stats and wallet)
Builds on: [ADR-0009](0009-idempotency-belongs-to-the-caller.md) (duplicates are the normal case;
the receiver dedups)
Realized by: `I-ADR0069-1`, `I-ADR0069-2`

## Context

`common/outbox` is the transactional outbox relay for six services (auth, game, items,
marketplace, stats, wallet). Each has the same `outbox` table (`id`, `routing_key`, `exchange`,
`payload`, `created_at`, `published_at`) and the partial index
`idx_outbox_pending (created_at) WHERE published_at IS NULL`.

The worker reads a batch with a plain `SELECT … WHERE published_at IS NULL ORDER BY created_at
LIMIT n`, which takes no lock. It publishes each row to RabbitMQ, then marks each one published
in a separate statement. With one process this works. With two or more replicas, every replica
reads the same pending rows on the same tick, so every event goes out once per replica.

The forces:

- **Most services run `SetMaxOpenConns(2)`.** Anything that holds a connection for long takes half
  the pool away from request traffic.
- **Nick's standing rule: never hold a DB transaction across a third-party call.** It pins a
  pooled connection and holds row locks for as long as the other system takes to answer. Until now
  the rule was spoken, not written down.
- **The publish call has no deadline of its own.** `common/broker.AmqpPublisher` calls
  `amqp.Channel.Publish`, and in amqp091-go v1.10.0 even `Channel.PublishWithContext` ignores its
  context ("Context is not honoured", `channel.go`, `func (ch *Channel) PublishWithContext(_
  context.Context, …)`). A stalled broker blocks the call for as long as it stalls.
- **The receiving side already dedups.** Every outbox message carries `MessageId` = the outbox row
  id, which is stable across republishes, and ADR-0009 puts idempotency on the receiver. Nick has
  confirmed that every consumer dedups.

Two designs were weighed.

**A. Lease/claim (set aside).** Add a `claimed_until TIMESTAMPTZ` column. One short statement
claims a batch (`UPDATE … SET claimed_until = NOW() + lease WHERE id IN (SELECT … FOR UPDATE
SKIP LOCKED) RETURNING *`), then the worker publishes outside any transaction and marks each row
published. A failed publish clears the claim, and an expired lease lets another replica take the
row. This keeps the "no transaction across a third-party call" rule intact. It costs a new
migration in six services, a lease length that has to be tuned against the publish timeout, and
claim-release code paths, all to prevent a duplicate that consumers already absorb.

**B. Row locks held across the publish (chosen).** One transaction per batch: lock the batch with
`FOR UPDATE SKIP LOCKED`, publish, mark, commit. No schema change. The rule is broken in exactly
one place, under a bound.

Postgres semantics this relies on (PostgreSQL 17 docs):

- *SELECT, The Locking Clause:* "With `SKIP LOCKED`, any selected rows that cannot be immediately
  locked are skipped. … can be used to avoid lock contention with multiple consumers accessing a
  queue-like table." With `LIMIT`, "locking stops once enough rows have been returned to satisfy
  the limit."
- *13.2.1 Read Committed:* when `SELECT FOR UPDATE` finds a row a concurrent transaction has
  updated and committed, "the `WHERE` clause is re-evaluated to see if the updated version of the
  row still matches." So a row another replica has just marked published (`published_at` no longer
  `NULL`) is dropped, not returned a second time.
- *SELECT, The Locking Clause:* under Read Committed, `ORDER BY` plus a locking clause "can return
  rows out of order." The relay already promises no ordering, so this costs nothing new.

Go `database/sql` semantics this relies on (Go 1.26, `database/sql/sql.go`): `BeginTx` — "The
provided context is used until the transaction is committed or rolled back. If the context is
canceled, the sql package will roll back the transaction." `Tx.awaitDone` waits on the context and
rolls back as soon as it is done, whether or not the caller is still busy elsewhere.

## Decision

1. **The outbox relay is the one sanctioned exception** to "never hold a DB transaction across a
   third-party call". Nick's words: "mq的等待似乎是可以接受的特例". No other code path gets this
   exception from this ADR. A second exception needs its own ADR.
2. **One transaction per batch.** The relay begins a transaction, selects up to the service's batch
   size of pending rows (`published_at IS NULL`, oldest first) with `FOR UPDATE SKIP LOCKED`,
   publishes them in order, sets `published_at = NOW()` on the rows it sent, and commits. Another
   replica running at the same moment gets the rows this one did not lock, or none, and never
   waits on this one's locks.
3. **A publish failure stops the batch at that row.** The rows already sent in this batch are
   still marked published and committed; they are not rolled back. The failed row and every row
   after it stay unpublished, and committing releases their locks for the next tick or another
   replica.
4. **A batch is bounded by a 5 s deadline** (it was 30 s). The transaction is begun under that
   deadline, so `database/sql` rolls it back when the deadline passes, even while the publish call
   is still blocked. The bound is on the database side: one pooled connection and the batch's row
   locks are held for about 5 s at most. The publish call itself stays unbounded (point 3 of the
   context above), and that is unchanged by this ADR. A deadline mid-batch rolls back the whole
   batch, including rows already sent, so they are sent again later. This is the at-least-once
   case in point 6, not the stop-and-commit case in point 3.
5. **Batch sizes stay as each service sets them today.** No schema change, no migration.
6. **Delivery stays at-least-once, with no ordering guarantee.** A crash, a lost connection or a
   deadline after a publish but before the commit leaves the row unpublished, so it is sent again.
   Replicas interleave, so events are not ordered across a service.
7. **Consumer rule: every consumer of an outbox-published event must tolerate duplicates**,
   deduplicating on `MessageId` (the outbox row id) or by an idempotent effect (ADR-0009). This
   ADR adds no dedup on the publishing side and makes no exactly-once claim.

## Consequences

- **Replicas no longer publish the same row twice in the normal path.** Each pending row is locked
  by at most one replica at a time, and a row marked published by one replica is not returned to
  another.
- **A connection is pinned for the length of a batch.** On a healthy broker that is the batch's
  publish time. On a stalled broker it is about 5 s, then the transaction is rolled back and the
  connection goes back to the pool. With a 2-connection pool, request traffic has one connection
  during that window.
- **The batch's rows stay locked while they are published.** Nothing else updates outbox rows
  today. Writers are not blocked by these row locks: checked on the local PostgreSQL 17.10, a new
  row insert and an `INSERT … ON CONFLICT (id) DO NOTHING` on an id another transaction holds
  `FOR UPDATE` both return at once. A future writer that *updates* pending rows would wait on the
  relay for up to 5 s.
- **A stalled broker still blocks the worker goroutine** until the publish call returns, as it
  did before: the deadline frees the connection and locks, not the goroutine. Bounding the call
  itself needs publisher confirms or a deadline in `common/broker`, which this ADR leaves out.
- **Duplicates still happen**, rarely: on a crash or deadline between publish and commit, and when
  the commit itself fails. Consumers already handle this (point 7).
- **No migration in six services**, which the lease design needed.
- **The mark is per batch, not per row.** If marking fails, the transaction fails and every row
  sent in the batch is sent again. This replaces the per-row mark with a transient-error retry,
  which a single transaction cannot use: in Postgres, one failed statement aborts the transaction.
- **Not covered here:** items' outbox wake/drain, `item.reserved` consumer resilience, RabbitMQ
  publisher confirms, an audit of consumer dedup, and ordering.
- **Supersedes nothing in `docs/adr/`.** The lease design was a shelved draft that never reached
  the repo; this ADR records it as the alternative set aside.
