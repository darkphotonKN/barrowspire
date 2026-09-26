---
id: I-0YXG6-4
status: done
implements: FS-0YXG6
blocked_by: []
labels: [ready-for-agent]
title: "FS-0YXG6 slice 4: the ItemReserved consumer dead-letters refusals instead of requeueing forever"
---
Implements FS-0YXG6 §Requirements 12

## What to Build

marketplace's `ItemReserved` consumer answers every non-duplicate `CreateListingUC` failure with
`Nack(false, true)`. A domain refusal (for example `ErrInvalidEndTime` or `ErrInvalidStartPrice`)
can never succeed, so the message is redelivered forever. Classify the failure:
- **retriable** (transient, or concurrent modification) → requeue, as today;
- **never going to succeed** (domain refusals) → `Nack(false, false)`, so it goes to the queue's
  dead-letter exchange.

Duplicates still ack.

## Acceptance Criteria

- [ ] An event whose terms the listing refuses is nacked without requeue (dead-lettered).
- [ ] A transient failure is still requeued.
- [ ] A duplicate is still acked.
- [ ] Tests pass.

## Blocked By

None

## Spec Reference

FS-0YXG6 §Requirements 12. User story 25.

## TDD Approach

- RED: feed the consumer loop an event with `ends_at` in the past, and assert the delivery was nacked with `requeue=false`. This fails today, because it requeues.
- GREEN: classify the usecase error before acking or nacking.
