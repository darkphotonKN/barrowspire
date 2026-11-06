---
id: I-3R77D-1
status: open
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

- [ ] `ITEM_NOT_IN_STASH` crosses gRPC as `FailedPrecondition` with `ErrorInfo` reason
      `ITEM_NOT_IN_STASH` (errcode test).
- [ ] Service table test: an AVAILABLE, unworn bag placement answers `ITEM_NOT_IN_STASH` after
      lock and read, without counting or reserving; a stash placement reserves; a worn bag
      placement answers `ITEM_WORN`; a LISTED bag placement answers `ITEM_NOT_AVAILABLE`; a bag
      placement at the cap answers `ITEM_NOT_IN_STASH`. No outbox row on any refusal.
- [ ] Opt-in schema test (throwaway database): a bag item is refused and left AVAILABLE with no
      listing and no outbox row; a stash item is reserved as before; the other opt-in reserve
      tests pass with stash seeds.
- [ ] marketplace: the reserver and `ListItem` pass `ITEM_NOT_IN_STASH` through as
      `FailedPrecondition` with that reason.
- [ ] gateway: the generated `openapi.yaml` lists `ITEM_NOT_IN_STASH` on `create-listing`;
      `make gates` passes.
- [ ] client: `createListingFailureMessage` maps `ITEM_NOT_IN_STASH` to its copy; the other rows
      are unchanged.
- [ ] `go test ./...`, `go vet` and `golangci-lint run` clean in common, items-service,
      marketplace-service and api-gateway; client tests and `tsc` clean.

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
