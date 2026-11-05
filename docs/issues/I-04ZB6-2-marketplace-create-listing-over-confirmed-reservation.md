---
id: I-04ZB6-2
status: done
implements: FS-04ZB6
blocked_by: [I-04ZB6-1]
labels: []
title: "FS-04ZB6 slice 2: a listing is created only over a confirmed reservation (marketplace-service)"
---
Implements FS-04ZB6 §Requirements 7–10, §Acceptance Criteria (marketplace-service), §Edge States

## What to Build

The `item.reserved` consumer path in marketplace (`internal/listing/amqp_consumer.go`, `usecase/create_listing_usecase.go`, the itemreserver adapter):

1. Validate the terms (`NewListing`). On refusal, dead-letter without confirming.
2. `ConfirmReservation(item, listing)`:
   - `confirmed = false`: ack and drop with an info log.
   - Transport error: requeue.
3. Insert the listing:
   - A conflict on `listings_pkey`: replay, ack.
   - Any other unique violation, such as `idx_one_active_listing_per_item`: a definite failure.
   - A domain refusal: a definite failure.
   - Anything else, including an ambiguous COMMIT: unknown, so requeue and never release.
4. On a definite failure, call `ReleaseConfirmedReservation`, then dead-letter with an error log.
   - Release transport error: requeue.
   - `released = false`: dead-letter anyway and log it.

Telling `listings_pkey` from other unique violations needs the violated constraint's name. Today `common/utils` maps every 23505 to a duplicate. Add the narrowest way to read the constraint (for example a helper on the wrapped `*pq.Error`) without changing existing callers' behaviour. *(Amended 2026-11-05, FS-04ZB6 A13: the replay is now decided by `INSERT … ON CONFLICT (id) DO NOTHING` (0 rows → already exists), not by reading the violated constraint's name; was: read the constraint name from the `*pq.Error`. Found in code review: a replayed ACTIVE listing violates both `listings_pkey` and `idx_one_active_listing_per_item`, and Postgres reports only the first unique index it checks (index-OID order), which a `REINDEX` of the pkey flips. No `common/utils` helper remains.)*

## Acceptance Criteria

- [ ] An invalid-terms event is dead-lettered; confirm is never called.
- [ ] `confirmed = false`: acked, no listing inserted.
- [ ] A successful confirm inserts an ACTIVE listing.
- [ ] A redelivery after insert: acked as a replay on `listings_pkey`; still one listing.
- [ ] A redelivery after confirm but before insert: the listing is inserted.
- [ ] A violation of `idx_one_active_listing_per_item`: release is called, the event is dead-lettered with an error log, and it is never acked as a duplicate.
- [ ] An unknown insert outcome: requeued, and release is NOT called.
- [ ] A confirm or release transport failure: requeued.
- [ ] Tests pass in marketplace-service (and common if touched).

## Blocked By

I-04ZB6-1 (the `confirmed` field and the release RPC).

## Spec Reference

FS-04ZB6 §Requirements 7–10, User Stories 1, 2, 7, 8, 9, 10, 14, 17. Edge States: late event after cancel, relist chain, redelivery after confirm, ambiguous COMMIT, definite refusal.

## TDD Approach

- RED: a consumer/use-case test where confirm answers `false` and expects no insert and an ack.
- GREEN: call the confirm port before `repo.Insert`.

## Files (expected)

marketplace-service `internal/listing/amqp_consumer.go`, `usecase/create_listing_usecase.go`, `adapter/itemreserver/*`, `repository/listing_repository.go` (insert error classification), `config/services.go`, and their tests. Possibly `common/utils/error.go` (constraint name). *(Amended 2026-11-05, A13: not needed; `common/utils` is unchanged.)*
