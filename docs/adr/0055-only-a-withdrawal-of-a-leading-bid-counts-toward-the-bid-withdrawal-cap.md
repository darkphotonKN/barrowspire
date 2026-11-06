# ADR-0055 — Only a withdrawal of a leading bid counts toward the bid withdrawal cap

Status: accepted
Date: 2026-11-05
Scope: `game-server/marketplace-service` (`Listing.WithdrawBid`, `Listing.WithinBidWithdrawalCap`,
the listing repository, migration `000012`), the gateway's place-bid and withdraw-bid operation
descriptions, game-client's withdraw confirm. Specified by
[FS-S109X](../specs/S109X-outbid-withdrawals-dont-count.md).
Amends: [ADR-0052](0052-a-member-who-withdrew-three-bids-on-a-listing-cannot-bid-on-it-again.md) —
the "Counted per member, per listing, from that member's bids on that listing whose status is
CANCELLED" clause: only CANCELLED bids that were leading when withdrawn count
Builds on: [ADR-0028](0028-a-withdrawn-leader-is-replaced-by-the-next-highest-bid.md) (promotion
on a withdrawn leader, the loop the cap bounds) ·
[ADR-0029](0029-an-outbid-bid-may-be-withdrawn.md) (an outbid bid may be withdrawn) ·
[ADR-0048](0048-a-leading-bid-is-locked-in-for-the-auctions-final-30-minutes.md) (a leading bid
is locked in for the final 30 minutes) ·
[ADR-0054](0054-a-member-already-leading-a-listing-cannot-bid-on-it-again.md) (a leading member
cannot bid again)

## Context

Recorded without adversarial review. Decided by the user on 2026-11-05, in a charter run that
followed the bid withdrawal cap shipping.

ADR-0052 counts every CANCELLED bid a member has on a listing. At three, their next bid is
refused with `BID_WITHDRAW_LIMIT_REACHED`. That catches the loop it was written for, but it also
catches an honest bidder in a bidding war:

1. A bids 100 and leads. B bids 110 and leads; A's 100 turns OUTBID.
2. A's 100 stays held until settlement step 2 (ADR-0028 §Context), so A withdraws it to get the
   gold back (ADR-0029), then bids 120.
3. B outbids again, A withdraws again, and so on.

After three rounds A can't bid on that auction at all, though no withdrawal of A's moved the price
or changed who led. The loop ADR-0052 bounds is a different act: withdrawing a **leading** bid.
ADR-0028 then promotes the runner-up, the price falls back, and the withdrawer can bid again for
free. Withdrawing an OUTBID bid promotes nobody and changes no price, so a cap on it limits only
honest bidders.

The bid row doesn't record which kind a withdrawal was. Both end CANCELLED, and the bid's earlier
statuses aren't stored anywhere.

Alternatives considered:

- **A new bid status for a leading withdrawal** (say `WITHDRAWN_LEADING`). It would need a status
  CHECK migration and changes to every status switch, the my-bids read and the client's status
  labels, all for a fact that only the cap reads. CANCELLED would also stop meaning "the bidder
  withdrew".
- **Inferring it at read time.** Not possible: no status history is stored.
- **Keep counting every withdrawal (today).** This keeps punishing the bidding war above.
- **Forgive old withdrawals in the backfill** (existing CANCELLED rows count as outbid). It would
  release members who really did loop. Nothing is live yet, so the conservative backfill costs
  nobody anything.

## Decision

**Only a withdrawal of a bid that was leading, status WINNING, at the moment of withdrawal counts
toward the bid withdrawal cap. Withdrawing an OUTBID bid never counts.**

- **The status at the moment of withdrawal decides.** A bid promoted back to WINNING (ADR-0028)
  and then withdrawn counts. A bid that once led and is withdrawn after being outbid doesn't. A
  PENDING bid can't be withdrawn, so there is no third case.
- **Recorded on the bid as `withdrawn_while_leading`**, a `BOOLEAN NOT NULL DEFAULT false` column
  on `bids`. `Listing.WithdrawBid` sets it in the same aggregate change, and so in the same write,
  that makes the bid CANCELLED. `WithdrawBid` already decides `wasLeading` before the transition.
  No new status; the status CHECK is unchanged.
- **The cap counts** a member's bids on the listing that are CANCELLED **and**
  `withdrawn_while_leading`. The other ADR-0052 clauses stand: the limit is 3 and a tuning
  constant, withdrawing is never refused, buyout isn't limited, the rule is decided under the row
  lock after the replay checks and asked again before the hold, and nobody is grandfathered.
- **A new migration pair (marketplace `000012`) backfills every existing CANCELLED row to
  `true`.** No old withdrawal recorded whether it led, so every one keeps counting. No existing
  migration is edited.
- **The client's withdraw confirm tells the two kinds apart.** It already has the bid's status, so
  no API changes. The gateway's place-bid and withdraw-bid descriptions name "withdrawals of a
  leading bid".

## Consequences

- **An honest bidding war is never capped.** A bidder can withdraw every outbid bid to free its
  gold and keep bidding.
- **The loop stays bounded.** Each pass of the ADR-0028 loop withdraws a leading bid, so it still
  stops after about three passes per member per listing.
- **Accepted cost: two accounts alternating outbid-then-withdraw can add bid rows without hitting
  the cap.** A outbids B, B withdraws its outbid bid for free and outbids A, A does the same, and
  so on. Each round raises the price by at least 1, up to the buyout price where one is set, and
  each bid needs real gold held behind it, so the rows grow only as fast as the price climbs.
  ADR-0054 stops one account from doing this alone, since a leading member can't bid again. Alt
  accounts were already out of scope in ADR-0052.
- **ADR-0052's "No migration" consequence no longer holds.** The cap now needs one column and one
  backfill. The count is still read in memory from the bids the aggregate already loads, so there
  is still no new query.
- **CANCELLED alone no longer tells the cap anything.** A reader that wants to know whether a
  withdrawal counted must read `withdrawn_while_leading`.
- **Not addressed:** telling bidders how much gold their outbid bids still hold; releasing an
  older OUTBID hold automatically when its owner rebids (a place-bid TCC change); the 1-gold
  minimum increment; alt accounts.
