---
id: I-0YXG6-3
status: open
implements: FS-0YXG6
blocked_by: []
labels: [ready-for-agent]
title: "FS-0YXG6 slice 3: listing terms reach the listing, and bad terms are refused before reserving"
---
Implements FS-0YXG6 §Requirements 9–11

## What to Build

Treat the reserve-item path as existing but untested. Characterize it first, and let the tests
expose the defect.

1. **Pass the terms through (requirement 11).** `ReserveItemUC` receives `StartPrice` and `EndsAt`
   but the item-reserver adapter only sends `ItemId`, so items-service publishes `ItemReserved` with
   `start_price = 0` and `ends_at = 1970-01-01`. The listing consumer then refuses it. Carry both
   fields through the usecase and the adapter into `ReserveItemRequest`. This is a pass-through; no
   domain change.
2. **Refuse bad terms first (requirement 10).** Before items-service is called, an end time not in
   the future is refused as `InvalidArgument`, using the listing's **existing** validation rules.
   Write no new domain rule. A non-positive start price never gets here, because the gateway rejects
   it with 422.

Do step 1 first: step 2's test relies on terms reaching the usecase.

## Acceptance Criteria

- [ ] A test shows `ReserveItemRequest` carries the `start_price` and `ends_at` the seller sent.
- [ ] A create-listing with a past end time answers `InvalidArgument`, and the item reserver is not called.
- [ ] No domain file gains a new rule. Validation reuses what the listing aggregate already enforces.
- [ ] Tests pass.

## Blocked By

None

## Spec Reference

FS-0YXG6 §Requirements 9–11, §Edge States (listing accepted then refused). User stories 2–3.

## TDD Approach

- RED: with a fake item reserver, `ListItem` with a start price of 150 and an end time tomorrow sends both to the reserver. This fails today, because only the item id is sent.
- GREEN: widen the command-to-adapter pass-through.
- RED: an end time of yesterday answers `InvalidArgument`, and the fake reserver records zero calls.
