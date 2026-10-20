---
id: I-EYQ8K-1
status: done
implements: FS-EYQ8K
blocked_by: []
labels: []
title: "FS-EYQ8K slice 1: an outbid bid may be withdrawn (ADR-0029)"
---
Implements FS-EYQ8K §Requirements (Req 9), §Acceptance Criteria, §Edge States

**Author:** unassigned

## What to Build

marketplace-service only. Per ADR-0029, add `OUTBID → CANCELLED` to the bid FSM (`domain/listing/bid_fsm.go`)
so `Listing.WithdrawBid` accepts an `OUTBID` bid while the listing is `ACTIVE` and not ended. Nothing else
changes: `WithdrawBidUC` already starts the withdrawn bid's own hold release (ADR-0024); withdrawing a
non-leader runs no promotion (ADR-0028 promotes only on a `WINNING` withdrawal); `acceptingBidChanges`
still refuses after end / freeze / buyout. Update any comment that says OUTBID can't be withdrawn.

## Acceptance Criteria

- [ ] Withdrawing an `OUTBID` bid on an `ACTIVE`, not-ended listing cancels it; the `WINNING` bid and the current price are unchanged; no bid is promoted.
- [ ] `WithdrawBidUC` starts the release of the withdrawn outbid bid's hold.
- [ ] Withdrawing an `OUTBID` bid on an ended, frozen or bought-out listing is refused (`FAILED_PRECONDITION` at the gRPC edge).
- [ ] `WON`, `LOST`, `CANCELLED` stay non-withdrawable.
- [ ] The withdrawal persists (repository test against the DB, with `MARKETPLACE_TEST_DB_DSN`).
- [ ] Tests pass.

## Blocked By

None

## Spec Reference

FS-EYQ8K §Requirements 9; §Acceptance Criteria (withdraw rows); §Edge States (concurrent withdraw and freeze; release fails to start). ADR-0029.

## TDD Approach

- RED (domain): leader 150, outbid 120 → withdraw the 120 → it is `CANCELLED`, 150 still `WINNING`, price unchanged.
- RED (domain): same on an ended listing → refused.
- RED (usecase): withdrawing an outbid bid starts its hold release.

## Decided during develop (2026-10-21)

- Withdraw had no end-time check: `acceptingBidChanges` looks only at status and buyout, so a bid
  could be withdrawn between `endsAt` and the expiry poller's freeze. `Listing.WithdrawBid` now
  applies `AcceptsBidAt`, the same end rule as place-bid (`endsAt <= now` is ended →
  `ErrListingExpired` → `FAILED_PRECONDITION`).
- This also stops a `WINNING` bidder withdrawing in that window, which previously promoted the
  runner-up after the end (ADR-0028). The user chose to fix it in this slice rather than as a
  follow-up.
