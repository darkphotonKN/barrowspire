---
id: I-9TNJA-1
status: done
implements: FS-9TNJA
blocked_by: []
labels: []
title: "FS-9TNJA slice 1: every outbox publish carries AMQP MessageId = outbox row id"
---
Implements FS-9TNJA §Requirements 1–4, §Background and decisions (MessageId charter default)

**Author: agent**

> Early, standalone slice on purpose: FS-BVM9H's consumer inboxes dedupe on `delivery.MessageId`,
> so its issues depend on this one. Keep it free of any game-service change.

## What to Build

Give `common/broker`'s `Message` a `MessageId` string, have the AMQP publisher map it onto
`amqp.Publishing.MessageId`, and have the outbox worker stamp every publish with the row's
`evt.ID.String()`. Every service running a `common/outbox` worker gets this for free. No `.proto`,
routing key, or exchange changes.

To make the mapping testable without a live channel, extract a pure `Message → amqp.Publishing`
function inside `common/broker` and have `PublishWithContext` use it.

## Acceptance Criteria

- [ ] `commonbroker.Message` has a `MessageId string` field.
- [ ] The AMQP publisher sets `amqp.Publishing.MessageId` from it; empty stays empty (table test on
      the pure mapping: empty, non-empty, other fields unchanged).
- [ ] `OutboxWorker.PublishOutboxEvents` publishes each row with `MessageId == evt.ID.String()`
      (fake `Publisher` + fake `OutboxRetriever`, table-driven: one row, several rows, publish
      error on one row does not change the others' ids).
- [ ] Publishing the same row on two ticks produces the same `MessageId`.
- [ ] Existing fields (ContentType, Body, DeliveryMode, CorrelationId, Headers) still map as before.
- [ ] `GOWORK=off go build ./... && go vet ./... && go test ./...` pass in `common`, and every
      service module that imports `common/broker` still builds.

## Blocked By

None

## Spec Reference

FS-9TNJA §Requirements 1–4; §User Stories 10–11; §Edge States (mark-published retry,
multiple replicas, message without MessageId).

## TDD Approach

- RED: table test that the mapping function sets `Publishing.MessageId` from `Message.MessageId`;
  worker test asserting the fake publisher received `MessageId == evt.ID.String()`.
- GREEN: add the field, map it, set it in the worker.

## Predicted files

- `game-server/common/broker/publisher.go`
- `game-server/common/broker/amqp_publisher.go` (+ `amqp_publisher_test.go`, new)
- `game-server/common/outbox/worker.go` (+ `worker_test.go`, new)
