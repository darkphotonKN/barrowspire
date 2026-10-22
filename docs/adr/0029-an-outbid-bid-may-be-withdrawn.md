# ADR-0029 — An outbid bid may be withdrawn, and its gold comes back at once

Status: accepted
Date: 2026-10-20
Scope: `game-server/marketplace-service` (the bid FSM, `Listing.WithdrawBid`)
Builds on: [ADR-0024](0024-a-bids-hold-is-released-by-a-temporal-workflow-not-a-grpc-call.md)
(WithdrawBid releases the withdrawn bid's own hold) and
[ADR-0028](0028-a-withdrawn-leader-is-replaced-by-the-next-highest-bid.md) (promotion on a
withdrawn leader)

## Context

Recorded without adversarial review. Decided by the user on 2026-10-20 while chartering the "my
bids" work, on seeing that the list would offer no way to take back gold from a bid that had been
outbid.

Today only `PENDING` and `WINNING` bids can be withdrawn. An `OUTBID` bid's hold stays `RESERVED`
until settlement step 2 `ReleaseLosingHolds`, at the auction's end. A delver outbid early in a long
auction cannot spend that gold anywhere else for the rest of it, though they have no path to winning
short of bidding again.

## Decision

**An `OUTBID` bid may be withdrawn while its listing is `ACTIVE` and has not ended. It becomes
`CANCELLED` and its hold is released at once.** The bid FSM gains `OUTBID → CANCELLED`.
`WithdrawBidUC` already starts the release for the withdrawn bid (ADR-0024), so nothing new releases
gold. The leader is unaffected, and no promotion runs: the withdrawn bid was not leading (ADR-0028
promotes only when the leader withdraws).

## Consequences

- **Outbid gold is free at once**, not at the auction's end.
- **Settlement still releases it only once in effect.** Step 0a hands step 2 every bid on the listing,
  statuses unfiltered, so a withdrawn bid is in that set. Wallet's release is idempotent on a hold
  already `RELEASED` (`release_holds.go`: a no-op), and on a bid it holds nothing for. A `WINNING`
  withdrawal already takes exactly this path, so this adds no new case to step 2.
- **A release that fails to start is still covered**: the reservation reconciler counts `CANCELLED` as
  holding no gold (`HasBidHoldingGold`) and releases its stale hold.
- **No withdrawal after the end.** `acceptingBidChanges` still refuses any change once the listing is
  frozen, bought out, or past its end.
- **Promotion and withdrawal of the same bid serialize** under the listing's OCC/row lock. Whichever
  lands second sees the first's result: a bid promoted first is a `WINNING` bid when its owner
  withdraws it, and that withdrawal promotes the next (ADR-0028).
- **Cost: fewer candidates for promotion.** If every outbid delver withdrew, a withdrawn leader leaves
  no leader and the price falls back to the start. That is right: those delvers chose to leave.
- FS-0YXG6's rule, "a bid no longer withdrawable answers `400 · FAILED_PRECONDITION`", still holds;
  `OUTBID` simply stops being one of those. `WON`, `LOST` and `CANCELLED` remain final.
