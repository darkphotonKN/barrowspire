# ADR-0028 — A withdrawn leader is replaced by the next-highest bid

Status: accepted
Date: 2026-10-20
Scope: `game-server/marketplace-service` (`Listing.WithdrawBid`, `WithdrawBidUC`), and the specs that
describe a withdrawn leader (FS-8EGFA, FS-NXP1W)
Replaces: the "撤回領先者不遞補亞軍" (no promotion) trade-off in
[`docs/outline/bids.md` §2](../outline/bids.md). That outline is not an ADR, so nothing is superseded
formally; its paragraph is now wrong and points here.
Builds on: [ADR-0024](0024-a-bids-hold-is-released-by-a-temporal-workflow-not-a-grpc-call.md) (who
releases which hold)

## Context

Recorded without adversarial review. Decided by the user on 2026-10-20, after tracing why a withdrawn
leader leaves other bidders' gold frozen for good.

`docs/outline/bids.md` §2 chose **not** to promote the runner-up when the WINNING bid is withdrawn:
"the runner-up's hold was already released when they were outbid, so pulling them back into the lead
would put a bid with no gold behind it." That held for the design it was written in, where an
outbid bid gave its gold back at once.

The design moved on. Since FS-NXP1W, an outbid bid's hold stays `RESERVED` until settlement step 2
`ReleaseLosingHolds` (FS-NXP1W Req 29). Nothing releases it earlier: only the caller's own bid ever
has a release started (PlaceBid, WithdrawBid and Buyout each release their own; ADR-0024), and the
reservation reconciler treats an OUTBID bid as settlement's to release (`HasBidHoldingGold`). The
no-promotion rule was never revisited, and the two together strand gold:

1. A leads, B outbids A (A `OUTBID`, A's gold still held), B withdraws (B `CANCELLED`, B's gold
   released). No one is promoted; only A's OUTBID bid remains.
2. The auction ends. Step 0a finds no WINNING bid and takes the no-bids arm: NB1 returns the item,
   NB2 expires the listing. Neither touches bids or holds.
3. A's hold stays `RESERVED` for good. The reconciler skips OUTBID, and wallet has no sweeper over a
   hold's `expired_at`.

The specs did not catch it: FS-0YXG6 exposes withdraw-bid but says nothing about the leader;
FS-8EGFA's AC cites a "no-promotion rule (FS-0YXG6)" that FS-0YXG6 never states; FS-NXP1W's Edge
States have no "only OUTBID bids at the end" case.

## Decision

**Withdrawing the WINNING bid promotes the highest remaining OUTBID bid to WINNING. Ties go to the
bid placed first. With no OUTBID bid left, the listing has no leader and its price falls back to the
starting bid**, which is what `currentPrice()` already does when there is no WINNING bid.

The promotion happens in the same write as the withdrawal, under the listing's row lock, so the
single-WINNING invariant (one partial unique index, ADR-era bids design) holds at every commit.

## Consequences

- **No stranded gold from a withdrawn leader.** A listing that had a confirmed bid reaches settlement
  with a winner as long as any bid remains, and step 2 releases every loser's hold.
- **The promoted bid is backed.** Its hold has been `RESERVED` since it was placed; promotion moves
  no gold. Its expiry (`ends_at` + settlement grace) is unchanged.
- **The price after a leader withdraws** is the promoted bid's amount, not the starting bid, whenever
  another bid remains. The next bid must beat it.
- **A promoted bidder may be surprised**: they were outbid, and now lead without acting. That is the
  auction rule players expect, and their gold was committed to the bid all along.
- **A `PENDING` bid** (hold placed, not yet confirmed) is not promoted; when it confirms, `ConfirmBid`
  compares it with whoever leads then, promoted or not, as it does today.
- **Rejected:**
  - *Release every hold in the no-bids arm and keep no-promotion.* This frees the gold, but an
    auction with live bidders ends with no sale, against what players expect.
  - *Forbid withdrawing the WINNING bid.* Closes this one entry point and traps a leader.
  - Either may still be worth adding later as a safety net (a no-bids-arm release, or a wallet sweeper
    over `expired_at`) for holds stranded by paths this ADR does not foresee.
- **Docs to correct:** `docs/outline/bids.md` §2 (premise and rule); FS-8EGFA's AC on a withdrawn
  leader; FS-NXP1W gains the edge state "the leader withdrew and other bids remain".
