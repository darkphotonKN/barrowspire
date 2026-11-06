---
id: I-3R77D-1
status: done
implements: FS-3R77D
blocked_by: []
labels: [ready-for-agent]
title: "FS-3R77D slice 1: items refuses to reserve an item outside the stash with ITEM_NOT_IN_STASH, and the seller reads why (errcode, items-service, marketplace tests, api-gateway, game-client copy)"
---
Implements FS-3R77D §Requirements A1, B2–B6, C7–C9, D15, §API surface, §Edge States (move and list race, relic moved to the bag after the drawer opened, bag item at the cap, API caller)

Backend (human lane): authorized by the owner's brief for this feature. One slice on purpose:
a new 400 code without its client copy would fall to the end-time reading (FS-3R77D R15,
the same reason as FS-HBXZN R18), so the refusal, the contract and the copy ship together.

## What to Build

**common/errcode**: `ItemNotInStash Code = "ITEM_NOT_IN_STASH"` with a comment naming the rule
and FS-3R77D; register it in `domainCodes`; add it to the registry round-trip test.

**items-service** (`internal/items/service.go` `ReserveItem`): after the worn check and before
`CountListedTx`, `placement.Location != LocationStash` → `errcode.Refuse(errcode.ItemNotInStash)`.
Update the doc comment's check list. `ReserveItemTx` and the handler unchanged. The opt-in
database tests that expect a reservation to succeed seed the item in the stash.

**marketplace-service**: no production change. Add `ITEM_NOT_IN_STASH` rows to the item
reserver's refusal table test and to `ListItem`'s pass-through table test.

**api-gateway**: add `ITEM_NOT_IN_STASH (the item is in the bag; only stash items can be
listed)` to `create-listing`'s "Refusals:" list in `internal/gateway/listing/typed.go`;
`make openapi && make client`; commit the description, `openapi.yaml` and the generated client
together.

**game-client** (`src/marketplace/listRelic.ts`): `NOT_IN_STASH_CANNOT_LIST = "Only relics in
your stash can be listed. Move it into your stash in town."`, mapped from `ITEM_NOT_IN_STASH` in
`REFUSAL_COPY`.

## Acceptance Criteria

- [x] `ITEM_NOT_IN_STASH` crosses gRPC as `FailedPrecondition` with `ErrorInfo` reason
      `ITEM_NOT_IN_STASH` (errcode test).
- [x] Service table test: an AVAILABLE, unworn bag placement answers `ITEM_NOT_IN_STASH` after
      lock and read, without counting or reserving; a stash placement reserves; a worn bag
      placement answers `ITEM_WORN`; a LISTED bag placement answers `ITEM_NOT_AVAILABLE`; a bag
      placement at the cap answers `ITEM_NOT_IN_STASH`. No outbox row on any refusal.
- [x] Opt-in schema test (throwaway database): a bag item is refused and left AVAILABLE with no
      listing and no outbox row; a stash item is reserved as before; the other opt-in reserve
      tests pass with stash seeds.
- [x] Opt-in race (added in fix round 1): a stash→bag `MoveItemInstance` racing `ReserveItem`
      of the same item ends with exactly one success, and the item is never LISTED in the bag,
      with no location predicate in the reserve's UPDATE (FS-3R77D R5).
- [x] marketplace: the reserver and `ListItem` pass `ITEM_NOT_IN_STASH` through as
      `FailedPrecondition` with that reason.
- [x] gateway: the generated `openapi.yaml` lists `ITEM_NOT_IN_STASH` on `create-listing`;
      `make gates` passes every gate this slice can affect. The seam gate (and its selftest,
      which requires the real tree to pass it) fails on 11 direct error writes in
      `internal/gateway/wallet/handler.go`, pre-existing since 5583980f (FS-8EGFA) and untouched
      here.
- [x] client: `createListingFailureMessage` maps `ITEM_NOT_IN_STASH` to its copy; the other rows
      are unchanged.
- [x] `go test ./...` and `go vet` clean in common, items-service, marketplace-service and
      api-gateway; `golangci-lint run --new-from-rev=500b6b3d` reports no new findings (the
      services carry pre-existing findings in untouched files); client tests and `tsc` clean.

## Evidence (2026-11-06, fix round 1, at 64a35a84)

- **Opt-in DB tests, fresh throwaway database** on the local docker Postgres
  (`barrowspire-postgres`), never a service's own database:
  `CREATE DATABASE items_stash_only_throwaway2` →
  `migrate -path ./migrations -database "$DSN" up` (version 30) →
  `ITEMS_TEST_DSN="$DSN" go test ./internal/items/ -count=1 -v` → `ok`, 167 top-level tests
  passed, 0 failed, **0 skipped**; among them `TestServiceReserveItem_Rules`, `_AgainstTheSchema`,
  `_ListedItemCap`, `_ConcurrentReservesAt19`, `_WaitsForAnEquipInProgress`, `_RacingAnEquip`,
  `_RacingAMoveToTheBag` → `DROP DATABASE items_stash_only_throwaway2`.
- **Mutation check of the race test**: with the `placement.Location != LocationStash` case
  removed from `ReserveItem`, `TestServiceReserveItem_RacingAMoveToTheBag` failed ("run 1: both
  the move and the reservation succeeded"); restored with `git checkout`, it passes.
- **`make gates`** (api-gateway): openapi-diff "committed spec matches regenerated";
  lint-contract 0 errors (1 pre-existing warning, `paths./api/notification/`); openapi-breaking
  "No breaking changes"; gates-selftest "gates observed rejecting known-bad input";
  contract-auth "43 secured, 6 public, none inconsistent"; seam gate FAILED on
  `wallet/handler.go` only (pre-existing, see above); `make seam-gate-selftest` fails for the
  same reason.
- **Go**, without the DB: `go test ./...` common 17 packages ok, items-service 1, marketplace-service
  14, api-gateway 14, 0 failures; `go vet ./...` exit 0 in all four.
- **Client**: `npx vitest run` 230 files, 5543 tests passed; `npx tsc --noEmit -p .` exit 0.

## Blocked By

None

## Spec Reference

FS-3R77D §Requirements A1 (the code), B2–B6 (the refusal and its order), C7–C9 (pass-through,
description, regenerated contract), D15 (the copy); §API surface rows "Create listing",
"Reserve item", "List item"; User Stories 8, 14–19.

## TDD Approach

- RED: `TestServiceReserveItem_Rules` row "a bag item is not in the stash" expects
  `ITEM_NOT_IN_STASH` and calls `lock,read` (today: reserved).
- GREEN: the location check after worn.
- RED: client `createListingFailureMessage(ApiError 400 ITEM_NOT_IN_STASH)` expects the new copy
  (today: the end-time copy).
- GREEN: the `REFUSAL_COPY` row.
