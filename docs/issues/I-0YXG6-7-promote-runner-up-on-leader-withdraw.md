---
id: I-0YXG6-7
status: open
implements: FS-0YXG6
blocked_by: []
labels: [ready-for-agent]
title: "FS-0YXG6 slice 7: withdrawing the WINNING bid promotes the next-highest bid (ADR-0028)"
---
Implements FS-0YXG6 §Place and withdraw a bid (Req 16), per ADR-0028

**Author:** unassigned

## What to Build

Today `Listing.WithdrawBid` cancels the bid and stops. Withdrawing the leader leaves no WINNING bid
while OUTBID bids keep their gold held. If the auction then ends, settlement takes the no-bids arm,
which releases no holds, and those holds stay `RESERVED` for good (ADR-0028 §Context).

Per ADR-0028:

- In `Listing.WithdrawBid`, when the withdrawn bid was `WINNING`, promote the highest remaining
  `OUTBID` bid to `WINNING`, in the same write and under the same row lock. Ties go to the earliest
  placed (`createdAt`). `PENDING`, `CANCELLED`, `FAILED` bids are never promoted.
- With no `OUTBID` bid left, nothing is promoted; `currentPrice()` already falls back to the starting
  bid.
- Withdrawing an `OUTBID` bid is still refused (the bid FSM), unchanged here.
- `WithdrawBidUC` keeps releasing only the withdrawn bid's own hold (ADR-0024). The promoted bid's
  hold stays as it is.
- Check the bid FSM allows `OUTBID → WINNING`. If it does not, add exactly that transition, and only
  for promotion.
- Replace the no-promotion comment on `WithdrawBidUC` with a pointer to ADR-0028.

Docs in the same change (FS-0YXG6 is shipped and write-once, so these are notes, not FS edits):

- FS-8EGFA's AC on a withdrawn leader (line ~311) cites a "no-promotion rule (FS-0YXG6)" that
  FS-0YXG6 never stated. Add a correction note under it pointing to ADR-0028. Check the client: it
  reads `currentPrice` / `minimumBid` from the server, so likely nothing in the client changes. Note
  whatever a client test pins.
- FS-NXP1W Edge States gains "the leader withdrew and other bids remain → the next-highest leads,
  settlement has a winner" as a correction note pointing to ADR-0028.

## Acceptance Criteria

- [ ] Withdrawing the WINNING bid with OUTBID bids remaining leaves exactly one WINNING bid: the highest OUTBID, earliest on a tie.
- [ ] Withdrawing the WINNING bid with no OUTBID bid leaves no WINNING bid; the price is the starting bid.
- [ ] `PENDING`, `CANCELLED` and `FAILED` bids are never promoted.
- [ ] The withdrawn bid's hold is released (as today); the promoted bid's hold is untouched.
- [ ] The single-WINNING invariant holds after the write (repository test against the partial unique index).
- [ ] A listing whose leader withdrew while others remained settles with the promoted bid as winner, and step 2 releases the other losers (workflow or end-to-end evidence).
- [ ] FS-8EGFA and FS-NXP1W correction notes added; `docs/outline/bids.md` already points to ADR-0028.
- [ ] Tests pass.

## Blocked By

None

## Spec Reference

FS-0YXG6 §Requirements 16 (withdraw-bid), §User Stories 12; ADR-0028 (promotion rule), ADR-0024 (whose
hold a withdrawal releases); FS-NXP1W Req 29 (losing holds released at step 2).

## TDD Approach

- RED (domain): leader withdraws with two OUTBID bids 150 and 120 → the 150 bid is WINNING.
- RED (domain): equal OUTBID amounts → the earlier is promoted.
- RED (domain): leader withdraws with only a PENDING bid left → nothing promoted, price = start.
- RED (repository, DB): the promotion persists and the partial unique index accepts it.
