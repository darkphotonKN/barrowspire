# ADR-0051 — A listing may be withdrawn with live bids, except in its final 30 minutes

Status: accepted
Date: 2026-11-05
Scope: `game-server/marketplace-service` (withdraw-listing use case, a `withdraw-listing`
Temporal workflow), `game-server/api-gateway` (the withdraw route), `game-client` (the seller's
withdraw action, how a bidder sees a withdrawn listing). items-service and wallet-service are
reached only through their existing `ReturnItem` and `ReleaseAllHolds` activities.
Builds on: [ADR-0024](0024-a-bids-hold-is-released-by-a-temporal-workflow-not-a-grpc-call.md) (gold is
given back by a durable workflow, never inline on the request) · ADR-0048 (a leading bid is locked in
for an auction's final 30 minutes; on a branch not yet merged when this was written, referenced by
number) · [ADR-0028](0028-a-withdrawn-leader-is-replaced-by-the-next-highest-bid.md) (withdrawal
rules for bids)
Resolves: FS-NXP1W's open product decision "ListingWithdraw saga (with live bids)" (its Out of Scope,
and its Edge State "Listing withdrawn before 0a runs"). FS-NXP1W is not edited.

## Context

Recorded without adversarial review. Decided by the user on 2026-11-05 while chartering the listing
withdraw API.

A seller cannot take a listing down today. `Listing.Cancel` exists (ACTIVE → CANCELLED) and an unwired
`WithdrawListingUC` flips the status, but there is no RPC or route, no check that the caller is the
seller, nothing returns the item, and nothing gives back the bidders' held gold. A listing with a
mistyped end date (the end time has no upper bound yet) therefore pins its item, and every bid's gold,
until that date.

FS-NXP1W left withdrawing a listing that has live bids as an open product decision. Allowing it costs
two things: every bidder's hold must be released, and a seller may use withdrawal to reject a price they
dislike. There is no listing fee, so watching the bidding and pulling the listing near the end would be a
free reserve price. Forbidding it outright traps a seller's item behind any single bid, which is also what
a malicious early bid could exploit.

## Decision

**A seller may withdraw their listing while it is ACTIVE, before its end and not bought out, whether or
not it has live bids — except that a listing with live bids cannot be withdrawn in its final 30 minutes.**

- *Live bids* are bids that still hold gold: PENDING, WINNING or OUTBID. Without them, a listing may be
  withdrawn right up to its end.
- **Bought out** means a buyout bid has landed. The sale is decided and settlement is about to start, so
  withdrawal is refused like any other bid change on such a listing.
- **The write is one locked change to the listing aggregate.** The listing becomes CANCELLED and every live
  bid becomes LOST, in a single write under the listing's row lock. A withdrawn listing is final: it never
  becomes ACTIVE again.
- **Side effects run in a durable workflow, started after the commit.** The workflow,
  `withdraw-listing-{listingId}`, returns the item to its seller (items `ReturnItem`, fenced on the
  listing id) and releases the hold of every bid on the listing (wallet `ReleaseAllHolds`, which skips a
  bid it holds nothing for). Both steps are idempotent, and retries are uncapped (ADR-0024).
- **Repeating a withdrawal succeeds.** A withdrawal of an already-CANCELLED listing by its seller is
  success, and the start is deduplicated on the workflow id.

## Consequences

- **A seller is never trapped by a bid.** Their item can come back at any time except in the last half hour
  of a contested auction.
- **The final-30-minute lock answers the free reserve price.** A seller can still reject a price they
  dislike, but only while bidders have time to respond elsewhere. In the last half hour a contested auction
  runs to its end. This mirrors ADR-0048, which locks the *leader* for the same window: in the final half
  hour, neither side of a contested auction can walk away.
- **Bidders lose without acting.**
  - Their bids read LOST against a CANCELLED listing, and their gold comes back as soon as the workflow
    runs.
  - There is no notification system for auctions yet, so they learn this only by reading My bids. Clients
    should tell "the seller withdrew" apart from "you lost the auction" by the listing's status.
  - LOST is reused rather than adding a status, because a new status needs a migration. CANCELLED stays
    reserved for a bidder's own withdrawal.
- **Overlap with settlement is safe, not prevented.**
  - A seller who accepts the leading bid and then withdraws before settlement freezes the listing (step 0a)
    makes 0a meet a non-ACTIVE listing. That is the existing pre-pivot rollback (FS-NXP1W Req 12).
  - The rollback releases holds, loses bids, and leaves the CANCELLED status in place (MarkSettlementFailed
    overwrites only PENDING_SETTLEMENT). All of these steps are idempotent alongside the withdraw workflow.
  - After 0a, the listing is no longer ACTIVE and withdrawal is refused.
  - The rollback raises a settlement exception, so an accept followed by a withdraw shows up as one.
- **A failed return is visible only in Temporal.** If `ReturnItem` fails non-retryably (the item is not
  where the listing says), the workflow fails and the item stays LISTED under a CANCELLED listing. This is
  the same visibility the hold-release workflow has.
- **Not decided here:**
  - a listing fee or withdrawal penalty;
  - notifying bidders;
  - withdrawal after settlement has started.
