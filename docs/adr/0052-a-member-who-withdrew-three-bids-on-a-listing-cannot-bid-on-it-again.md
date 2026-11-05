# ADR-0052 — A member who has withdrawn three bids on a listing cannot bid on it again

Status: accepted
Date: 2026-11-05
Scope: `game-server/marketplace-service` (`Listing.PlaceBidWithID`, the place-bid use case's
advisory check), `common/errcode` (`BID_WITHDRAW_LIMIT_REACHED`), the gateway's place-bid
operation, game-client's bid refusals
Builds on: [ADR-0028](0028-a-withdrawn-leader-is-replaced-by-the-next-highest-bid.md) (promotion
on a withdrawn leader) · [ADR-0029](0029-an-outbid-bid-may-be-withdrawn.md) (an outbid bid may be
withdrawn) · ADR-0048 (a leading bid is locked in for the final 30 minutes; on a branch not yet
merged) · [ADR-0024](0024-a-bids-hold-is-released-by-a-temporal-workflow-not-a-grpc-call.md)
(every withdrawal starts a ReleaseHold workflow)

## Context

Recorded without adversarial review. Decided by the user on 2026-11-05, after an abuse audit of
the bidding flow.

Withdrawing a bid is free and can be repeated without limit, and ADR-0028 makes a loop out of it:

1. A leads at 100. B bids 101 and leads; A becomes OUTBID.
2. B withdraws. ADR-0028 promotes A back to the lead, and the price returns to 100.
3. B bids 101 again, withdraws again, and so on.

Each turn appends a permanent `bids` row (a withdrawn bid becomes CANCELLED and is never deleted)
and starts a ReleaseHold workflow (ADR-0024). B's gold comes back every time, so the loop costs
B nothing. ADR-0048's final-30-minute lock stops the leader's withdrawal only near the end, and
it doesn't affect an OUTBID withdrawal at all.

Everyone else pays for it. Every write on the listing loads all of its bids under the row lock:
place, withdraw, buyout, accept and every settlement step. The public browse and detail reads
also scan them to compute the price. A listing that has been looped a few thousand times slows
every honest bidder and lengthens how long its row lock is held.

Alternatives considered:

- **A cooldown after a withdrawal.** It slows the loop but doesn't bound it; rows still grow
  without limit over the auction's life.
- **A per-member cap on bids per listing.** It bounds the loop, but with a 1-gold minimum
  increment an honest bidding war can reach any reasonable cap, and refusing a legitimate raise
  is worse than refusing a looping one.
- **A withdrawal fee.** It gives the loop a real cost, but there is no fee mechanism and no
  system account to pay it into (ADR-0006).
- **Load only live bids into the aggregate.** This makes each operation cheaper, but it doesn't
  stop the table growing. It is still worth doing later as an optimisation.

## Decision

**A member who has three or more CANCELLED bids on a listing can no longer place a bid on that
listing. The refusal is `400 · BID_WITHDRAW_LIMIT_REACHED`.**

- **Withdrawing is never refused by this rule.** It limits only the next bid, so no member's
  gold is ever trapped behind it. A member who has several live bids and withdraws them all can
  therefore end with more than three withdrawals; the loop is still bounded.
- **Counted per member, per listing**, from that member's bids on that listing whose status is
  CANCELLED. CANCELLED means the bidder withdrew. Bids that end LOST, including bids LOST because
  the seller withdrew the listing, never count.
- **Buyout is not limited.** A buyout ends the auction and isn't part of the loop. Refusing a
  member who will pay the buyout price has no benefit.
- **Decided under the listing's row lock** in `PlaceBidWithID`, after the replay checks, so a
  keyed resend of a bid already recorded still succeeds. The place-bid use case asks the same rule
  on its unlocked read before placing the hold, so a refused bid freezes no gold.
- **Three is a tuning constant, not contract.** Changing the number needs no new ADR; changing
  what is limited does.
- **No grandfathering.** A member already past three withdrawals on a live listing when this
  ships is refused like anyone else.

## Consequences

- **The loop is bounded.** A member who loops adds at most about three CANCELLED rows and three
  ReleaseHold workflows per listing.
- **Honest bidders almost never meet it.** Withdrawing three bids on one auction is rare, and
  raising is never limited.
- **No migration, no new query.** The aggregate already loads every bid on the listing, so the
  count is read in memory under the lock that decides the bid.
- **Cost: a member who withdraws in good faith three times is locked out of that one auction.**
  The client warns about the rule in the withdraw confirm.
- **Not addressed:** loading only live bids into the aggregate (the optimisation above); the
  1-gold minimum increment; alt accounts, since each account has its own count.
