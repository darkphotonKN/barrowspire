---
id: I-04ZB6-3
status: done
implements: FS-04ZB6
blocked_by: [I-04ZB6-1]
labels: []
title: "FS-04ZB6 slice 3: reconciler fenced by listing id and the confirmed-without-listing backstop (marketplace-service)"
---
Implements FS-04ZB6 §Requirements 11–13, §Acceptance Criteria (marketplace-service), §Edge States

## What to Build

- **Stale-reservation reconciler** (`usecase/reconcile_reservations_usecase.go`, `query/has_live_listing.go`): `HasLiveListing` takes the **listing id**. It is true only if that listing is ACTIVE or PENDING_SETTLEMENT; another live listing on the same item doesn't count.
- **Backstop**, run on the existing 5-minute reconcile tick after the stale pass:
  - Read `ListConfirmedReservations(older_than = 10 min)` page by page (keyset).
  - For each entry, look up the listing by id in any status:
    - None: call `ReleaseConfirmedReservation`.
    - Exists but not live: warn and skip.
    - Live: nothing to do.
  - The page size and the grace are tuning constants.
- Wire the new ports in `config/services.go`. Extend the worker (`worker/reconcile.go`) or the use case so both passes run each tick.

## Acceptance Criteria

- [ ] Reservation L is confirmed only when listing L is ACTIVE or PENDING_SETTLEMENT. With L absent and another live listing on the same item, it is cancelled.
- [ ] The backstop releases a confirmed reservation older than 10 minutes whose listing id exists nowhere.
- [ ] It leaves one whose listing is live.
- [ ] It warns and skips one whose listing exists but ended.
- [ ] It never lists a confirmation younger than 10 minutes (the grace).
- [ ] Paging reaches entries behind a full page of entries that fail or are skipped.
- [ ] Tests pass in marketplace-service.

## Blocked By

I-04ZB6-1 (`ListConfirmedReservations`, `ReleaseConfirmedReservation`).

## Spec Reference

FS-04ZB6 §Requirements 11–13, User Stories 6, 9, 11, 12, 13. Edge States: backstop grace race, backstop and insert after the grace (accepted residual), legacy LISTED rows with `reserved_at` NULL, ended listing with a LISTED item.

## TDD Approach

- RED: reconciler test with reservation L, listing L absent, another ACTIVE listing on the same item → expects cancel (today it confirms).
- GREEN: `HasLiveListing(listingID)`.

## Files (expected)

marketplace-service `query/has_live_listing.go`, a new listing-exists-by-id query, `usecase/reconcile_reservations_usecase.go`, `worker/reconcile.go`, `adapter/itemreserver/*`, `config/services.go`, and their tests. It doesn't touch the consumer or create-listing files of slice 2, so slices 2 and 3 can run side by side after slice 1, except that both add methods to the itemreserver adapter (`adapter/itemreserver/*`) and `config/services.go`: serialize those, or have slice 3 rebase onto slice 2.
