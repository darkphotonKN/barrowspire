---
id: I-PJPNA-1
status: done
implements: FS-PJPNA
blocked_by: []
labels: [ready-for-agent]
title: "FS-PJPNA slice 1: a match result notifies each player once, all players or none, via the inbox keyed on MessageId"
---
Implements FS-PJPNA §Requirements 1–12, §Acceptance Criteria, §Edge States

## What to Build

notification-service's `game.ended` path (routing key `match.ended`, `MatchEndedEvent`) goes
through the existing inbox, end to end:

- **Consumer** (`handleGameEnded`): read `msg.MessageId`; if empty or not a UUID, log at error
  level and `Nack(false, false)` (DLQ) before the field-visit check and without opening a
  transaction. Otherwise pass the event id to `ProcessGameEnded` alongside the payload, and
  settle through the existing `handleResult` (nil → ack, `ErrAlreadyProcessed` → ack,
  `ErrTransient` → delayed retry, else → DLQ).
- **Retry copy** (`requeueWithRetry`): the published copy carries `MessageId: msg.MessageId`.
- **Service** (`ProcessGameEnded` gains an event id; update `ConsumerService` to match): a field
  visit still returns nil with no inbox write. For a run, one `runInTx(ctx, eventID,
  commonconstants.GameMatchEnded, …)` marks the inbox and writes every valid player's
  notification with `repo.CreateTx`; a non-UUID `member_id` is skipped; any write error is
  returned (whole tx rolls back, inbox mark with it). `repo.Create` is no longer used here.
  Notification content and the `game.ended` `event_type` column are unchanged.
- **Tests**: give the run path a transaction seam (e.g. an injected tx runner, as items-service
  tests use `runInline`) or a real DB, so `TestProcessGameEnded_WorldType` and the new tests can
  exercise it; `member.signedup` behavior must not change.

## Acceptance Criteria

- [x] New `MessageId`: one notification per valid player plus one `processed_events` row
      (`event_id` = MessageId, `event_type` = `match.ended`) in one transaction; acked.
- [x] Same `MessageId` again: no notification written; acked and logged at info as a duplicate.
- [x] One player's write fails: no notification and no inbox row committed; error returned
      (transient → delayed retry, otherwise → DLQ); a redelivery then writes every valid player
      exactly once.
- [x] Empty or non-UUID `MessageId`: nacked without requeue, error log, no transaction opened,
      nothing written.
- [x] The copy `requeueWithRetry` publishes carries the original `MessageId`.
- [x] Non-UUID `member_id`: that player skipped, the rest and the inbox row commit.
- [x] Field visit: no notification, no inbox row; acked.
- [x] Titles, messages, template data, `notification_type`, `event_type` column unchanged.
- [x] `member.signedup` and `item.created` tests pass unchanged; no `.proto`, migration,
      game-service or `game-server/common/` change.
- [x] Table-driven tests (RED committed first): service — new / duplicate / one-player-fails /
      non-UUID member / field visit; consumer — missing / non-UUID / valid `MessageId`, retry
      copy keeps `MessageId`.
- [x] `GOWORK=off go build ./... && go vet ./... && go test ./...` green in notification-service;
      `make lint && make test` pass.

## Expected files

- `game-server/notification-service/internal/notification/amqp_consumer.go`
- `game-server/notification-service/internal/notification/service.go`
- `game-server/notification-service/internal/notification/service_test.go`
- `game-server/notification-service/internal/notification/amqp_consumer_test.go` (new)
- `game-server/notification-service/config/routes.go` (only if a tx-runner seam is injected via
  the constructor)

## Blocked By

None. (The producer side, game-service stamping `MessageId`, already shipped in FS-9TNJA.)

## Spec Reference

FS-PJPNA §Requirements 1–12 (dedup key, event type, MessageId rejection, retry copy, one tx per
match, duplicate no-op, error classification, skipped member, field visit, unchanged content,
bounds, TDD), §Acceptance Criteria (all), §Edge States; User Stories 1–18.

## TDD Approach

- RED: service test — the same `MatchEndedEvent` processed twice with one event id against an
  inbox fake that reports the second mark as seen: expect one write per player on the first call
  and `ErrAlreadyProcessed` with no writes on the second. Consumer test — a delivery with an empty
  `MessageId` is nacked without requeue and the service is never called.
- GREEN: thread the event id from consumer to service, wrap the player loop in `runInTx` with
  `CreateTx`, add the MessageId guard and `MessageId` on the retry copy.
