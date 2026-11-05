# ADR-0048 — A leading bid is locked in for the auction's final 30 minutes

Status: accepted
Date: 2026-11-04
Scope: `game-server/marketplace-service` (`Listing.WithdrawBid`, `LeaderWithdrawLock`,
`ErrLeadingBidLocked`), the gateway's withdraw-bid operation
Amends: [ADR-0028](0028-a-withdrawn-leader-is-replaced-by-the-next-highest-bid.md) — when a WINNING
bid may be withdrawn at all
Builds on: [ADR-0029](0029-an-outbid-bid-may-be-withdrawn.md) (OUTBID withdrawal, unchanged)

## Context

Recorded without adversarial review. Decided by the user on 2026-11-04, after an audit of the
bidding flow surfaced bid shielding.

ADR-0028 made a withdrawn leader hand the lead to the highest remaining OUTBID bid. A withdrawal
was allowed right up to `endsAt`, so the two rules together made **bid shielding** possible, and
cheap:

1. Account A bids low. Account B, the same player or an accomplice, bids far above it and leads.
   Other bidders see a price they will not meet and leave.
2. Moments before the end, B withdraws. ADR-0028 promotes A, the highest OUTBID bid.
3. The auction ends with A winning at the low price, and nobody had time to outbid it.

Withdrawing costs nothing: B's hold is released at once (ADR-0024) and there is no fee. The
repro, a domain test in which a 5000-gold leader withdrawn 10 minutes before the end left a
120-gold bid WINNING, passed before this change.

ADR-0028 rejected *forbidding withdrawal of the WINNING bid* because it "traps a leader". That
objection holds for the whole auction. It does not hold for a short window at the end, which is
the only time the promotion turns a withdrawal into a win nobody can contest.

## Decision

**From 30 minutes before `endsAt`, a WINNING bid cannot be withdrawn.** The window is closed at its
start: at exactly `endsAt - 30m` the leader is already locked in. The withdrawal is refused with
`ErrLeadingBidLocked`, nothing is written, nobody is promoted, and the leader's hold stays
`RESERVED`. It answers `400 FAILED_PRECONDITION`.

**Only the leader is locked.** An OUTBID bid may still be withdrawn until the auction ends, and its
gold comes back at once (ADR-0029). With the leader locked, promotion cannot happen in the window,
so an OUTBID bid leaving changes no outcome.

Before the window nothing changes: a leader may withdraw and ADR-0028's promotion runs as before.

## Consequences

- **A shield must come down while there is still time to answer it.** Withdrawing at
  `endsAt - 30m` at the latest leaves rivals 30 minutes to outbid the promoted bid.
- **A leader is trapped for the last 30 minutes**: the cost ADR-0028 rejected, accepted here
  because it is bounded. Bidding is a commitment; for the final half hour it is binding.
- **A listing shorter than 30 minutes** puts its leader in the window from the moment they lead,
  so they can never withdraw. That is accepted: the window is not scaled to the listing's length.
- **Outbid gold stays free.** Locking every bid was considered and rejected: it would hold outbid
  players' gold until settlement and buy nothing, since an OUTBID withdrawal never changes the
  winner while the leader cannot leave.
- **The client needs no new code to read the refusal.** `400 FAILED_PRECONDITION` is what it
  already shows as "This bid can no longer be withdrawn." and refetches on (FS-0YXG6). It still
  offers Withdraw on a locked leader, though; hiding or labelling it is client work, not done here.
- **30 minutes is tuning, not contract.** It lives in one constant, `LeaderWithdrawLock`. Changing
  the number needs no new ADR; changing who is locked does.
- **Not addressed:**
  - *Sniping.* There is still no extension when a bid lands near the end. An anti-snipe extension
    would complement this rule, not replace it.
  - *Shielding before the window.* A shield withdrawn early still promotes a low bid, but rivals
    then have at least 30 minutes to respond, which is ordinary bidding.
  - *A withdrawal penalty or fee.* There is no fee system to charge it from.
- **Rejected:**
  - *Lock every bid in the window.* Costs outbid players their gold for nothing (above).
  - *Forbid withdrawing the WINNING bid outright.* ADR-0028's objection still applies.
  - *Drop ADR-0028's promotion.* Brings back the stranded-gold bug ADR-0028 fixed.
