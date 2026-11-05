---
id: I-V74WE-1
status: done
implements: FS-V74WE
blocked_by: []
labels: []
title: "FS-V74WE slice 1: place-bid answers 400 · BID_TOO_LOW and 400 · BID_AT_OR_ABOVE_BUYOUT (errcode + marketplace + gateway)"
---
Implements FS-V74WE §Requirements 1–10, 16, §API surface, §Acceptance Criteria, §Edge States

## What to Build

End to end on the server: a bid refused on price comes back from place-bid as `400 · BID_TOO_LOW` or `400 · BID_AT_OR_ABOVE_BUYOUT` instead of `400 · VALIDATION_FAILED`. The domain rules, the use case and the hold release don't change.

- **Registry** (`common/errcode/errcode.go`): `BidTooLow = "BID_TOO_LOW"` and `BidAtOrAboveBuyout = "BID_AT_OR_ABOVE_BUYOUT"` with doc comments in the Marketplace block; list both in `domainCodes` under `// FS-V74WE`.
- **Marketplace** (`marketplace-service/internal/listing/grpc/handler.go`): add `{listing.ErrBidTooLow, errcode.BidTooLow}` and `{listing.ErrBidAtOrAboveBuyout, errcode.BidAtOrAboveBuyout}` to `ownRefusals`; take both sentinels out of the `codes.InvalidArgument` branch of `mapError` (`ErrInvalidAmount`, `ErrBuyoutAmountMismatch` stay there). `bidRejected` already lists both; leave it.
- **Gateway** (`api-gateway/internal/gateway/listing/typed.go`): add both codes to the place-bid description's `Refusals:` sentence; seam-table rows; then `make openapi && make client` in `game-server/api-gateway`, and run `make gates` (oasdiff).

## Acceptance Criteria

- [ ] `refusal_test.go`: both codes are registered; `Refuse` crosses gRPC as `FailedPrecondition` with the reason; `RefusalReason` reads each back.
- [ ] `mapError`: `ErrBidTooLow` → `FailedPrecondition` + `BID_TOO_LOW`; `ErrBidAtOrAboveBuyout` → `FailedPrecondition` + `BID_AT_OR_ABOVE_BUYOUT`; `ErrInvalidAmount` and `ErrBuyoutAmountMismatch` still `InvalidArgument`.
- [ ] Handler: a bid at the buyout price → `RefusalReason` `BID_AT_OR_ABOVE_BUYOUT`, no bid recorded, hold released once (update `TestPlaceBid_AtBuyoutPriceIsInvalidArgumentAndReleasesTheHold`, renaming it); a bid not above the leader → `BID_TOO_LOW`, no bid recorded, hold released.
- [ ] Gateway: `TestPlaceBid_MarketplaceRefusalsGoThroughTheSeam` rows for both codes → `400` + code; `TestPlaceBid_BidTooLowIsABadRequest` (bare `InvalidArgument` → `400 · VALIDATION_FAILED`) still passes, renamed to say it is the generic path.
- [ ] Gateway: a description test asserts both codes appear in the place-bid description.
- [ ] `openapi.yaml` and `game-client/src/api/generated/schema.d.ts` regenerated, not hand-edited; oasdiff reports no breaking change (paste its result on this issue).
- [ ] Tests pass (common, marketplace-service, api-gateway).

## Blocked By

None

## Spec Reference

FS-V74WE §Requirements 1–10 (registry, ownRefusals mapping, gRPC status, unchanged rules and hold release, ErrInvalidAmount unchanged, no amount in the refusal, status 400, docs + regen, non-breaking) and 16 (marketplace ships last: note it in the PR); User Stories 7, 9, 10, 12, 14–19; §API surface; §Edge States (refused under the lock, capped too-low bidder, keyed resend, amount ≤ 0, old gateway).

## Expected files

`game-server/common/errcode/errcode.go`, `game-server/common/errcode/refusal_test.go`; `game-server/marketplace-service/internal/listing/grpc/handler.go`, `game-server/marketplace-service/internal/listing/grpc/handler_test.go`; `game-server/api-gateway/internal/gateway/listing/typed.go`, `game-server/api-gateway/internal/gateway/listing/typed_test.go`; **generated (regenerate only)**: `game-server/api-gateway/openapi.yaml`, `game-client/src/api/generated/schema.d.ts`. Shared with other unmerged branches: `errcode.go`, `handler.go`, `typed.go`, the generated files.

## TDD Approach

- RED: handler test, a bid at the buyout price → `errcode.RefusalReason(status)` = `BID_AT_OR_ABOVE_BUYOUT` (today it is a bare `InvalidArgument`).
- GREEN: register the code, add the `ownRefusals` row, drop the sentinel from the `InvalidArgument` branch. Repeat for `BID_TOO_LOW`.

## Outcome (2026-11-05)

- **oasdiff:** `make openapi-breaking` (oasdiff v1.28.0, against origin/main, with `game-server/.oasdiff-ignore`): "No breaking changes to report, but the specs are different." Re-run in review against the fixed point `integrate/auction-hardening`: "No breaking changes to report", exit 0; the changelog is the place-bid description only.
- **Correction to FS-V74WE Req 6, its Edge State "Amount ≤ 0 by hand" and the §API surface phrase "stays for a non-positive amount reaching marketplace":** the code does not back them. Inside the domain a non-positive bid is refused as `ErrBidTooLow` (listing.go price check runs before `newBid`'s guard), so it would cross as `BID_TOO_LOW`; in practice the wallet hold runs first, and the gateway refuses amount ≤ 0 with `422` before marketplace is called, so there is no HTTP-visible effect. On place-bid a bare `InvalidArgument` (→ `400 · VALIDATION_FAILED`) today comes only from a malformed listing id. `ErrInvalidAmount` → `InvalidArgument` is unchanged as written.
- **Deploy order (Req 16):** ship marketplace-service last, after api-gateway and game-client — carried into the merge record.

