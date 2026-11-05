---
id: I-04ZB6-1
status: done
implements: FS-04ZB6
blocked_by: []
labels: [ready-for-agent]
title: "FS-04ZB6 slice 1: idempotent confirm, release and list of confirmed reservations (items-service, items.proto)"
---
Implements FS-04ZB6 §Requirements 1–6, §API surface, §Acceptance Criteria (items-service), §Edge States

## What to Build

The items side of the confirmed-reservation contract, end to end through gRPC:

- **Confirm** (`repository.ConfirmReservation`, service, handler):
  - Matches `id`, `listing_id` and `status = 'LISTED'` without the `reserved_at IS NOT NULL` condition.
  - Sets `reserved_at = NULL, updated_at = NOW()`.
  - The handler answers the service's bool in the new `ConfirmReservationResponse.confirmed`; today it drops it.
- **Cancel** is unchanged: it still requires `reserved_at IS NOT NULL`.
- **Release** (new): `ReleaseConfirmedReservation(item_id, listing_id)`.
  - Matches LISTED + same `listing_id` + `reserved_at IS NULL`.
  - Moves the item to `AVAILABLE` and sets `listing_id = NULL`.
  - Answers `released`.
- **List** (new): `ListConfirmedReservations(older_than, after, limit)`.
  - Returns LISTED items with `listing_id` set and `reserved_at` NULL, where `updated_at < NOW() - older_than`.
  - Keyset paging on `(updated_at, id)`, limit clamped to 100, `older_than > 0` required.
- `items.proto`: the `confirmed` field and the two new RPCs with their messages. Regenerate with `make gen` in `game-server/common`. Never hand-edit generated files; keep only the items output in the diff if other protos regenerate with a toolchain difference.
- `common/auth/interceptor.go`: `/items.ItemsService/ReleaseConfirmedReservation` and `/items.ItemsService/ListConfirmedReservations` join `publicMethods`, under the existing stopgap note.
- Check the FS Req 13 precondition: list every write that touches a LISTED item's `updated_at`, and report any that isn't a confirm.

## Acceptance Criteria

- [ ] Confirm on a waiting reservation: `confirmed = true`, `reserved_at` NULL, `updated_at` stamped.
- [ ] Confirm repeated on a confirmed reservation: `confirmed = true`, item still LISTED.
- [ ] Confirm with another listing id, or on an AVAILABLE or PENDING_SETTLEMENT item: `confirmed = false`, nothing changes.
- [ ] Cancel after confirm changes nothing; confirm after cancel answers `false`.
- [ ] Release on a confirmed reservation: the item is AVAILABLE with listing id NULL, `released = true`.
- [ ] Release on a waiting reservation, with another listing id, or on an item that isn't LISTED: `released = false`, nothing changes.
- [ ] `ListConfirmedReservations`: filter, `(updated_at, id)` order and keyset paging pinned against a DB (no skip, no repeat); `older_than ≤ 0` gives `InvalidArgument`.
- [ ] Generated `items*.pb.go` match a regeneration from `items.proto`.
- [ ] Both new RPCs are in `publicMethods`.
- [ ] Tests pass in items-service and common.

## Blocked By

None

## Spec Reference

FS-04ZB6 §Requirements 1–6 and 13 (precondition check), §API surface, User Stories 3, 4, 5, 15, 16, 18.

## TDD Approach

- RED: a repository test that confirms twice under the same listing id and expects `true` both times, and then that cancel matches nothing.
- GREEN: drop the `reserved_at IS NOT NULL` condition from confirm, stamp `updated_at`, and return the bool through the handler.

## Files (expected)

items-service `internal/items/{repository,service,handler,model}.go` and their tests. Shared and generated: `common/api/proto/items/items.proto`, `items.pb.go`, `items_grpc.pb.go` (hotspot: one writer). `common/auth/interceptor.go`.
