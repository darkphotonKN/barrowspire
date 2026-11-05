---
id: I-S109X-1
status: done
implements: FS-S109X
blocked_by: []
labels: []
title: "FS-S109X slice 1: only a withdrawal of a leading bid counts toward the cap (marketplace domain + repository + migration 000012)"
---
Implements FS-S109X §Requirements 1–7, §Acceptance Criteria, §Edge States

## What to Build

End to end in marketplace-service: a member who withdraws outbid bids keeps bidding; only CANCELLED bids withdrawn while WINNING count toward `bidWithdrawalCap` (ADR-0055 amending ADR-0052).

- **Domain** (`internal/listing/domain/listing/bid.go`, `listing.go`): `Bid.withdrawnWhileLeading` (false on `newBid`), on `BidSnapshot` and `BidReconstituteParams` as `WithdrawnWhileLeading`. `Listing.WithdrawBid` sets it to its existing `wasLeading` in the same change that transitions the bid to CANCELLED. `WithinBidWithdrawalCap` counts CANCELLED **and** withdrawn-while-leading. No new status, FSM unchanged; ADR-0048 lock, ADR-0028 promotion, ADR-0054 and the place-bid check order untouched.
- **Migration** (new pair, never edit an existing one): `migrations/000012_bid_withdrawn_while_leading.up.sql` adds `bids.withdrawn_while_leading BOOLEAN NOT NULL DEFAULT false` and `UPDATE bids SET withdrawn_while_leading = true WHERE status = 'CANCELLED'`; `.down.sql` drops the column. `bids_status_check` untouched.
- **Repository** (`internal/listing/repository/listing_repository.go`): `BidRow` gets the column; both bid SELECTs (`FindByID`, `Update`) read it; `reconstitute` passes it; `diffListing` carries it on the bid change and `updateBids`' unnest UPDATE writes it with the status; the new-bid INSERT writes false (or leaves it to the default).
- **Existing tests**: FS-ZE43K's cap fixtures (`withdraw_cap_test.go` `withdrawn(...)`, the use-case cap tests) build CANCELLED bids by reconstitution; mark them withdrawn while leading so they keep asserting the cap, and add outbid-withdrawal rows that don't count.

## Acceptance Criteria

- [ ] 3 CANCELLED + withdrawn-while-leading bids by the member → `ErrBidWithdrawLimitReached`; 3 CANCELLED outbid withdrawals → placed; 2 leading + any number of outbid withdrawals → placed.
- [ ] `WithdrawBid` of WINNING → snapshot `WithdrawnWhileLeading` true; of OUTBID → false; new bid → false.
- [ ] Promoted-back-then-withdrawn counts; led-then-outbid-then-withdrawn doesn't; sole WINNING bid withdrawn with no runner-up counts.
- [ ] FS-ZE43K cap tests still pass (replay at the cap, cap before price rules, withdraw/buyout unrefused, LOST/FAILED/other member/other listing don't count).
- [ ] Use case: only-outbid withdrawals → advisory check passes, hold placed; 3 leading withdrawals → refused before `PlaceHold`.
- [ ] Repository (Postgres): leading withdrawal via `Save` and via `Update` persists true; outbid withdrawal false; reload reproduces it; new bid stored false.
- [ ] Migration up: column NOT NULL DEFAULT false, pre-existing CANCELLED rows true, others false; down drops it; no earlier migration changed.
- [ ] Tests pass (marketplace-service).

## Blocked By

None

## Spec Reference

FS-S109X §Requirements 1–7 (what counts, moment of withdrawal, recorded on the bid, nothing else changes, column, backfill, repository round trip); User Stories 1–2, 5–15, 17; §Edge States (promoted-then-withdrawn, outbid in flight under OCC retry, final-30-minute lock, seller withdrawal, stale advisory reads, pre-migration rows, rollback order).

## Expected files

marketplace-service `internal/listing/domain/listing/{bid.go,listing.go}` + `withdraw_cap_test.go` (and any test helper that reconstitutes CANCELLED bids); `internal/listing/usecase/place_bid_usecase_test.go`; `internal/listing/repository/listing_repository.go` + `listing_repository_test.go` (or a new `withdrawn_while_leading_repository_test.go`); new `migrations/000012_bid_withdrawn_while_leading.{up,down}.sql`.

## TDD Approach

- RED: domain table test — 3 CANCELLED bids reconstituted as outbid withdrawals, member places a bid → expected success, gets `ErrBidWithdrawLimitReached` today. Plus `WithdrawBid` of a WINNING bid → snapshot flag true (doesn't compile yet).
- GREEN: add the field, set it in `WithdrawBid`, filter on it in `WithinBidWithdrawalCap`; then the repository round-trip test against Postgres → migration + `BidRow`/SELECT/`updateBids` changes.

## Outcome (2026-11-05)

- Done and reviewed (ready). marketplace `go test -p 1 ./...` green against a throwaway postgres, DB tests included; 9 of 10 mutations caught (the survivor, `OR`-ing the stored flag in `updateBids`, is equivalent because CANCELLED is terminal).
- Correction to FS-S109X §Edge States (line ~127): a PENDING bid is not refused by the FSM — `bid_fsm.go` has a PENDING→CANCELLED edge and `WithdrawBid` has no PENDING guard. It is unreachable today: place-bid places and confirms in one `Update`, and `ConfirmBidUC` is not wired, so no PENDING bid is ever persisted. If a PENDING bid ever persists, its withdrawal would be free (`wasLeading` is false) although a PENDING bid is the contender; decide then whether it counts.
