---
id: I-VPD8Y-1
status: done
implements: FS-VPD8Y
blocked_by: []
labels: []
title: "FS-VPD8Y slice 1: every owned instance has a bag or stash location, readable over HTTP"
---
Implements FS-VPD8Y §A Requirements 1–9, 14–15, §C Requirements 21, 26, §API surface (`list-item-instances`)

**Author: agent** (charter default: agent-built throughout; no human-lane split)

## What to Build

The foundation: items-service stores where each owned instance sits, every write that creates or
re-owns an instance sets it, and the instances list returns it.

- Migration `000027` (up + down) in `game-server/items-service/migrations/`: `item_instances.location`
  NOT NULL, `BAG` | `STASH` only (CHECK or enum), every existing row `STASH` (R1, R3).
- `ItemInstance` model + the instance SELECTs (`ListItemInstances`, the loadout-with-items read,
  `GetItemInstanceByID`) read `location`.
- `TransferItem` (repository) sets `location = 'STASH'` in the same conditional update that changes
  the owner (R7). `ReturnItem`, `UnfreezeItem`, `CancelReservation`, `ReserveItem` leave it alone (R8).
- Run extraction (`batchUpsertQuery` / `BatchUpsertItemInstances`) writes `location = 'BAG'` on
  insert and on `ON CONFLICT` (R9). Not capped.
- `BagCapacity = 30`, `StashCapacity = 60` named constants (R4) (used from slice 2 on; define here).
- Proto `ItemInstance` gains `string location = 26`, carried lowercase `bag` | `stash` (R14);
  `itemInstanceToProto` maps from the column. Regenerate the Go from `.proto`; never hand-edit.
- Gateway `wire.go` `ItemInstance` gains `Location` `json:"location"` (no `omitempty`: always
  present; comment that this is deliberate, contract-patterns §5) with `enum:"bag,stash"`. The
  `list-item-instances` description stops calling the list "the member's stash".
- `make openapi && make client`; commit `openapi.yaml` and `game-client/src/api/generated/` with the
  handler change.

## Acceptance Criteria

- [ ] Migration up adds the column with every pre-existing row `STASH`; down drops it.
- [ ] `GET /api/items/instances` returns `location` on every item; `openapi.yaml` declares it a required enum `bag | stash`.
- [ ] A completed transfer leaves the item `stash` for the buyer; a returned listing keeps its location.
- [ ] Items written by an extraction read `bag`, new and returning.
- [ ] Repository / handler tests table-driven next to the code; `go test ./...` passes in items-service and api-gateway.
- [ ] No hand edit to generated proto Go, `openapi.yaml` or the generated client.

## Blocked By

None

## Spec Reference

FS-VPD8Y §A R1–R9, R14–R15; §C R21, R26; §API surface row `list-item-instances`. User stories 2, 24–26, 32–33.

## TDD Approach

- RED: a repository test that `ListItemInstances` returns `Location` for a seeded row, and that `TransferItem` leaves the buyer's item at `STASH`.
- GREEN: migration + SELECT column + the transfer update.

## Files it expects to touch

`game-server/items-service/migrations/000027_*.sql`, `internal/items/{model,repository,handler}.go` (+ tests), `game-server/common/api/proto/items/items.proto` (+ regenerated `*.pb.go`), `game-server/api-gateway/internal/gateway/item/{wire,typed}.go` (+ tests), `game-server/api-gateway/openapi.yaml`, `game-client/src/api/generated/schema.d.ts`
