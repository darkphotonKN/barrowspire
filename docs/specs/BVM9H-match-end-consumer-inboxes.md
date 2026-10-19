# FS-BVM9H: Match-end consumer inboxes

> Status: shipped · SPECIFICATION.md: `game-server/items-service/SPECIFICATION.md` "## Run extraction" → "Deduplicated extracted-items consumption"; `game-server/stats-service/SPECIFICATION.md` "## Match results" → "Deduplicated match-result consumption" → this FS · Related ADRs: [ADR-0023](../adr/0023-one-postgres-instance-database-and-role-per-service.md) · Companion: [FS-9TNJA](9TNJA-game-service-owns-its-outbox.md) (producer side; its slice "outbox worker stamps MessageId" must land first)

## Summary

The match-end events (`items.extracted`, `match.ended`) leave game-service through a
transactional outbox, which is at-least-once by contract: a worker that publishes and then
crashes before marking the row, the async mark-published retry, and (soon) one worker per
game-service replica all produce routine duplicates. Today a duplicate `items.extracted` that
slips past items-service's Redis dedup mark re-inserts a run's loot, and a duplicate
`match.ended` double-counts stats-service's player stats, leaderboard rows and match history.
This feature gives both consumers a database inbox (`processed_events`, via `common/inbox`)
written in the same transaction as the business effect, so each event is applied exactly once,
and gives both a dead-letter queue plus delayed retries so a failing event is neither lost nor
hot-looped.

## Background (folded from scoping)

- Audit of match-end consumers (2026-10-19): character-service dedups (`ErrAlreadyProcessed`,
  keyed by session/character); notification-service dedups (`processed_events`).
  **items-service** dedups with a Redis `SETNX` lock (`dedup:items:<EventId>`, 24h TTL, released
  on failure) that sits *outside* the DB transaction: a failed release makes a retried event look
  like a duplicate (loot lost), and a redelivery after 24h is processed again (loot duplicated).
  **stats-service** does not dedup at all.
- Kranti: "dont we just do the standard dedup downstream?" Yes: an idempotent consumer is the
  standard answer to an at-least-once outbox.
- Rejected: `FOR UPDATE SKIP LOCKED` row claiming in the producer (reduces duplicates, never
  eliminates them: publish-then-crash still republishes; see FS-9TNJA). Rejected: single-worker
  leader election via a Redis lock (more machinery, a new failure mode, still not exactly-once).

## Requirements

### Dedup key and event type

1. **Charter default: the dedup key is the AMQP delivery's `MessageId`**, parsed as a UUID. It is
   the producer's outbox row id, stamped on every publish by FS-9TNJA's worker change ("outbox
   worker stamps MessageId"). *Reason:* every producer publishes through the outbox worker, so the
   row id is a stable identity for one logical event across every redelivery and republish,
   without touching any `.proto`. `MatchEndedEvent` gets **no** `event_id` field; the
   `session_id` natural-key option from scoping is dropped. `ItemsExtractedEvent.event_id` stays
   in the payload for logging only and no longer drives dedup.
2. **Charter default: `event_type` is the routing key** of the event: `items.extracted`
   (`commonconstants.ItemsExtracted`) and `match.ended` (`commonconstants.GameMatchEnded`). The
   consumer takes it from the constant its work queue is bound to, **not** from
   `delivery.RoutingKey`: a copy that has passed through a delay queue is redelivered by the
   default exchange with the work-queue name as its routing key, so the delivery field is not the
   event's routing key on a retry. (Each work queue binds exactly one routing key, so the two are
   the same value on a first delivery.)
3. Each consumer calls `common/inbox` `Repo.MarkEventProcessed(ctx, tx, eventID, eventType)` as
   the first statement of the event's transaction. The inbox repo is injected via constructor
   behind a narrow interface owned by the consuming package (as notification-service and
   wallet-service do).
4. **Charter default: a delivery whose `MessageId` is missing or is not a UUID is rejected**
   (`Nack(false, false)`, dead-lettered to the DLQ) and logged at error level, without touching
   the database. *Reason:* every producer goes through the outbox worker, so absence is a
   producer bug; processing it un-deduplicated would reopen the very hole this FS closes.
5. The `MessageId` survives the retry hop: the copy a consumer forwards to a delay queue carries
   the original `MessageId`. (Today items-service's `forwardToRetry` builds a fresh
   `amqp.Publishing` that drops it; a retried event would then be rejected by Req 4.)

### One transaction per event

6. **Charter default: one transaction per event.** The inbox insert and *all* of that event's
   player/item writes run in one transaction; any failure rolls back everything, including the
   inbox row. *Reason:* "processed" and the effect must commit or vanish together, or a
   partially applied event is either redone (duplicates) or marked done (lost players).
7. **items-service:** `ProcessItemsExtracted` already runs every player's writes in one `withTx`.
   The inbox mark joins that transaction. The event id and event type reach the service from the
   consumer (the service signature takes them alongside the payload, or a small command struct;
   developer's choice, no `.proto` change).
8. **stats-service:** `ProcessMatchCompleted` drops its per-player `ExecTx` loop and its
   `atLeastOnePlayerUpdated` partial-success semantics. One outer transaction covers the inbox
   mark plus, for every player, player stats, leaderboard and match history. One player failing
   fails the whole event. The `Success:false, "All players updates were rolled back"` non-error
   outcome goes away: a failure is an error the consumer settles.
9. The stats leaderboard cache-version bump runs only after a successful commit of a *new* event,
   never for a duplicate and never on failure.
10. **Already processed → no-op.** When `MarkEventProcessed` reports the event as already seen,
    the service performs no writes, the transaction ends without effect, and the consumer **acks**
    and logs it (info level, with event id and type). A duplicate is not an error and is never
    retried or dead-lettered. Signalled by `commonconstants.ErrAlreadyProcessed` (existing, used
    by notification-service) or an explicit duplicate result; developer's choice.

### Replacing items-service's Redis dedup

11. **Charter default: the Redis `DedupLock` is removed from the items consumer.** No
    `AcquireLock`/`ReleaseLock`, no `dedup:items:*` keys; the consumer constructor no longer takes
    a cache, and `config/routes.go` no longer builds a Redis cache for it. *Reason:* a lock outside
    the transaction cannot be atomic with the writes (lost loot on failed release, duplicated loot
    after TTL).

### Failure classification and topology

12. **Charter default: failures are classified, not retried blindly.**
    - *Malformed or a bug* (unparseable body, missing/invalid `MessageId`, unparseable UUIDs in
      the payload, `ErrUUIDCouldNotBeParsed`, `ErrConstraintViolation`, `ErrInvalidInput`) →
      `Nack(false, false)`, dead-lettered to the work queue's DLQ.
    - *Transient / infrastructure* (anything else: `ErrTransient`, a failed begin/commit, a
      refused connection, an unrecognised store error) → **delayed retry through TTL wait
      queues**, never `Nack(false, true)` requeue-in-place (an immediate redelivery of a failing
      message is a hot loop).
    stats-service's raw `uuid.Parse` errors on `session_id` / `member_id` are wrapped with
    `ErrUUIDCouldNotBeParsed` so they classify as malformed.
13. items-service keeps its existing topology unchanged: work queue
    `items.game.items.extracted.v2` dead-lettering to `.dlq`, wait queues `.retry-1..3` at
    5s / 30s / 2m (`x-message-ttl`) dead-lettering back to the work queue through the default
    exchange, `x-retry-count` header choosing the step, retries never running out (the last step
    repeats).
14. **Charter default: stats-service gets the same topology for `match.ended`**, mirroring
    items-service: a new work queue named `commonconstants.StatsGameMatchEndedQueue + ".v2"`
    (`stats.game.match.ended.v2`) declared with `x-dead-letter-exchange: ""` and
    `x-dead-letter-routing-key: <work queue>.dlq`, bound to `match.ended` on `game.events`; a
    durable `.dlq`; wait queues `.retry-1..3` at 5s / 30s / 2m dead-lettering back to the work
    queue; the same `x-retry-count` stepping. *Reason for `.v2`:* a durable queue's arguments
    cannot change in place; redeclaring the existing queue with a DLX fails `PRECONDITION_FAILED`
    and closes the channel. Zero extra hosting cost: DLX/DLQ are queue arguments on the existing
    broker.
15. The stats consumer consumes from the `.v2` queue with a bounded prefetch (as items does). The
    legacy `stats.game.match.ended` queue is no longer declared, bound or consumed; it is left on
    the broker for an operator to drain and delete (see Edge States).
16. The routing key, exchange and payload of `match.ended` and `items.extracted` are unchanged.

### Storage

17. **Charter default: `processed_events` in each service's own database**, wallet/notification
    shape: `(event_id UUID NOT NULL, event_type TEXT NOT NULL, processed_at TIMESTAMPTZ NOT NULL
    DEFAULT NOW(), PRIMARY KEY (event_id, event_type))`. Composite key on purpose (one service may
    consume two event types that could share an id). New migrations:
    `items-service/migrations/000026_create_processed_events.{up,down}.sql` and
    `stats-service/migrations/000005_create_processed_events.{up,down}.sql` (next free numbers,
    verified 2026-10-19). Down drops the table. Same Postgres container, database-per-service
    (ADR-0023).
18. **Charter default: no retention/cleanup of `processed_events` in v1.** *Reason:* no other
    inbox has one either; volume is one row per match end per service.

### Discipline

19. TDD per repo CLAUDE.md: failing table-driven tests first, committed separately. Logging via
    `slog`; errors wrapped with `%w`.

## User Stories

1. As a player, I want the loot I extracted from a run stored exactly once, so that a broker
   redelivery never duplicates my items.
2. As a player, I want my extracted loot stored even when items-service's database blips, so that
   a transient outage delays my loot rather than losing it.
3. As a player, I want my extracted loot stored even if an earlier attempt failed halfway, so that
   a failed attempt never marks my event as done.
4. As a player, I want my extracted loot stored once no matter how late a redelivery arrives, so
   that there is no 24-hour window after which duplicates slip through.
5. As a player, I want my match counted exactly once in my stats, so that games played, wins,
   kills and deaths are true.
6. As a player, I want my leaderboard position computed from each match once, so that duplicates
   cannot inflate anyone's rank.
7. As a player, I want one match-history row per match, so that my history does not show the same
   run twice.
8. As a party member, I want the match recorded for every party member or for none, so that a
   partial write never leaves the party's stats inconsistent.
9. As a party member, I want a match whose processing failed for one teammate to be retried as a
   whole, so that no teammate's result is silently lost.
10. As an operator, I want a malformed `match.ended` or `items.extracted` parked in a DLQ, so that
    I can inspect and replay it instead of it vanishing.
11. As an operator, I want an event with no or a garbled `MessageId` dead-lettered and logged, so
    that a producer bug is visible instead of silently bypassing dedup.
12. As an operator, I want transient failures retried after 5s, 30s and then every 2m, so that a
    database outage neither hot-loops the consumer nor loses events.
13. As an operator, I want duplicates acked and logged at info, so that I can see dedup working
    without it paging anyone.
14. As an operator, I want stats-service's new topology to come up on the existing broker without
    a `PRECONDITION_FAILED` crash, so that the deploy needs no manual broker surgery first.
15. As an operator, I want items-service's dedup to stop depending on Redis, so that a Redis
    outage cannot block or corrupt loot delivery.
16. As a game-service operator, I want to scale game-service to several replicas, each running an
    outbox worker, so that duplicate publishes are harmless downstream.
17. As a developer, I want both consumers to use the shared `common/inbox` repo with per-service
    storage, so that there is one dedup pattern across the codebase.
18. As a developer, I want the dedup key to come from message metadata the outbox already owns, so
    that adding a consumer never requires a `.proto` change.
19. As a developer, I want the event type to stay stable across retry hops, so that a retried
    event dedups against its first attempt.
20. As a developer, I want stats-service's match processing to return an error on failure instead
    of a `Success:false` response, so that the consumer has one way to decide how to settle.
21. As a developer, I want the leaderboard cache invalidated only after a new event commits, so
    that duplicates and failures do not churn the cache.
22. As a developer, I want each service's `processed_events` in its own database, so that
    database-per-service (ADR-0023) holds.

## Acceptance Criteria

- [ ] items-service: a second delivery with the same `MessageId` stores nothing and is acked.
- [ ] items-service: a delivery whose processing fails leaves no `processed_events` row; its retry
      with the same `MessageId` is processed and stores the loot exactly once.
- [ ] items-service: `DedupLock`, `AcquireLock`/`ReleaseLock` and the `dedup:items:*` key are gone
      from the consumer; `NewConsumer` takes no cache and `config/routes.go` builds none for it.
- [ ] items-service: a copy forwarded to a retry queue carries the original `MessageId`.
- [ ] items-service: migration `000026` creates `processed_events` with the composite PK; down
      drops it.
- [ ] stats-service: a second `match.ended` with the same `MessageId` writes no stats, leaderboard
      or history rows, does not bump the leaderboard cache version, and is acked.
- [ ] stats-service: if any one player's write fails, no player's stats, leaderboard or history
      row and no `processed_events` row is committed; the event is retried (transient) or
      dead-lettered (malformed).
- [ ] stats-service: `atLeastOnePlayerUpdated` and the per-player `ExecTx` loop are gone.
- [ ] stats-service: `SetupAMQPInfrastructure` declares `stats.game.match.ended.v2` with DLX to
      its `.dlq`, the `.dlq`, and `.retry-1..3` at 5s/30s/2m dead-lettering back; the binding is
      `match.ended` on `game.events`; the consumer reads the `.v2` queue.
- [ ] stats-service: no `Nack(false, true)` remains on the `match.ended` path; transient failures
      go through the delay queues with an incremented `x-retry-count` and the original
      `MessageId`.
- [ ] stats-service: migration `000005` creates `processed_events` with the composite PK; down
      drops it.
- [ ] Both: a delivery with no `MessageId`, or a non-UUID one, is nacked without requeue (DLQ) and
      no database transaction is opened.
- [ ] Both: the `event_type` written to `processed_events` is `items.extracted` / `match.ended`
      on first delivery and on every retry.
- [ ] Both: malformed payload / `ErrUUIDCouldNotBeParsed` / `ErrConstraintViolation` /
      `ErrInvalidInput` → DLQ; any other error → delayed retry.
- [ ] No `.proto`, exchange, routing key, game-service, `common/outbox` or `common/broker` change.
- [ ] Table-driven tests cover new / duplicate / failed-then-retried / missing-MessageId for each
      consumer; `GOWORK=off go build ./... && go vet ./... && go test ./...` green in both
      services, plus `make lint` and `make test`.

## Edge States

- **Duplicate delivery (same `MessageId`):** inbox insert hits the PK, service does nothing,
  consumer acks and logs. Covers outbox republish, multiple workers, broker redelivery after a
  lost ack, and an operator replaying a DLQ message that had in fact already been applied.
- **Concurrent duplicates** (two copies consumed at once, e.g. two consumer instances): the PK on
  `processed_events` serialises them; the second `INSERT … ON CONFLICT DO NOTHING` blocks until
  the first commits (then reports duplicate) or rolls back (then inserts and proceeds). Exactly
  one applies.
- **Failure mid-event:** the whole transaction rolls back including the inbox row; the retry
  starts from nothing.
- **Commit succeeded but the ack was lost** (consumer crash, channel drop): the broker redelivers;
  the inbox reports duplicate; acked.
- **Missing / non-UUID `MessageId`:** DLQ, error log. Expected only from a producer that bypassed
  the outbox worker, or from messages published before FS-9TNJA's worker change (below).
- **Rollout ordering:** these consumers must not ship before FS-9TNJA's "outbox worker stamps
  MessageId" slice is deployed, or every message is dead-lettered. Messages already in flight
  without a `MessageId` at cut-over land in the DLQ and can be replayed by re-publishing with a
  fresh UUID `MessageId` (each is a first delivery, since the old consumers never recorded it in
  `processed_events`). Must land before game-service runs more than one replica.
- **Legacy stats queue at cut-over:** `stats.game.match.ended` stays bound and keeps collecting
  copies until removed; it is no longer consumed. An operator drains it (shovel unconsumed
  messages into `.v2`) and deletes it. The new code neither declares nor deletes it.
- **Retry forever:** a transient failure that never clears keeps cycling at the 2m step, logged at
  error level past the last step, as items-service does today. Nothing is discarded.
- **Malformed payload after a successful dedup check:** it fails in-tx, so the inbox row rolls
  back and the message dead-letters; a corrected replay is processed.
- **Empty event** (no players / no player items): the inbox row commits with no other writes; a
  redelivery is a no-op.
- **`processed_events` growth:** unbounded in v1, one row per match end per service.

## Out of Scope

- Any `.proto` change (no `event_id` on `MatchEndedEvent`).
- Stamping `MessageId` in the outbox worker, game-service's own outbox, and anything in
  `common/outbox` or `common/broker`: FS-9TNJA.
- Exchange / routing-key changes, and game-service code.
- stats-service's `member.profile.updated` consumer (it still requeues in place and has no DLQ);
  a separate follow-up.
- Removing items-service's now-unused Redis connection (`config/redis.go`, `InitRedis` in
  `cmd/server/main.go`, `REDIS_*` config): the consumer stops depending on it here; deleting the
  boot dependency is a follow-up.
- Deleting the legacy `stats.game.match.ended` queue from the broker (operator action).
- `processed_events` retention / cleanup.
- character-service and notification-service (already dedup).
