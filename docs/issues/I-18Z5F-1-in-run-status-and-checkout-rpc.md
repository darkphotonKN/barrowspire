---
id: I-18Z5F-1
status: done
implements: FS-18Z5F
blocked_by: [I-VPD8Y-1]
labels: []
title: "FS-18Z5F slice 1: IN_RUN status, run_id fence and the CheckOutRunGear RPC (items-service)"
---
Implements FS-18Z5F §A (Requirements 1–4), §B (Requirements 5–12), §API surface

**Author: agent.** Blocked by I-VPD8Y-1 (adds the `location` column, BAG / STASH, to
`item_instances`, in migration 000027). This slice reads `location` to find bag items.

## What to Build

1. **Migration** (`000028`, after I-VPD8Y-1's `000027`; renumber if another lands first): widen
   `item_instances_status_check` to `AVAILABLE, LISTED, PENDING_SETTLEMENT, IN_RUN`; add nullable
   `run_id UUID` (no FK); CHECK `(status = 'IN_RUN') = (run_id IS NOT NULL)`; partial index on
   `run_id WHERE run_id IS NOT NULL`. Down migration reverses it (refuse or reset IN_RUN rows
   first, as 000021 did for its rename).
2. **Proto** (`common/api/proto/items/items.proto`, then regenerate; never hand-edit the `.pb.go`):
   `rpc CheckOutRunGear(CheckOutRunGearRequest) returns (CheckOutRunGearResponse)`;
   request `member_id`, `run_id`; response `GetLoadoutWithItemsResponse loadout = 1; repeated
   ItemInstance bag = 2;`. Update the `ItemInstance.status` comment to list IN_RUN.
3. **Service + repository**: owner check first (`ensureOwner`, as `GetLoadoutWithItems`). One
   transaction: lock the member's loadout row and candidate instances; re-tag every instance of
   the member that is `IN_RUN` under another run id (orphan reclaim, R9); move worn instances
   and non-worn BAG-location instances whose status is `AVAILABLE` or `IN_RUN` to `IN_RUN` with
   this `run_id`; return the worn ones in their slots and the bag ones in bag order (R11).
   LISTED, PENDING_SETTLEMENT and STASH instances are untouched and not returned. Repeat calls
   with the same run id are no-ops that return the same set (R10).
4. **gRPC handler**: map malformed ids to `InvalidArgument`, forbidden to `PermissionDenied`, a
   store outage as the existing handlers do.
5. `GetLoadoutWithItems` is unchanged (R12).

**Hard bounds:** no settlement change (slice 2), no game-service change (slice 3), no HTTP
change (slice 5).

## Acceptance Criteria

- [ ] Migration up/down applies cleanly; inserting `IN_RUN` without `run_id` (or the reverse) fails the constraint.
- [ ] Checkout moves AVAILABLE worn and bag items to IN_RUN under the run id and returns them, worn in slots, bag as a list.
- [ ] LISTED, PENDING_SETTLEMENT and STASH-location items are not touched and not returned; a listed worn item is an empty slot.
- [ ] A checkout under run B re-tags items IN_RUN under run A and returns the worn and bag ones.
- [ ] A repeat checkout under the same run id returns the same set and changes nothing.
- [ ] A caller checking out another member's gear is refused and nothing is written.
- [ ] A member with no loadout row checks out an empty loadout and their bag.
- [ ] Bag over 30 is returned in full.
- [ ] Repository tests run against Postgres (integration suite) for the conditional writes and the lock.
- [ ] `go test ./...` and `golangci-lint run` in items-service: no new failures.

## Files expected to touch

- `game-server/items-service/migrations/000028_item_instance_in_run.{up,down}.sql` (new)
- `game-server/common/api/proto/items/items.proto` and regenerated `items.pb.go`, `items_grpc.pb.go`
- `game-server/items-service/internal/items/service.go`, `repository.go`, `handler.go`, `model.go`
- Tests: `service_test.go`, `repository_test.go`, `handler_test.go` (or a new `checkout_test.go`)
- Mocks implementing the items gRPC client interface in game-service tests, if the generated interface grows (compile-only)

## Blocked By

- I-VPD8Y-1: the `location` column. Both slices also edit `items.proto` and regenerate it; rebase on it.

## Spec Reference

FS-18Z5F §A R1–R4, §B R5–R12, §API surface (CheckOutRunGear row); User Stories 1, 9, 10, 12, 17, 22; Edge States "Item LISTED or PENDING_SETTLEMENT at seating", "Concurrent list and checkout", "Concurrent equip and checkout", "Unauthorized checkout".

## TDD Approach

- RED: checkout of a member with one AVAILABLE worn sword and one AVAILABLE bag potion returns both, both rows now IN_RUN with the run id.
- RED: same member with the sword LISTED returns an empty weapon slot and leaves the sword LISTED.
- RED: second checkout under a new run id re-tags and returns both.
- GREEN: the transaction, the conditional update, the reclaim update.
