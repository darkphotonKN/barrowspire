---
id: I-F692V-1
status: done
implements: FS-F692V
blocked_by: []
labels: [ready-for-agent]
title: "FS-F692V slice 1: accept carries the seller's floor end to end, and marketplace refuses below it (marketplace, common, api-gateway, game-client)"
---
Implements FS-F692V §Requirements 1–9, §API surface, §Acceptance Criteria (server; client "Sell sends minAmount"), §Edge States

## What to Build

One vertical behavior: the seller's accept carries the leading bid they were shown, and the server
never starts a settlement whose WINNING bid is below it.

- **Proto** (`game-server/common/api/proto/marketplace/marketplace.proto`): `AcceptBidRequest` gains
  `int64 min_amount = 2`. Regenerate with `make gen` in `game-server/common`. Never hand-edit the
  generated `.pb.go` files.
- **errcode** (`game-server/common/errcode/errcode.go`): new `LeadingBidLowered Code =
  "LEADING_BID_LOWERED"`, listed in `domainCodes` (an unregistered code would answer Internal).
- **Domain** (`marketplace-service/internal/listing/domain/listing/`): `CanAcceptBid` gains the floor.
  The floor check runs after the existing seller, open/ended and someone-leads checks. A WINNING
  amount below the floor is refused with the new refusal; equal or higher is allowed.
- **Use case** (`usecase/accept_bid_usecase.go`): `AcceptBidCommand` carries the floor and asks
  `CanAcceptBid` with it on the existing unlocked read. Settlement starts only when allowed. The
  workflow input is unchanged: no bid id, no amount.
- **gRPC** (`grpc/handler.go`): read `min_amount`; ≤ 0 → `InvalidArgument` without calling the use
  case. Map the floor refusal to `FailedPrecondition` with ErrorInfo reason `LEADING_BID_LOWERED`,
  via `errcode.Refuse`, the way the handler already passes refusals through.
- **Gateway** (`api-gateway/internal/gateway/listing/typed.go`, `model.go`): accept-bid takes a body
  `{ "minAmount": int64, minimum 1, required }` (a new `AcceptBidBody`, like `BuyoutBody`) and
  forwards it as `min_amount`. Add `LEADING_BID_LOWERED` and the 422 to the description. Run
  `make openapi && make client`; never hand-edit `openapi.yaml` or
  `game-client/src/api/generated/schema.d.ts`.
- **Client, minimum to keep the build and the floor real** (`game-client/src/utils/api.ts`,
  `game-client/src/components/bazaar/SellerBlock.tsx`): `apiClient.acceptBid(listingId, minAmount)`
  sends `{ minAmount }`. `SellerBlock`'s Sell passes the `currentPrice` its confirm displays. The
  regenerated client makes the body required, so this is part of this slice. The refusal message is
  slice 2.

## Acceptance Criteria

- [ ] `CanAcceptBid`: the seller on an ACTIVE, not-ended listing with WINNING ≥ floor is allowed, and
      equal counts as allowed. WINNING < floor gives the floor refusal.
- [ ] Refusal order: a non-seller gets `ErrNotSeller` whatever the floor. Closed or ended keeps its
      existing refusal. Nobody leading gives `ErrNoBidToAccept` whatever the floor.
- [ ] `AcceptBidUsecase` refused on the floor starts no settlement. At or above the floor it starts
      `settlement-{listingId}` with `ACCEPT_BID`, with no bid id or amount in the input.
- [ ] gRPC `AcceptBid`: a floor refusal gives `FailedPrecondition` with reason `LEADING_BID_LOWERED`.
      `min_amount` ≤ 0 gives `InvalidArgument` and the use case is not called. A valid floor reaches
      the use case.
- [ ] `LEADING_BID_LOWERED` is registered, and the gateway answers it as `400 · LEADING_BID_LOWERED`.
- [ ] Gateway accept-bid: no body, no `minAmount`, or `minAmount < 1` gives `422 · VALIDATION_FAILED`
      and makes no marketplace call. A valid body forwards `min_amount`.
      *(Amended 2026-11-05, FS-F692V A1: no body at all gives `400 · VALIDATION_FAILED`, as on
      buyout, still with no marketplace call; a body with no `minAmount`, a non-integer one or
      `minAmount < 1` gives 422.)*
- [ ] Proto Go regenerated with `make gen`. `openapi.yaml` and `schema.d.ts` regenerated with
      `make openapi && make client`, and they show the required `minAmount`.
- [ ] Client: `apiClient.acceptBid("l1", 300)` POSTs `{ "minAmount": 300 }` (`utils/api.test.ts`, in the
      style of the buyout-price test). Sell passes the confirm's `currentPrice`.
- [ ] `go test ./...` passes in marketplace-service, api-gateway and common. The client's typecheck,
      lint and tests pass.

## Blocked By

None

## Spec Reference

FS-F692V §Requirements 1–9 (floor, rule, where checked, residual window, refusal code, no-leader
unchanged, boundary shape, contract, Sell sends what the confirm shows), §API surface. User Stories
1–3, 5, 8–15, 17–19.

**Shared generated files:** `marketplace.pb.go`, `marketplace_grpc.pb.go`,
`game-server/api-gateway/openapi.yaml` and `game-client/src/api/generated/schema.d.ts`. Other
unmerged branches also touch the last two (`feat/marketplace-seller-cannot-bid`,
`feat/marketplace-withdraw-lock-window`). Regenerate after merging and never hand-merge them.
`make gen` regenerates every proto: commit only the marketplace output unless the others changed for
a real reason.

## TDD Approach

- RED: domain test, a seller with WINNING 300 and floor 1000 is refused with the floor refusal.
- GREEN: the floor check in `CanAcceptBid`, then the use case, gRPC, gateway and client wiring, each
  test-first.
