---
id: I-VPD8Y-3
status: done
implements: FS-VPD8Y
blocked_by: [I-VPD8Y-2]
labels: []
title: "FS-VPD8Y slice 3: unequip and swap land in the bag; a full bag refuses with BAG_FULL"
---
Implements FS-VPD8Y §B Requirements 16–20, §C Requirement 23, §API surface (`update-loadout`)

**Author: agent** (charter default)

## What to Build

`PUT /api/items/loadout` becomes location-aware and capped.

- items-service `UpdateLoadout`: in one transaction under the per-account lock from slice 2 (R11),
  read the slot's current instance, then:
  - unequip (empty id): set the previous instance `location = 'BAG'` and clear the slot (R17);
    refuse with `BAG_FULL` when the bag holds 30 or more (R18);
  - equip into an occupied slot: set the displaced instance `location = 'BAG'` (R16); refuse with
    `BAG_FULL` only when the swap would grow a bag at or over 30, i.e. the equipped item was not a
    bag item (R18);
  - equip into an empty slot: always allowed.
  - Equip from the stash is not refused (R19).
- The handler maps the refusal to `FailedPrecondition` + `ErrorInfo{reason: BAG_FULL}` (today
  every error is `Internal`; keep other mappings as they are).
- `UpsertPlayerLoadoutTx` (extraction) is untouched (R20).
- Gateway `update-loadout`: Errors already include 400; update the description to say an unequip
  into a full bag is refused. `make openapi && make client` if the document changes.

## Acceptance Criteria

- [ ] Unequip sets the item to `bag`; the next list shows it in the bag.
- [ ] A swap sends the displaced item to `bag`.
- [ ] Unequip with 30 in the bag → `400 · BAG_FULL`, slot and locations unchanged.
- [ ] A bag-item swap at 30 succeeds and leaves the bag at 30; an equip into an empty slot at 30 leaves 29.
- [ ] A bag already over 30 keeps every item.
- [ ] Table-driven tests next to the code; `go test ./...` passes in items-service and api-gateway.

## Blocked By

I-VPD8Y-2 (the per-account lock, the `BAG_FULL` code and its seam mapping)

## Spec Reference

FS-VPD8Y §B R16–R20; §C R23; §API surface row `update-loadout`. User stories 22–23, 29.

## TDD Approach

- RED: service table test — unequip at 30 → `BAG_FULL`, nothing written; swap at 30 → allowed, displaced item `BAG`.
- GREEN: transactional read-then-write in `UpdateLoadout` with the location updates.

## Files it expects to touch

`game-server/items-service/internal/items/{service,repository,handler}.go` (+ tests), `game-server/api-gateway/internal/gateway/item/typed.go` (description), possibly `game-server/api-gateway/openapi.yaml` + `game-client/src/api/generated/schema.d.ts`
