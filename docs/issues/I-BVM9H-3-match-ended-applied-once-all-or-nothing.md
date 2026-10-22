---
id: I-BVM9H-3
status: done
implements: FS-BVM9H
blocked_by: [I-BVM9H-2, I-9TNJA-1]
labels: []
title: "FS-BVM9H slice 3: match.ended is applied exactly once, all players or none, via a DB inbox keyed on MessageId"
---
Implements FS-BVM9H §Requirements 1–4, 6, 8–10, 17–19, §Edge States

## What to Build

stats-service counts each match exactly once and for every player or for none. The consumer reads
the delivery's `MessageId` (outbox row id, stamped by FS-9TNJA "outbox worker stamps MessageId",
I-9TNJA-1), uses `match.ended` (`commonconstants.GameMatchEnded`, not `delivery.RoutingKey`) as
the event type, and passes both to `ProcessMatchCompleted`.

`ProcessMatchCompleted` drops its per-player `commonutils.ExecTx` loop and the
`atLeastOnePlayerUpdated` partial-success semantics: one outer transaction runs
`common/inbox` `MarkEventProcessed` first, then player stats, leaderboard and match history for
every player. Any failure rolls back everything (inbox row included) and is returned as an error
for slice 2's settle logic; the `Success:false, "All players updates were rolled back"` non-error
outcome goes away. A duplicate does no writes, does not bump the leaderboard cache version, and is
acked with an info log. The cache-version bump runs only after a new event commits. The inbox repo
is injected via constructor (`commoninbox.NewRepo()` in `config/routes.go`) behind a narrow
interface owned by `internal/stats`.

Missing or non-UUID `MessageId` → reject to DLQ without opening a transaction.

New migration `stats-service/migrations/000005_create_processed_events.{up,down}.sql`, the
wallet/notification shape: `(event_id UUID NOT NULL, event_type TEXT NOT NULL, processed_at
TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (event_id, event_type))`; down drops it.

## Acceptance Criteria

- [ ] Same `MessageId` twice: stats, leaderboard and history written once; second delivery acked,
      cache version not bumped.
- [ ] Second of two players fails: nothing committed for either player, no `processed_events`
      row; the error reaches the consumer and is retried (transient) or dead-lettered (malformed).
- [ ] Retry after a failure with the same `MessageId` applies all players exactly once.
- [ ] Missing / non-UUID `MessageId` → `Nack(false,false)`, service not called.
- [ ] Event type recorded is `match.ended` on first delivery and on retry.
- [ ] `atLeastOnePlayerUpdated` and the per-player `ExecTx` are gone.
- [ ] Migration 000005 up/down apply cleanly.
- [ ] `GOWORK=off go build ./... && go vet ./... && go test ./...` green in stats-service; `make lint`, `make test`.

## Blocked By

- I-BVM9H-2 (the DLQ/delayed-retry consumer this slice's errors settle through)
- I-9TNJA-1 (FS-9TNJA "outbox worker stamps MessageId"); without it every message is dead-lettered.

## Spec Reference

FS-BVM9H §Requirements 1–4 (key, type, inbox, missing MessageId), 6, 8–9 (one tx, no partial
success, cache bump after commit), 10 (duplicate no-op), 17 (migration), 19; User Stories 5–9,
11, 13, 16–22.

## TDD Approach

- RED: service table test with an injected tx runner + fake inbox/repo: new event → all players
  written + cache bumped; duplicate → no writes, no bump; second player's write fails → error
  returned, nothing committed. Consumer table rows: new / duplicate / missing MessageId / bad
  MessageId.
- GREEN: inject a `withTx` (as items-service does) and the inbox repo, collapse the loop into one
  tx, return errors instead of `Success:false`, read `msg.MessageId` in the consumer, add the
  migration and wiring.

## Predicted files

- `game-server/stats-service/internal/stats/service.go`, `service_test.go`, `model.go`
  (`ProcessMatchCompletedResponse` if it shrinks)
- `game-server/stats-service/internal/stats/amqp_consumer.go`, `amqp_consumer_test.go`
- `game-server/stats-service/config/routes.go`
- `game-server/stats-service/migrations/000005_create_processed_events.up.sql`, `.down.sql`
