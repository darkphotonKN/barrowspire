---
id: I-18Z5F-5
status: done
implements: FS-18Z5F
blocked_by: [I-18Z5F-1, I-VPD8Y-2, I-VPD8Y-3]
labels: []
title: "FS-18Z5F slice 5: the hub loadout update refuses an item that is not AVAILABLE with ITEM_NOT_AVAILABLE (items-service, gateway)"
---
Implements FS-18Z5F §G (Requirements 32–35), §A (Requirement 4), §API surface

**Author: agent.**

## What to Build

1. **items-service `UpdateLoadout`** (R32): I-VPD8Y-3 already turns it into one transaction
   (read-then-write under the per-account lock). Add to that transaction: equipping a non-empty
   `item_instance_id` locks the instance and refuses anything not `AVAILABLE` with the
   not-available sentinel. Clearing a slot is not checked. The handler maps it to gRPC
   `FailedPrecondition` with `ErrorInfo{reason: ITEM_NOT_AVAILABLE}`, as I-VPD8Y-2 does for the
   move.
2. **errcode and seam** (R33): reuse what I-VPD8Y-2 builds (`errcode.ItemNotAvailable` and the
   `ErrorInfo` reason mapping in `httperr.mapError`). Build them here only if this slice lands
   first, exactly as I-VPD8Y-2 specifies, and tell its owner.
3. (no separate gateway work beyond the documented error on the typed route)
4. **Wire enum** (R4): `api-gateway/internal/gateway/item/wire.go` status enum gains `IN_RUN`.
   `PUT /api/items/loadout` documents the new 400 code if the typed registration lists codes.
   Run `make openapi && make client`; commit the handler, `openapi.yaml` and
   `game-client/src/api/generated/` together, never hand-edited. If the breaking-change ratchet
   flags the added response enum value (ADR-0003, `--fail-on WARN`), add a reasoned
   `.oasdiff-ignore` entry.
5. **Marketplace** (R34): no change; add a regression test in items-service that ReserveItem,
   FreezeItem, ReturnItem, UnfreezeItem, TransferItem and CancelReservation each refuse an
   IN_RUN item.

**Hard bounds:** no game-service change; the bag ↔ stash move is FS-VPD8Y's.

## Acceptance Criteria

- [ ] `PUT /api/items/loadout` equipping an IN_RUN, LISTED or PENDING_SETTLEMENT instance answers 400 with `code: ITEM_NOT_AVAILABLE`; the loadout is unchanged.
- [ ] Equipping an AVAILABLE instance and clearing a slot behave as today.
- [ ] Existing httperr tests stay green (the seam itself is I-VPD8Y-2's).
- [ ] Each marketplace item write refuses an IN_RUN item.
- [ ] `openapi.yaml` and the generated client list `IN_RUN` in the item status enum; `make -C game-server/api-gateway gates` passes.
- [ ] `go test ./...`, `golangci-lint run` in items-service and api-gateway: no new failures.

## Files expected to touch

- `game-server/items-service/internal/items/service.go`, `repository.go`, `handler.go`, `model.go` (sentinel)
- `game-server/api-gateway/internal/gateway/item/wire.go`, `typed.go`
- `game-server/api-gateway/openapi.yaml`, `game-client/src/api/generated/` (regenerated)
- `game-server/.oasdiff-ignore` (only if the ratchet flags the enum addition)
- Tests: items `service_test.go` / `handler_test.go`, `repository_test.go`; gateway `httperr_test.go`, `item/typed_test.go`; `game-server/contract-fixtures/` if a fixture covers this route

## Blocked By

- I-18Z5F-1: the IN_RUN status exists.
- I-VPD8Y-2: the `ErrorInfo` seam and `errcode.ItemNotAvailable`.
- I-VPD8Y-3: `UpdateLoadout` as one transaction (this slice adds a check to it).

## Spec Reference

FS-18Z5F §G R32–R35, §A R4, §API surface (update loadout, list instances rows); User Stories 9, 10, 14; Edge States "Concurrent equip and checkout".

## TDD Approach

- RED: UpdateLoadout with an IN_RUN instance → `ErrItemNotAvailable`; the slot unchanged.
- RED: `PUT /api/items/loadout` with an IN_RUN instance → 400, code ITEM_NOT_AVAILABLE.
- GREEN: the status check inside I-VPD8Y-3's transaction, the detail.
