---
id: I-NXP1W-3
status: open
implements: FS-NXP1W
blocked_by: [I-NXP1W-1]
labels: [blocked]
title: "FS-NXP1W slice 3: freeze arm forward — triggers, workflow shell, 0a FreezeListing, 0b FreezeItem"
---

Implements FS-NXP1W §Requirements 1–8, 20–22, 25–26, 34

**Author: human** (Kranti)

## What to Build

Everything that gets a settlement started and frozen, on the forward path only. Failure handling
for these steps is slice 5.

- **Workflow shell:** `settlement-{listingId}`, `REJECT_DUPLICATE`, on the `marketplace` queue.
  Input is listingId plus trigger kind (`EXPIRY` | `ACCEPT_BID` | `BUYOUT`).
- **Starters:** the expiry poller (ACTIVE past expiry only), AcceptBid and Buyout. Each treats
  "already started" as success. AcceptBid passes no bid ID.
- **0a FreezeListing** (marketplace): `ACTIVE → PENDING_SETTLEMENT` conditional write plus
  WINNING bid selection in one transaction. Re-running on `PENDING_SETTLEMENT` returns the same
  output.
- **0b FreezeItem** (items): `LISTED → PENDING_SETTLEMENT` conditional on status and owner = seller.
  Re-running on an already-frozen item owned by the seller is success.
- **Zero bids:** 0a returns `NO_BIDS` and the workflow branches off. The no-bids arm itself (NB1
  ReturnItem, NB2 ExpireListing) is I-NXP1W-15.
- **Stale-reservation reconciler:** treats an item whose listing is `PENDING_SETTLEMENT` as live.

Each activity is a thin wrapper over a plain use case (Req 7). No gRPC calls on the saga path.

**Check as you go, don't assume:** listing statuses (Req 20), bids `WINNING` index (Req 21) and
the items `PENDING_SETTLEMENT` vs `IN_ESCROW` decision (Req 22). Add what's missing. Note that
placeBid's post-lock status re-check (Req 25) lives in the bids work. Confirm it's there.

## Acceptance Criteria

- [ ] Starting `settlement-{listingId}` twice from any mix of triggers runs one settlement; the second start returns success
- [ ] The expiry poller ignores every non-ACTIVE status, including `SETTLEMENT_FAILED`
- [ ] AcceptBid settles at the current WINNING bid; no bid ID reaches the workflow
- [ ] 0a and 0b are conditional writes; re-running either after success returns the same output and changes nothing
- [ ] 0a returns `NO_BIDS` for a listing with no bids, and the workflow skips 0b (the arm itself is I-NXP1W-15)
- [ ] The reconciler does not cancel the reservation of an item whose listing is `PENDING_SETTLEMENT`
- [ ] Use cases tested without Temporal; `make test` green

## Blocked By

I-NXP1W-1. The bids table (Kiki's work) must exist for winner selection.

## Spec Reference

FS-NXP1W §Requirements 1–5 (trigger and identity), 6–8 (sequence, thin wrappers, zero bids),
20–22 (statuses), 25–26 (0a, 0b), 34 (reconciler). User stories 1–3, 9–10, 17–18, 21, 24. ADR-0016.

## Carried from I-NXP1W-4's review

1a `SetWinningBid` (landed in I-NXP1W-4) moves the winner to `WON` but does not check the
listing, because `PENDING_SETTLEMENT` does not exist yet. Until it does, a PENDING bid whose
hold confirms after 1a would be promoted to `WINNING` beside the `WON` bid — `ConfirmBid`
only sees an `ACTIVE` listing and looks for a `WINNING` leader.

Close it where the state lives, not with a `WON` check in every bid method:

- 0a moves the listing to `PENDING_SETTLEMENT`. `ConfirmBid`, `WithdrawBid` and `PlaceBid`
  already ask the aggregate's single `acceptingBidChanges()` rule, so they refuse it with no
  further change.
- `SetWinningBid` refuses a listing that is still `ACTIVE`, so `WON` can only exist on a
  frozen listing.

## Carried from the listing-status audit

The listing statuses were reconciled with the specs ahead of this slice: on-sale is now `ACTIVE`
(it was `LISTED`, which is the item's word — ADR-0017), `DRAFT` is gone, and `CANCELLED` /
`EXPIRED` no longer violate the CHECK. Migration 000005. Two things that audit found are this
slice's to close:

- **`SETTLEMENT_FAILED` exists nowhere yet** — not in `ListingStatus`, not in the CHECK. Req 20
  wants it; add it with the rollback that writes it (here or I-NXP1W-7), not before.
- **The listing FSM is mostly bypassed.** `Cancel()` and `MarkSold()` assign `l.status` directly;
  only `FreezeListing` goes through `transitionTo`. So `listing_fsm.go`'s table is not the
  authority it looks like — 0a is the first step that actually relies on it, which makes this the
  slice that has to decide whether every mutator routes through it. Related: that `transitionTo`
  returns `ErrInvalidHoldTransition`, a sentinel copied from wallet.
