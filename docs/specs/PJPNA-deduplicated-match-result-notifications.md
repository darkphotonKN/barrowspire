# FS-PJPNA: Deduplicated match-result notifications

> Status: shipped · SPECIFICATION.md: `game-server/notification-service/SPECIFICATION.md` "## Notifications" → "Deduplicated match-result notifications" → this FS (retrofit of the pre-existing "Match-result notifications → FS-none") · Related ADRs: none · Related FS: [FS-BVM9H](BVM9H-match-end-consumer-inboxes.md) (the same inbox pattern for items/stats), [FS-9TNJA](9TNJA-game-service-owns-its-outbox.md) (producer stamps `MessageId`)

## Summary

When a match ends, notification-service writes one "Escaped!" / "Victory!" / "Game Over"
notification per player. Today it writes them again on every redelivery of the same
`match.ended` event, so a producer that republishes floods players' notification lists. This
feature routes `game.ended` processing through the service's existing inbox
(`processed_events`), keyed by the AMQP `MessageId`, in one transaction with the notification
writes, so each match result produces its notifications exactly once no matter how often it is
delivered.

## Background (folded from scoping)

- **Incident, 2026-10-28 11:29–18:46 UTC.** A game-service outbox bug (rows marked failed with
  "context canceled"; fixed in 9142837) republished the same `match.ended` rows every 5s for
  ~6.4h. items-service and stats-service deduped through their inboxes (FS-BVM9H).
  notification-service did not, and inserted ~4,614 "Game Over" rows per player per match:
  15,440 rows for one member locally. `GetNotification` (no LIMIT) then returned a 5.4 MB gRPC
  response, over grpc-go's 4 MB default receive limit, so api-gateway answered 500 and the
  client's NotificationBell broke. The local duplicates were deleted by hand.
- **The gap in FS-BVM9H.** FS-BVM9H's Background and Out of Scope state that notification-service
  "already dedups". That holds only for `member.signedup`: the inbox (`processed_events`, PK
  `(event_id, event_type)`; `InboxRepository.MarkEventProcessed` from `common/inbox`;
  `runInTx`, service.go:96) is used only by `ProcessMemberSignedUp` (service.go:44). FS-BVM9H is
  shipped and write-once; this FS closes the gap rather than amending it.
- **Today's `ProcessGameEnded`** (service.go:144) returns nil early for a field visit, skips a
  player whose `member_id` is not a UUID, and calls `repo.Create` per player outside any
  transaction, logging and continuing when one player's write fails.
- **Producer.** game-service's outbox worker stamps the AMQP `MessageId` with the outbox row id,
  stable across every republish (FS-9TNJA). items-service and stats-service dedup on it and
  dead-letter an empty or non-UUID one (items-service `amqp_consumer.go` ~295–306).
- **Found while scoping: the retry hop drops `MessageId`.** notification-service's
  `requeueWithRetry` (amqp_consumer.go ~317) builds a fresh `amqp.Publishing` from
  ContentType / Body / DeliveryMode / Headers only. Once `MessageId` is required, a
  transiently-failed `game.ended` would return from its delay queue without one and be
  dead-lettered. The same hole FS-BVM9H Req 5 closed in items-service.
- Rejected: dedup on `session_id` (a natural key). `MessageId` is the repo-wide pattern and needs
  no `.proto` change. Rejected: per-player partial success with per-player inbox keys. The user
  chose all-or-nothing per match.

## Requirements

### Dedup key and event type

1. **Charter default: the dedup key is the AMQP delivery's `MessageId`**, parsed as a UUID.
   *Reason:* it is the producer's outbox row id, stable across republishes (FS-9TNJA), and it is
   what items-service and stats-service use. `MatchEndedEvent` has no event-id field and gets
   none. The consumer hands `msg.MessageId` to the service: `ProcessGameEnded` gains an event-id
   parameter alongside the payload (no `.proto` change).
2. **The inbox `event_type` is `commonconstants.GameMatchEnded` (`match.ended`)**, taken from the
   constant, never from `delivery.RoutingKey`. *Reason:* a copy that has passed through a delay
   queue can arrive with a different routing key; the event type must be identical on the first
   delivery and every retry (FS-BVM9H Req 2). The notification rows' own `event_type` column
   stays `game.ended` (unchanged).
3. **Charter default: a `game.ended` delivery whose `MessageId` is empty or not a UUID is a
   permanent error → DLQ** (`Nack(false, false)`), logged at error level, and no database
   transaction is opened. *Reason:* every producer publishes through the outbox worker, so a
   missing id is a producer bug that retry cannot fix; processing it un-deduplicated would
   reopen the hole. Same as items-service. The check runs before the field-visit check (Req 9),
   so it applies to every `game.ended` delivery.
4. **The retry copy keeps the original `MessageId`.** `requeueWithRetry` sets
   `MessageId: msg.MessageId` on the copy it publishes to the retry exchange. This applies to all
   three event types' retry copies; `member.signedup` and `item.created` ignore `MessageId`, so
   their behavior is unchanged.

### One transaction per match

5. **Charter default: all-or-nothing per match** (user's explicit decision). For a run, the inbox
   mark and every player's notification write run inside one `runInTx`; the writes use
   `repo.CreateTx` with that transaction, following `ProcessMemberSignedUp`. If any player's
   write fails, the whole transaction rolls back, the inbox mark with it, and the error is
   returned so the delivery is retried or dead-lettered; a later delivery rewrites the whole
   match. The "log and continue with other players" behavior on a write failure goes away.
6. **Already processed → no-op, acked.** When `MarkEventProcessed` reports the event as already
   seen, `runInTx` returns `commonconstants.ErrAlreadyProcessed` without running any write, and
   the consumer's existing `handleResult` acks it and logs at info. A duplicate is never retried
   or dead-lettered.
7. **Charter default: error classification as `member.signedup` does today.** A failure whose
   error is the transient sentinel (`commonconstants.ErrTransient`, produced by `WrapDBErr` at the
   repo boundary) is retried through the existing delay queues up to `MaxRetries`, then
   dead-lettered; any other error is dead-lettered. *Reason:* redesigning `ExecTx`'s error
   classification is out of scope (see Edge States for what that implies).

### Unchanged per-player and per-visit rules

8. **Charter default: a player whose `member_id` is not a UUID is skipped, the others are still
   written**, inside the same transaction, and the match commits. *Reason:* retry cannot fix a bad
   id, and one bad player must not fail the whole match.
9. **Charter default: a field visit (`world_type == field`) still returns nil early with no inbox
   write.** *Reason:* it writes nothing, so there is nothing to dedup.
10. Notification content (titles, messages, template data, `notification_type`, `event_type`
    column) is unchanged.

### Bounds and discipline

11. Only notification-service changes: its consumer, service and tests. No `.proto`, no migration
    (`processed_events` already exists), no change to `member.signedup` or `item.created`
    processing, no game-service or `game-server/common/` change.
12. TDD per repo CLAUDE.md: failing table-driven tests first, committed separately; `slog`
    logging; errors wrapped with `%w`. The existing `TestProcessGameEnded_WorldType` constructs
    the service with a nil `*sqlx.DB`; once the run path goes through `runInTx` it needs a
    transaction seam (e.g. an injected tx runner, as items-service's tests use `runInline`) or a
    real database. Developer's choice; it must not change `member.signedup` behavior.

## User Stories

1. As a player, I want exactly one result notification per match I finish, so that my
   notification list is not flooded when the server redelivers the result.
2. As a player, I want my notification bell to keep loading after a producer misbehaves, so that
   a republish storm cannot push my list past the gateway's response limit.
3. As a player, I want my match-result notification to arrive even if the database blipped on
   the first attempt, so that a transient outage delays it rather than losing it.
4. As a party member, I want every party member's result notification written or none, so that a
   half-written match is never marked done and silently dropped for some of us.
5. As a party member, I want a match whose notification failed for one teammate retried as a
   whole, so that no teammate's notification is lost.
6. As a party member, I want my notification written even when a teammate's record carries a
   garbled member id, so that someone else's bad data does not cost me my notification.
7. As a player visiting a field, I want no "Game Over" for a field visit, so that only real
   matches announce a result (unchanged).
8. As a player, I want the same titles and messages as today, so that dedup changes nothing I
   can see except the absence of duplicates.
9. As an operator, I want a `match.ended` with no or a garbled `MessageId` dead-lettered and
   logged at error level, so that a producer bug is visible instead of bypassing dedup.
10. As an operator, I want duplicates acked and logged at info, so that I can see dedup working
    without alerts.
11. As an operator, I want a transiently-failed match result retried with its original
    `MessageId`, so that the retry dedups against the first attempt instead of landing in the DLQ.
12. As an operator, I want an outbox republish storm like 2026-10-28's to be harmless to
    notification-service, so that a producer bug does not become a user-facing outage.
13. As an operator, I want a DLQ'd match result that is replayed after a partial earlier attempt
    to write all players' notifications once, so that a replay is safe.
14. As a game-service operator, I want to run several game-service replicas, each with an outbox
    worker, so that duplicate publishes are harmless downstream in every consumer.
15. As a developer, I want notification-service to dedup `match.ended` on the same key as
    items-service and stats-service, so that there is one dedup pattern for match-end consumers.
16. As a developer, I want `game.ended` processing to follow `member.signedup`'s `runInTx` +
    `CreateTx` shape, so that the service has one way to apply an event.
17. As a developer, I want the inbox event type taken from the routing-key constant, so that a
    retried copy dedups against its first delivery.
18. As a developer, I want the change confined to notification-service, so that no proto,
    migration or shared-package change needs coordinating.

## Acceptance Criteria

- [ ] A `game.ended` delivery with a new `MessageId` writes one notification per valid player and
      one `processed_events` row (`event_id` = the `MessageId`, `event_type` = `match.ended`) in a
      single transaction, and is acked.
- [ ] A second delivery with the same `MessageId` writes no notification and is acked (logged at
      info as a duplicate).
- [ ] If any player's notification write fails, no notification and no `processed_events` row for
      that event is committed; the error is returned to the consumer (transient → delayed retry,
      otherwise → DLQ).
- [ ] After such a failure, a redelivery with the same `MessageId` writes every valid player's
      notification exactly once.
- [ ] A delivery whose `MessageId` is empty or not a UUID is nacked without requeue (DLQ), logged
      at error level, and opens no transaction; the service writes nothing.
- [ ] The copy `requeueWithRetry` publishes carries the original `MessageId`.
- [ ] A player with a non-UUID `member_id` is skipped; the other players' notifications and the
      inbox row still commit.
- [ ] A field visit writes neither a notification nor a `processed_events` row and is acked.
- [ ] Notification titles, messages, template data, `notification_type` and the `game.ended`
      `event_type` column are unchanged.
- [ ] `ProcessGameEnded` no longer calls `repo.Create`; it writes with `repo.CreateTx` inside
      `runInTx`.
- [ ] `member.signedup` and `item.created` processing behave as before (their existing tests
      pass unchanged).
- [ ] No `.proto`, migration, game-service or `game-server/common/` change.
- [ ] Table-driven tests cover new / duplicate / one-player-fails / non-UUID member /
      field visit at the service, and missing / non-UUID / valid `MessageId` plus the retry copy's
      `MessageId` at the consumer; `GOWORK=off go build ./... && go vet ./... && go test ./...`
      green in notification-service, plus `make lint` and `make test`.

## Edge States

- **Duplicate delivery (same `MessageId`):** the inbox insert hits the PK, nothing is written,
  the consumer acks. Covers outbox republish (the 2026-10-28 storm), several outbox workers, a
  broker redelivery after a lost ack, and an operator replaying an already-applied DLQ message.
- **Concurrent duplicates** (two consumer instances take two copies at once): the PK on
  `processed_events` serialises them; the second insert waits for the first transaction, then
  reports duplicate (commit) or proceeds (rollback). Exactly one writes.
- **One player's write fails mid-match:** everything rolls back including the inbox row; the
  retry starts from nothing and writes every player.
- **Commit succeeded, ack lost:** redelivery → duplicate → acked.
- **Retry hop:** the copy forwarded to `retry-N.*` carries the original `MessageId` and
  `x-retry-count`, so it dedups against its first attempt and is not dead-lettered by Req 3.
- **Retries exhausted:** after `MaxRetries` transient failures the message is dead-lettered
  (existing behavior); nothing was committed, so a later replay writes the match once.
- **Begin / commit failures are not classed transient.** `commonutils.ExecTx` returns a plain
  error for a failed begin and the raw commit error, so such a failure goes to the DLQ rather
  than a delayed retry, exactly as `member.signedup` does today. Accepted under Req 7; an
  operator replays it. Fixing `ExecTx`'s classification is out of scope.
- **Missing / non-UUID `MessageId`:** DLQ, error log. Expected only from a producer that bypassed
  the outbox worker; game-service has stamped `MessageId` since FS-9TNJA, so none are expected at
  rollout.
- **All players have non-UUID member ids:** the inbox row commits with no notifications; a
  redelivery is a no-op.
- **Empty `Players`:** the inbox row commits with no notifications; a redelivery is a no-op.
- **Field visit:** no inbox row, no notification, acked. A redelivered field visit is again a
  no-op.
- **Duplicates already in the database** from before this ships (e.g. on GKE) are not cleaned up
  by this feature.
- **`processed_events` growth:** one more row per run's match end; unbounded, as for every inbox.

## Out of Scope

- `item.created` dedup (still `repo.Create`, no inbox).
- Pagination (limit/offset) of the notification list in the gateway or client, and any change to
  `GetNotification`.
- Cleaning duplicate notification rows on GKE (the local ones were deleted by hand).
- Editing FS-BVM9H (shipped, write-once).
- `processed_events` retention / cleanup.
- Redesigning `commonutils.ExecTx`'s error classification.
- Any `.proto`, migration, game-service or `game-server/common/` change.
