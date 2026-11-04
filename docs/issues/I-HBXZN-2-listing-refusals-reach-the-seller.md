---
id: I-HBXZN-2
status: done
implements: FS-HBXZN
blocked_by: [I-HBXZN-1]
labels: [ready-for-agent]
title: "FS-HBXZN slice 2: Listing refusals reach the seller as codes and copy (marketplace-service, api-gateway, game-client)"
---
Implements FS-HBXZN §Requirements B6–B9, C10–C12, D17–D18, §API surface

One slice on purpose (FS R18): the pass-through turns today's 500 into a 400/404, and without the
client's code switch a listed relic would read "That end time has already passed". Ship the
marketplace change, the contract and the client copy together.

## What to Build

**marketplace-service** (backend, charter-authorized):
- When items' `ReserveItem` answers a status from which `errcode.RefusalReason` reads a code,
  `ListItem` answers that same refusal (`FailedPrecondition` + `ErrorInfo`, same reason). When
  items answers `NotFound`, `ListItem` answers `NotFound`. `Unavailable`/`DeadlineExceeded` stay
  transient → `Unavailable`; everything else stays `Internal`. One way to do it: the
  `itemreserver` adapter translates a received refusal into `errcode.Refuse(code)` and a received
  `NotFound` into `commonconstants.ErrNotFound`; `mapError` gains an `errors.As(err, &refusal)`
  case returning `refusal.GRPCStatus().Err()` (its existing `ErrNotFound` case already answers
  NotFound). No worn check in marketplace.
- Email gate and listing-terms validation stay ahead of the items call.

**api-gateway**:
- `create-listing` in `internal/gateway/listing/typed.go`: description gains
  "Refusals: ITEM_WORN (the item is worn), ITEM_NOT_AVAILABLE (listed, in escrow, pending
  settlement or in a delve), EMAIL_UNVERIFIED (email not verified). An item that is not the
  member's answers 404."; `Errors` gains `http.StatusNotFound`. No change to `httperr`.
- `make openapi && make client`; commit `openapi.yaml` and `game-client/src/api/generated/` with
  the handler. Never hand-edit either.

**game-client**:
- `src/marketplace/listRelic.ts`: new constant `WORN_CANNOT_LIST = "Take it off first — worn
  relics can't be listed."`; `createListingFailureMessage` maps `ITEM_WORN` → it,
  `ITEM_NOT_AVAILABLE` → `CANNOT_LIST`, `404` → `CANNOT_LIST`, `500` → `LIST_FAILED`;
  `EMAIL_UNVERIFIED`, other 400s, 503 and non-API errors unchanged. Fix the doc comments that
  call a 500 "the items-side refusal" (the function's and `instanceStatus`'s).

## Acceptance Criteria

- [ ] marketplace: `ListItem` with an items stub answering an `ITEM_WORN` refusal answers
      `FailedPrecondition` with `ErrorInfo` reason `ITEM_WORN`; same for `ITEM_NOT_AVAILABLE`.
- [ ] marketplace: items `NotFound` → `ListItem` `NotFound`; items `Unavailable` → `Unavailable`;
      any other items error → `Internal`.
- [ ] marketplace: unverified email and invalid terms are refused before the items stub is called
      (existing tests stay green); no worn check exists in marketplace-service.
- [ ] gateway: the generated `openapi.yaml` shows the Refusals text and a `404` response on
      `create-listing`; `make openapi` leaves no diff after commit; the contract gates pass.
- [ ] client: `createListingFailureMessage` table test covers `ITEM_WORN`, `ITEM_NOT_AVAILABLE`,
      404, `EMAIL_UNVERIFIED`, a plain 400 (buyout and end-time readings), 500, 503 and a
      non-ApiError.
- [ ] End to end (local stack, with I-HBXZN-1): `POST /api/marketplace/listings` for a worn item
      answers `400 · ITEM_WORN` and the drawer shows "Take it off first — worn relics can't be
      listed."; a listed item answers `400 · ITEM_NOT_AVAILABLE`; another member's item `404`.
- [ ] Go tests, vet, lint clean in marketplace-service and api-gateway; client tests, typecheck
      and lint clean.

## Blocked By

I-HBXZN-1 (the end-to-end criterion needs items to answer the codes; the marketplace and client
units can be written against stubs before it lands)

## Spec Reference

FS-HBXZN §Requirements B6–B9 (pass-through), C10–C12 (contract), D17–D18 (copy, ship together);
§API surface rows "Create listing", "List item"; User Stories 4, 7, 8, 13, 14, 16, 17.

## Files expected

- `game-server/marketplace-service/internal/listing/adapter/itemreserver/grpc_item_reserver.go`
  (+ `grpc_item_reserver_test.go`)
- `game-server/marketplace-service/internal/listing/grpc/handler.go` (`mapError`)
  (+ `list_item_handler_test.go`)
- `game-server/api-gateway/internal/gateway/listing/typed.go`
- `game-server/api-gateway/openapi.yaml` (generated)
- `game-client/src/api/generated/` (generated)
- `game-client/src/marketplace/listRelic.ts` (+ `listRelic.test.ts`)

## TDD Approach

- RED: marketplace `ListItem` test with an item reserver returning a gRPC `ITEM_WORN` refusal
  expects `FailedPrecondition` + reason `ITEM_WORN` (today: `Internal`).
- GREEN: adapter translation + `mapError` refusal case.
- RED: client — `createListingFailureMessage(new ApiError(400, …code ITEM_WORN))` returns the new
  copy (today: the end-time copy).
- GREEN: code switch ahead of the status reading.
