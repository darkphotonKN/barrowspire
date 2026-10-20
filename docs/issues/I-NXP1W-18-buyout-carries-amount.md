---
id: I-NXP1W-18
status: open
implements: FS-NXP1W
blocked_by: [I-NXP1W-17]
labels: []
title: "FS-NXP1W slice 18: buyout carries the amount the buyer agreed to; refused when it is not the buyout price"
---
Implements FS-NXP1W §HTTP entry points (Req 43), §API surface, §Acceptance Criteria

**Author:** unassigned

## What to Build

The buyout request carries `amount`, the gold the buyer saw and agreed to. Marketplace compares it
with the listing's buyout price **under the row lock** and refuses a mismatch; the gold held is still
the listing's own price. This brings the `buyout` operation to the §API surface row's body and its
`400 · VALIDATION_FAILED` "amount differs from the buyout price" error, and makes buyout read like
place-bid (`{ amount }`) to the client.

Today the buyout price cannot change after listing, so a mismatch only comes from a client bug. The
check exists so that the day listings become editable, a buyer can never be charged a price they
were not shown, without a breaking change to add it then.

Ships on the I-NXP1W-17 branch and merges with it, so `main` never publishes the body-less form and
the contract change is not breaking.

`Idempotency-Key` stays out (decided 2026-10-20): replays are idempotent by `BuyoutBidID`, and a
caller-minted key would hand the client a duty the deterministic ID already removes. Record that as
an ADR before merge so the remaining §API surface deviation has an anchor.

Layers, end to end:

- **proto** (`common/api/proto/marketplace/marketplace.proto`): `BuyoutRequest` gains
  `int64 amount = 2;`, then `make -C game-server/common gen`. Never hand-edit the generated Go.
- **domain** (`marketplace-service/internal/listing/domain/listing`): a new
  `ErrBuyoutAmountMismatch` in `errors.go`; `CanBuyout` / `Buyout` take the amount and refuse a
  mismatch after the seller and no-price checks.
- **usecase** (`usecase/buyout.go`): `BuyoutCommand` gains `Amount`; the advisory pre-check refuses a
  mismatch **before** `PlaceHold`, so a wrong amount never holds gold. The hold stays priced from the
  listing.
- **grpc** (`grpc/handler.go`): pass `req.GetAmount()` through; `mapError` maps
  `ErrBuyoutAmountMismatch` to `codes.InvalidArgument` (the gateway already turns that into
  `400 · VALIDATION_FAILED`). Add it to `isDefinitiveBuyoutRefusal` so a refusal that slips past the
  pre-check releases its hold.
- **gateway** (`api-gateway/internal/gateway/listing`): a `BuyoutBody{ Amount int64 }` in `model.go`
  with `minimum:"1"`, required; `registerBuyout` takes `Body BuyoutBody` and forwards it. Update the
  operation description. Then `make openapi && make client`.

### Replay with a different amount

A buyout already recorded is a replay and succeeds before any rule is checked (`Buyout`'s first
line), because its own settlement may already have frozen the listing. Keep that: the first attempt
already passed the amount check at the listing's price, so a later replay's amount is moot. Pin it
with a test so it is a decision, not an accident.

## Acceptance Criteria

- [ ] `POST .../buyout` with `{"amount": <buyout price>}` from a non-seller answers `202` and behaves as I-NXP1W-17 does today.
- [ ] `amount` different from the buyout price answers `400 · VALIDATION_FAILED`; no gold is held and no bid is recorded.
- [ ] A missing, zero or negative `amount`, or an unknown body member, answers `422 · VALIDATION_FAILED` at the gateway and never reaches marketplace.
- [ ] A replay of a recorded buyout succeeds whatever amount it carries.
- [ ] Every I-NXP1W-17 refusal still maps as before (seller `403`, closed or no price or short of gold `400 · FAILED_PRECONDITION`, busy `409 · CONFLICT`, spent ID `409 · ALREADY_EXISTS`).
- [ ] proto regenerated; `openapi.yaml` and `game-client/src/api/generated/` regenerated; oasdiff reports no break against `main`.
- [ ] ADR recorded for leaving `Idempotency-Key` out.
- [ ] Tests pass (domain, usecase, grpc mapping, gateway).

## Blocked By

I-NXP1W-17 (same branch; the route this changes)

## Spec Reference

FS-NXP1W §HTTP entry points Req 43 ("the caller's amount must equal that price"); §API surface
`buyout` row (request body `amount` integer ≥ 1; `400 · VALIDATION_FAILED` amount differs);
§Acceptance Criteria "`POST .../buyout` from a non-seller at the buyout price answers `202`…".

## TDD Approach

- RED (domain): `Buyout` with an amount one under the buyout price returns `ErrBuyoutAmountMismatch` and records no bid.
- RED (usecase): a mismatched amount never calls `PlaceHold`.
- RED (domain): a replay of a recorded buyout with a different amount succeeds.
- RED (grpc): `ErrBuyoutAmountMismatch` maps to `InvalidArgument`.
- RED (gateway): the body's amount reaches `BuyoutRequest.Amount`; a missing amount is `422` with no call.
