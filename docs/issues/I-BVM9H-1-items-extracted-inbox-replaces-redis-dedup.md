---
id: I-BVM9H-1
status: done
implements: FS-BVM9H
blocked_by: [I-9TNJA-1]
labels: []
title: "FS-BVM9H slice 1: items.extracted is applied exactly once via a DB inbox keyed on MessageId (Redis dedup removed)"
---
Implements FS-BVM9H §Requirements 1–7, 10–13, 17–19, §Edge States

## What to Build

items-service stores a run's extracted loot exactly once per outbox event. The consumer reads the
delivery's `MessageId` (the producer's outbox row id, stamped by FS-9TNJA "outbox worker stamps
MessageId", I-9TNJA-1), uses `items.extracted` (`commonconstants.ItemsExtracted`, not
`delivery.RoutingKey`) as the event type, and hands both to `ProcessItemsExtracted`, which calls
`common/inbox` `MarkEventProcessed` as the first statement of its existing `withTx` transaction.
A duplicate does no writes and is acked; a failure rolls back the inbox row with the loot.

The Redis `DedupLock` goes away: no `AcquireLock`/`ReleaseLock`, no `dedup:items:*` keys,
`NewConsumer` takes no cache, `config/routes.go` builds no Redis cache for it and injects
`commoninbox.NewRepo()` into the service instead (narrow interface owned by `internal/items`).

Missing or non-UUID `MessageId` → reject to DLQ without opening a transaction. `forwardToRetry`
copies the original `MessageId` onto the retry copy (today it is dropped). Existing topology
(`.v2` work queue, `.dlq`, `.retry-1..3` at 5s/30s/2m, `x-retry-count`) and failure
classification stay as they are.

New migration `items-service/migrations/000026_create_processed_events.{up,down}.sql`, the
wallet/notification shape: `(event_id UUID NOT NULL, event_type TEXT NOT NULL, processed_at
TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (event_id, event_type))`; down drops it.

## Acceptance Criteria

- [ ] Same `MessageId` delivered twice: loot stored once, second delivery acked and logged at info.
- [ ] Processing fails: no `processed_events` row is committed; the retry with the same
      `MessageId` stores the loot exactly once.
- [ ] Missing `MessageId` and non-UUID `MessageId` → `Nack(false,false)`, service not called.
- [ ] A copy forwarded to a retry queue carries the original `MessageId` (extend
      `TestSettle_Retry_ForwardsWithBackoff`).
- [ ] The inbox mark uses event type `items.extracted` regardless of the delivery's routing key.
- [ ] `DedupLock`, `fakeDedup` and the Redis cache in `config/routes.go` are gone; the consumer
      tests that exercised the dedup mark are rewritten against the inbox.
- [ ] Migration 000026 up/down apply cleanly.
- [ ] No `.proto`, exchange, routing key, `common/outbox` or `common/broker` change.
- [ ] `GOWORK=off go build ./... && go vet ./... && go test ./...` green in items-service; `make lint`, `make test`.

## Blocked By

I-9TNJA-1 (FS-9TNJA "outbox worker stamps MessageId"). Without it every message is dead-lettered.

## Spec Reference

FS-BVM9H §Requirements 1–7 (key, type, inbox in-tx, MessageId across retry), 10 (duplicate no-op),
11 (Redis dedup removed), 12–13 (classification, existing topology), 17 (migration), 19 (TDD);
User Stories 1–4, 11, 13, 15–19, 22.

## TDD Approach

- RED: table test on `handleItemsExtracted` with a fake service: rows for new / duplicate
  (service reports already processed → ack) / missing MessageId (reject, service not called) /
  bad MessageId / transient failure (retry) / permanent failure (reject). Service test: fake inbox
  reporting duplicate → no repo writes.
- GREEN: read `msg.MessageId`, thread event id + type into `ProcessItemsExtracted`, mark in `withTx`,
  drop `DedupLock`, copy `MessageId` in `forwardToRetry`, add the migration and wiring.

## Predicted files

- `game-server/items-service/internal/items/amqp_consumer.go`, `amqp_consumer_test.go`
- `game-server/items-service/internal/items/service.go`, `process_extracted_test.go`
- `game-server/items-service/config/routes.go`
- `game-server/items-service/migrations/000026_create_processed_events.up.sql`, `.down.sql`
