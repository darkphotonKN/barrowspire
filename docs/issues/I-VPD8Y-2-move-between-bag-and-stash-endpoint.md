---
id: I-VPD8Y-2
status: done
implements: FS-VPD8Y
blocked_by: [I-VPD8Y-1]
labels: []
title: "FS-VPD8Y slice 2: PUT /api/items/instances/{id}/location moves an item between bag and stash"
---
Implements FS-VPD8Y §A Requirements 4–5, 10–13, §C Requirements 22, 24–26, §API surface (`move-item-instance`)

**Author: agent** (charter default)

## What to Build

One working endpoint, end to end, including the repo's first domain-specific error codes.

- items-service: new gRPC `MoveItemInstance(MoveItemInstanceRequest{item_instance_id, location})
  returns (MoveItemInstanceResponse{id, location})`. The caller comes from the authenticated
  context only (R12): no member id field.
- Service rules in R10's order: not found / not owned → `codes.NotFound`; in the caller's loadout
  → `ITEM_WORN`; status not `AVAILABLE` → `ITEM_NOT_AVAILABLE`; already there → success, no write;
  destination count (excluding worn, including every status) at or over cap → `BAG_FULL` /
  `STASH_FULL`. Write conditional on owner = caller and status = `AVAILABLE`; a 0-row write is
  `ITEM_NOT_AVAILABLE`.
- Per-account lock (R11): one transaction takes a per-account lock (e.g. `pg_advisory_xact_lock`
  keyed by the member id) before counting. Put the lock helper where slice 3's loadout write can
  reuse it.
- Domain refusals answer `codes.FailedPrecondition` with a `google.rpc.ErrorInfo` detail,
  `reason` = the code (R13). Malformed id / unknown location → `InvalidArgument`.
- `game-server/common/errcode`: add `BagFull`, `StashFull`, `ItemNotAvailable`, `ItemWorn`
  (`BAG_FULL`, `STASH_FULL`, `ITEM_NOT_AVAILABLE`, `ITEM_WORN`) under "Domain-specific", each
  citing FS-VPD8Y (R24).
- `api-gateway/internal/httperr` `mapError`: `FailedPrecondition` whose `ErrorInfo.reason` is a
  registered code → `400` with that code; otherwise `400 · FAILED_PRECONDITION` exactly as today
  (R25). Existing httperr tests stay green unchanged.
- Gateway typed op `move-item-instance`, `PUT /api/items/instances/{id}/location`, beside the
  other items ops in `typed.go`: `id` path `format:"uuid"`, body `location` `enum:"bag,stash"`
  required, items-group envelope, `result: {id, location}`; Errors declare 400, 401, 404, 422,
  500 (and 503 if the group declares it). Register it in `RegisterOperations`.
- `make openapi && make client`; commit the three together.

## Acceptance Criteria

- [ ] Owned, unworn, `AVAILABLE` bag item → `200`, and it reads `stash` on the next list (and back).
- [ ] Same-location move → `200`, nothing written, even when that location is full.
- [ ] Unknown or foreign id → `404 · NOT_FOUND`; worn → `400 · ITEM_WORN`; listed / pending settlement → `400 · ITEM_NOT_AVAILABLE`; bag at 30 → `400 · BAG_FULL`; stash at 60 → `400 · STASH_FULL`; malformed id or location → `422 · VALIDATION_FAILED`; each `application/problem+json` (assert the Content-Type in at least one test).
- [ ] An account over a cap: moves out succeed, moves in refused, nothing removed.
- [ ] Concurrency test: two concurrent moves into a bag at 29 → bag 30, one `BAG_FULL`.
- [ ] A move racing a reservation never leaves a `LISTED` item with a changed location.
- [ ] Any `FailedPrecondition` without a registered reason still maps to `400 · FAILED_PRECONDITION`.
- [ ] Table-driven tests next to the code; `go test ./...` passes in items-service, api-gateway, common.
- [ ] No hand edit to generated proto Go, `openapi.yaml` or the generated client.

## Blocked By

I-VPD8Y-1 (the `location` column and proto field)

## Spec Reference

FS-VPD8Y §A R4–R5, R10–R13; §C R22, R24–R26; §API surface row `move-item-instance`; §Edge States (same-location, concurrent, race with listing, unauthorised). User stories 10–11, 14–16, 21, 29–31.

## TDD Approach

- RED: service table test — each R10 branch returns the right sentinel / no-op; httperr test — `FailedPrecondition` + `ErrorInfo{reason: BAG_FULL}` → `400 · BAG_FULL`.
- GREEN: the RPC, service, conditional repository write, errcode constants, seam mapping, typed op.

## Files it expects to touch

`game-server/common/api/proto/items/items.proto` (+ regenerated), `game-server/items-service/internal/items/{service,repository,handler,model}.go` (+ tests), `game-server/common/errcode/errcode.go`, `game-server/api-gateway/internal/httperr/httperr.go` (+ test), `game-server/api-gateway/internal/gateway/item/{typed,wire,client}.go` (+ tests), `game-server/api-gateway/openapi.yaml`, `game-client/src/api/generated/schema.d.ts`
