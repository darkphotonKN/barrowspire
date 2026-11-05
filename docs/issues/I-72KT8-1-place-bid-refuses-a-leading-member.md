---
id: I-72KT8-1
status: done
implements: FS-72KT8
blocked_by: [I-V74WE-1]
labels: []
title: "FS-72KT8 slice 1: place-bid refuses a member who already leads with 400 · ALREADY_LEADING (domain + use case + errcode + gateway)"
---
Implements FS-72KT8 §Requirements 1–15, 19, §API surface, §Acceptance Criteria, §Edge States

## What to Build

End to end on the server: a member whose bid is the listing's contending bid is refused when they bid again, before any gold is held, and place-bid answers `400 · ALREADY_LEADING`. Buyout, withdraw-bid and promotion are unchanged. Builds on FS-V74WE slice 1, which lands first on this branch and touches the same `errcode.go`, `ownRefusals` and place-bid description.

- **Domain** (`marketplace-service/internal/listing/domain/listing/`): `ErrAlreadyLeading` in `errors.go`; one read-only `Listing` method returning it when `findContendingBid()` is the member's bid (style of `WithinBidWithdrawalCap`; name is yours); `PlaceBidWithID` calls it after `WithinBidWithdrawalCap` and before the price rules (FS Req 4).
- **Use case** (`usecase/place_bid_usecase.go`): `Handle` asks it after `WithinBidWithdrawalCap`, before `PlaceHold`; add `listing.ErrAlreadyLeading` to `bidRejected`.
- **Registry** (`common/errcode/errcode.go`): `AlreadyLeading = "ALREADY_LEADING"` with a doc comment in the Marketplace block; `domainCodes` under `// FS-72KT8`.
- **Marketplace grpc** (`grpc/handler.go`): `{listing.ErrAlreadyLeading, errcode.AlreadyLeading}` in `ownRefusals` (`// FS-72KT8 Req 12`).
- **Gateway** (`api-gateway/internal/gateway/listing/typed.go`): add `ALREADY_LEADING` to the place-bid description's `Refusals:` sentence; seam-table row; then `make openapi && make client` in `game-server/api-gateway`, and `make gates` (oasdiff).
- **CONTEXT**: the *Leading* term is already in `marketplace-service/CONTEXT.md`; keep the code's names consistent with it.

## Acceptance Criteria

- [ ] Domain: WINNING leader refused with `ErrAlreadyLeading`, no bid added; own PENDING contender refused; OUTBID member (another leads) may bid; member whose WINNING bid is outranked by another member's PENDING may bid.
- [ ] Domain: replay by bid id and by the member's used idempotency key of their own leading bid → success, no new bid.
- [ ] Domain order: capped leader → `ErrBidWithdrawLimitReached`; leader with a too-low or at-buyout amount → `ErrAlreadyLeading`; seller → `ErrSellerCannotBid`; ended → ended refusal.
- [ ] Domain: leader withdraws before the final 30 minutes; own earlier bid promoted → next bid refused; another member's bid promoted → next bid placed.
- [ ] Domain: `CanBuyout` / `Buyout` succeed for the leader.
- [ ] Use case: leader's bid → no `PlaceHold`, no release; keyed resend of the recorded leading bid → success, no hold.
- [ ] Use case: advisory read not leading, locked read leading → hold released, `ErrAlreadyLeading` returned, not transient.
- [ ] `refusal_test.go`: `ALREADY_LEADING` registered; `Refuse` → `FailedPrecondition`; `RefusalReason` reads it back.
- [ ] Handler test: `ErrAlreadyLeading` → `FailedPrecondition` + reason `ALREADY_LEADING`.
- [ ] Gateway: `TestPlaceBid_MarketplaceRefusalsGoThroughTheSeam` row → `400 · ALREADY_LEADING`; the description test asserts `ALREADY_LEADING` appears in the place-bid description.
- [ ] `openapi.yaml` and `game-client/src/api/generated/schema.d.ts` regenerated, not hand-edited; oasdiff reports no breaking change (paste its result on this issue).
- [ ] Existing tests that stack one member's bids on a listing are switched to a second member where stacking isn't what they test; none is deleted to get green.
- [ ] Tests pass (common, marketplace-service, api-gateway). PR notes the deploy order: marketplace-service ships after api-gateway and game-client (FS Req 19).

## Blocked By

I-V74WE-1 (same mechanism and the same files; this slice lands on top of it).

## Spec Reference

FS-72KT8 §Requirements 1–10 (rule, placement, `bidRejected`, advisory check, buyout, promotion, legacy bids), 11–12 (registry, `ownRefusals`), 13–15 (gateway 400, docs + regen, non-breaking), 19 (deploy order); User Stories 1, 2, 4–17, 19–21; §API surface; §Edge States (keyed resend, racing bids, own PENDING, other's PENDING, promotion both ways, final 30 minutes, capped leader, leader too-low/at-buyout, seller, ended, legacy stacks, old gateway).

## Expected files

`game-server/marketplace-service/internal/listing/domain/listing/errors.go`, `listing.go`, a new domain test (e.g. `already_leading_test.go`, beside `withdraw_cap_test.go`), and existing domain tests that stack one member's bids (`listing_test.go`, possibly `bid_saga_test.go`, `buyout_test.go`); `game-server/marketplace-service/internal/listing/usecase/place_bid_usecase.go`, `place_bid_usecase_test.go` or a new `already_leading_test.go` beside `withdraw_cap_test.go`; `game-server/marketplace-service/internal/listing/grpc/handler.go`, `handler_test.go`; `game-server/common/errcode/errcode.go`, `refusal_test.go`; `game-server/api-gateway/internal/gateway/listing/typed.go`, `typed_test.go`; **generated (regenerate only)**: `game-server/api-gateway/openapi.yaml`, `game-client/src/api/generated/schema.d.ts`.

## TDD Approach

- RED: domain test, member A places 100 (confirmed WINNING), then A places 200 with a new key → expect `ErrAlreadyLeading` and still one bid (today: a second WINNING bid, A's first OUTBID).
- GREEN: the read-only check against `findContendingBid()`, called from `PlaceBidWithID` after the cap. Then the use case pre-hold check and `bidRejected` (RED: a fake repo whose advisory read shows A not leading and whose locked read shows A leading → hold released, `ErrAlreadyLeading`), then errcode + `ownRefusals` + gateway row.

## Outcome (2026-11-05)

- oasdiff (`make gates`, base origin/main): "No breaking changes to report, but the specs are different." openapi-diff gate passed; Spectral 0 errors. `make gates` still exits non-zero on the seam gate over `api-gateway/internal/gateway/wallet/handler.go` (direct `c.JSON` error writes), which predates this slice and is untouched here.
- Departure from FS Req 6's wording: the use case skips its advisory leading check when the member's idempotency key is already on the listing (`Listing.HasBidByKey`). A keyed resend of a leading bid recorded under a pre-ADR-0027 random ID misses `HasBid(bidID)`; refusing it before the hold would turn a replay into a refusal, against Req 4 / User Story 6. Under the lock the key replay still answers first. The FS-ZE43K advisory cap check has the same theoretical gap for legacy resends at the cap; left as is.
- Rewritten test: `usecase/withdraw_cap_test.go` `TestPlaceBidUC_ResendOfARecordedBidAtTheCap_IsAReplay` now has a second member outbid at 160 instead of the member stacking on their own lead.
- Deploy order (FS Req 19): marketplace-service ships after api-gateway and game-client.
