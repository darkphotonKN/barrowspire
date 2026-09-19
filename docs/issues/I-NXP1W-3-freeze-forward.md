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
- **Zero bids:** 0a returns `NO_BIDS`, and the workflow ends with the listing `EXPIRED` and the item
  back to `AVAILABLE`. No wallet, ledger or bid steps run.
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
- [ ] A listing with no bids ends `EXPIRED` with its item `AVAILABLE`
- [ ] The reconciler does not cancel the reservation of an item whose listing is `PENDING_SETTLEMENT`
- [ ] Use cases tested without Temporal; `make test` green

## Blocked By

I-NXP1W-1. The bids table (Kiki's work) must exist for winner selection.

## Spec Reference

FS-NXP1W §Requirements 1–5 (trigger and identity), 6–8 (sequence, thin wrappers, zero bids),
20–22 (statuses), 25–26 (0a, 0b), 34 (reconciler). User stories 1–3, 9–10, 17–18, 21, 24. ADR-0016.
