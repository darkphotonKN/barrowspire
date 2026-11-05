---
id: I-ZE43K-1
status: done
implements: FS-ZE43K
blocked_by: []
labels: [ready-for-agent]
title: "FS-ZE43K slice 1: a member with 3 withdrawals on a listing is refused a new bid, before any hold (marketplace + gateway)"
---
Implements FS-ZE43K §Requirements 1–11, §API surface, §Acceptance Criteria, §Edge States

## What to Build

End to end on the server: a member who has 3+ CANCELLED bids on a listing gets `400 · BID_WITHDRAW_LIMIT_REACHED` from place-bid, with no gold held.

- **Domain** (`marketplace-service/internal/listing/domain/listing/listing.go`, `errors.go`): a named constant for the limit (3), a sentinel `ErrBidWithdrawLimitReached`, a count of the member's CANCELLED bids on the listing, applied in `PlaceBidWithID` after the bid-id replay check and the idempotency-key replay check and before the price rules; plus a read-only check the use case can ask (`WithdrawBid`, `Buyout`, `CanBuyout` unchanged).
- **Use case** (`usecase/place_bid_usecase.go`): ask the read-only check on the existing unlocked read, after the `HasBid(bidID)` shortcut and before `PlaceHold`; add the sentinel to `bidRejected`.
- **Transport**: register `BID_WITHDRAW_LIMIT_REACHED` in `common/errcode` (`domainCodes`); in `grpc/handler.go` `mapError`, turn the sentinel into `errcode.Refuse(BidWithdrawLimitReached)` (the domain does not import errcode).
- **Gateway**: document `400 · BID_WITHDRAW_LIMIT_REACHED` in the place-bid description (`api-gateway/internal/gateway/listing/typed.go`); add a seam-table row; `make openapi && make client` in `game-server/api-gateway`.

## Acceptance Criteria

- [ ] 3 CANCELLED bids by the member on the listing → refused; 2 → placed; other members' / other listings' CANCELLED bids, and LOST / FAILED bids, don't count.
- [ ] A replay (same bid id, or the member's used idempotency key) at the cap → success, no new bid.
- [ ] `WithdrawBid` and `Buyout` still succeed for a member at the cap.
- [ ] Cap checked before price rules (a too-low bid from a capped member gets the cap refusal).
- [ ] Use case: capped bid → no `PlaceHold`, no release started; keyed resend of a recorded bid at the cap → success, no hold.
- [ ] Use case: a cap refusal found under the lock → definite rejection; hold released; not transient.
- [ ] gRPC: `FailedPrecondition` with `RefusalReason` `BID_WITHDRAW_LIMIT_REACHED`.
- [ ] Gateway: `400 · BID_WITHDRAW_LIMIT_REACHED` seam row; documented; regenerated; oasdiff non-breaking.
- [ ] Tests pass (marketplace-service, common, api-gateway).

## Blocked By

None

## Spec Reference

FS-ZE43K §Requirements 1–11 (rule, counting, unrefused withdraw, unlimited buyout, lock-side and advisory checks, definite refusal, wire code, constant, no grandfathering, gateway docs); User Stories 1–2, 4–17; §API surface.

## Expected files

marketplace-service `internal/listing/domain/listing/{listing.go,errors.go}` + tests; `internal/listing/usecase/place_bid_usecase.go` + test; `internal/listing/grpc/handler.go` + handler test; `common/errcode/errcode.go` + `refusal_test.go`; api-gateway `internal/gateway/listing/{typed.go,typed_test.go}`; **generated**: `game-server/api-gateway/openapi.yaml`, `game-client/src/api/generated/schema.d.ts` (regenerate only). Shared with other unmerged branches: `errcode.go`, `handler.go` `mapError`, `listing.go`, `typed.go`, the generated files.

## TDD Approach

- RED: domain table test — member with 3 CANCELLED bids on the listing places a bid → `ErrBidWithdrawLimitReached`, no bid appended.
- GREEN: count + check in `PlaceBidWithID` after the replay checks.
