---
id: I-BVM9H-2
status: done
implements: FS-BVM9H
blocked_by: []
labels: []
title: "FS-BVM9H slice 2: a failing match.ended is dead-lettered or retried after a delay, never dropped or hot-looped"
---
Implements FS-BVM9H §Requirements 12, 14–16, 19, §Edge States

## What to Build

stats-service's `match.ended` consumer gets the DLQ + delayed-retry topology items-service already
has. `SetupAMQPInfrastructure` declares a new work queue
`commonconstants.StatsGameMatchEndedQueue + ".v2"` (`stats.game.match.ended.v2`) with
`x-dead-letter-exchange: ""` / `x-dead-letter-routing-key: <work queue>.dlq`, bound to
`match.ended` on `game.events`; a durable `.dlq`; wait queues `.retry-1..3` at 5s / 30s / 2m
(`x-message-ttl`) dead-lettering back to the work queue through the default exchange. The legacy
`stats.game.match.ended` queue is no longer declared, bound or consumed (`.v2` because a durable
queue's arguments can't change in place: `PRECONDITION_FAILED` closes the channel).

The consumer reads `.v2` with a bounded prefetch and settles via a disposition (ack / retry /
reject), mirroring items-service: malformed body, `ErrUUIDCouldNotBeParsed`,
`ErrConstraintViolation`, `ErrInvalidInput` → `Nack(false,false)` to the DLQ; anything else →
forward a copy (headers, `MessageId`, body, persistent) to the delay queue for its
`x-retry-count` step, then ack; a failed forward nacks with requeue. No `Nack(false,true)` on the
happy-failure path. stats-service's raw `uuid.Parse` errors on `session_id` / `member_id` are
wrapped with `ErrUUIDCouldNotBeParsed` so they classify as malformed.

Today's `Success:false` non-error outcome stays as-is in this slice (slice 3 removes it); the
`member.profile.updated` consumer is untouched.

## Acceptance Criteria

- [ ] Topology test with a fake declarer (as items' `TestDeclareExtractedTopology`): exchange,
      `.dlq`, `.v2` with DLX args, binding `match.ended`/`game.events`, `.retry-1..3` with TTLs
      5s/30s/2m dead-lettering to `.v2`.
- [ ] Table test of the classification: malformed / bad UUID / constraint / invalid input →
      reject; transient / unknown → retry.
- [ ] Retry forwarding increments `x-retry-count`, caps the step at the last delay, preserves
      `MessageId`; a failed forward returns the message to its queue.
- [ ] Consumer consumes `stats.game.match.ended.v2`; the legacy queue name no longer appears in
      the declare/consume path.
- [ ] No exchange, routing key or `.proto` change.
- [ ] `GOWORK=off go build ./... && go vet ./... && go test ./...` green in stats-service; `make lint`, `make test`.

## Blocked By

None. (Independent of FS-9TNJA: it does not read `MessageId`, only carries it.)

## Spec Reference

FS-BVM9H §Requirements 12 (classification), 14–15 (stats topology, `.v2`, prefetch), 16
(routing unchanged), 19; §Edge States "Legacy stats queue at cut-over", "Retry forever";
User Stories 10, 12, 14.

## TDD Approach

- RED: `TestDeclareMatchEndedTopology` against a recording fake declarer; table test for
  `settle`/classification with a fake retry publisher.
- GREEN: port items-service's `declareExtractedTopology` / `settle` / `forwardToRetry` /
  `retryCountOf` shape into `internal/stats/amqp_consumer.go` for the `match.ended` path.

## Predicted files

- `game-server/stats-service/internal/stats/amqp_consumer.go`, new `amqp_consumer_test.go`
- `game-server/stats-service/internal/stats/service.go` (UUID error wrapping only)
- `game-server/stats-service/config/routes.go` (only if the consumer constructor changes)
