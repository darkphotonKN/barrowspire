# ADR-0054 — A member already leading a listing cannot bid on it again

Status: accepted
Date: 2026-11-05
Scope: `game-server/marketplace-service` (`Listing.PlaceBidWithID`, the place-bid use case's
advisory check), `common/errcode` (`ALREADY_LEADING`), the gateway's place-bid operation,
game-client's bid refusals. Specified by [FS-72KT8](../specs/72KT8-no-bidding-against-your-own-lead.md).
Amends: [ADR-0028](0028-a-withdrawn-leader-is-replaced-by-the-next-highest-bid.md) — when the
promoted bid is the withdrawing member's own, that member is leading and cannot bid again
Builds on: [ADR-0048](0048-a-leading-bid-is-locked-in-for-the-auctions-final-30-minutes.md) (a
leading bid is locked in for the final 30 minutes) ·
[ADR-0052](0052-a-member-who-withdrew-three-bids-on-a-listing-cannot-bid-on-it-again.md) (the
withdrawal cap, whose placement this copies) ·
[ADR-0027](0027-place-bid-id-is-derived-from-the-callers-key.md) (a keyed resend is a replay) ·
[ADR-0049](0049-a-refused-bid-answers-only-once-its-hold-is-back.md) (a refusal under the lock
waits for its hold)

## Context

Recorded without adversarial review. Decided by the user on 2026-11-05, after a local API run of
the auction flow showed what a self-raise costs.

A member whose bid leads a listing can bid on it again today. The new bid leads, the old one turns
OUTBID, and the old bid's hold stays `RESERVED` until settlement step 2 (FS-NXP1W Req 29; nothing
releases an outbid hold earlier, ADR-0028 §Context). So every self-raise freezes another stack of
the member's gold and pushes the price up against nobody. In the 2026-11-05 run one bidder who
raised their own lead six times had 1765 gold held for a single listing.

It also opens bid shielding on one account, through ADR-0028's promotion:

1. A bids 100 and leads. A bids 1000 on top; the 100 turns OUTBID.
2. The 1000 scares other bidders off. Before the final 30 minutes (ADR-0048), A withdraws it.
3. ADR-0028 promotes the highest OUTBID bid, A's own 100, back into the lead.

Alternatives considered:

- **Let a member raise their own bid, releasing the old hold.** This is what most auction sites
  allow, usually with proxy (maximum) bidding. Here it needs the place-bid TCC to release a second
  hold in the same flow, and ADR-0024 makes every release a Temporal workflow with its own failure
  arms. It also leaves the shielding loop open.
- **Let a member raise their own bid and keep the old hold (today).** Costs the member gold for
  nothing and leaves shielding open.
- **Hide or disable the bid box for a leader.** Needs a viewer-relative `leading` flag on the
  listing reads (proto, gateway, client, like `own` in ADR-0053), and the server must refuse
  anyway, since the read is stale by the time the bid arrives. Worth adding later on top of this.

## Decision

**A member whose bid is the listing's leading bid cannot place another bid on it. The refusal is
`400 · ALREADY_LEADING`, and no gold is held for it.**

- **Leading means** the member owns the bid that the price rules compare against: the highest
  WINNING or PENDING bid. Counting PENDING also catches the member's own second bid racing the
  first.
- **Decided under the listing's row lock** in `PlaceBidWithID`, in this order: replay checks →
  `CanPlaceBid` → withdrawal cap (ADR-0052) → leading → price rules. A keyed resend of the leading
  bid is still answered as that bid; a capped member still gets the cap refusal; a leader who sends
  a too-low amount is told they lead, not that the price is wrong.
- **Asked again before the hold** on the use case's unlocked read, so a leader's bid freezes no
  gold. The locked check is authoritative: a refusal found only under the lock releases its hold
  and answers `ALREADY_LEADING` (ADR-0049), never 503.
- **Buyout is not limited.** A buyout ends the auction; it isn't bidding against yourself.
- **ADR-0028's promotion is unchanged, and its outcome counts.** If promotion puts the withdrawing
  member's own earlier bid back in the lead, they are leading and their next bid is refused. To bid
  again they must withdraw that bid too, which counts toward the withdrawal cap, and in the final
  30 minutes they can't withdraw it at all.
- **No grandfathering of new bids, no repair of old ones.** Bids already stacked by one member stay
  and settle as today; only new bids are refused, including from a member whose legacy stack leads.

## Consequences

- **No more self-raise gold stacks** on new bids, and the one-account shield loop ends after one
  withdrawal: the shielder is left leading at their low bid, with the cap and the final-30-minute
  lock behind it.
- **A leader can't raise in advance against a sniper.** They bid again once someone outbids them.
  With a 1-gold minimum increment and no proxy bidding, a late sniper can win by 1 gold. That was
  already true; this decision removes a workaround that cost gold anyway.
- **Honest bidders are untouched** until they lead; an outbid member bids as before.
- **A new registered code, no migration, no new query.** The aggregate already loads every bid
  under the lock.
- **Deploy order matters.** marketplace-service ships after the gateway and client that know the
  code; an old gateway answers `400 · FAILED_PRECONDITION`, which the client misreads.
- **Not addressed:** releasing a member's older OUTBID holds when they bid again after being
  outbid (a TCC change); proxy bidding; a `leading` flag on reads; alt accounts bidding against
  each other.
