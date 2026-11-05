# FS-F692V: Accept never sells below the leading bid shown

> Status: work-order · SPECIFICATION.md: `game-server/marketplace-service/SPECIFICATION.md` "### Listings & bids" and `game-client/SPECIFICATION.md` "### Marketplace" → "Accept never sells below the leading bid shown" → this FS · Related ADRs: [ADR-0028](../adr/0028-a-withdrawn-leader-is-replaced-by-the-next-highest-bid.md) (a withdrawn leader is replaced by a lower runner-up, which is how the leading bid drops under a seller's feet) · Related FS: [FS-49Z37](49Z37-marketplace-sale-actions.md) (the seller block, the confirm copy and accept's refusals, which this extends), [FS-NXP1W](NXP1W-auction-settlement-saga.md) Req 3 and Req 42 (AcceptBid and its HTTP entry point; unchanged: no bid id reaches the workflow) · Vocabulary: [`marketplace-service/CONTEXT.md`](../../game-server/marketplace-service/CONTEXT.md) (*accept floor*) · Surfaces: marketplace-service, common (proto, errcode), api-gateway (contract), game-client · Scoped and promoted 2026-11-05 under Nick's charter "accept-bid floor". **[charter default]** marks a default Claude proposed and Nick approved in the charter.

> **Amended 2026-11-05** by Nick, after the code review of I-F692V-1 and before the branch was
> merged: two owner decisions, documentation only, no code change.
> **(A1) No body at all is a 400.** A request with no body at all answers `400 · VALIDATION_FAILED`,
> not 422: huma refuses a missing required body before it validates the body's shape, the same as
> buyout (`TestBuyout_NoBodyIsABadRequestBeforeCallingMarketplace`). It still never reaches
> marketplace. A body whose `minAmount` is missing, not an integer or below 1 still answers
> `422 · VALIDATION_FAILED`.
> **(A2) A higher bid is PENDING.** A new edge state: the read model's `currentPrice` counts a
> WINNING or PENDING bid, the floor compares the WINNING bid only. Unreachable today; if it ever
> becomes reachable, refusing is the safe outcome.
> Requirement 7, the gateway acceptance criterion and the §API surface row are corrected in place,
> and Edge States gains one entry; each says *(Amended 2026-11-05, A1/A2 …)*.

## Summary

When a seller accepts the leading bid, the accept now carries the amount the seller was shown. The
server refuses the accept if the leading bid has since dropped below that amount, so a seller looking
at a stale page can never sell for less than they agreed to. A higher bid landing first still wins,
as the confirm copy has always said. On the refusal the client re-reads the listing and tells the
seller the leading bid dropped, so they can look again and decide.

This is a seller-consent fix, not a security fix. Today accept-bid carries only the listing id and
settlement's step 0a sells to whatever bid leads when it freezes the listing. If the leader withdrew
after the seller's page loaded, ADR-0028 promotes a lower runner-up and the seller sells at the
runner-up's price; if no bid was left, 0a's no-bids arm hands the item back and expires the listing
the seller meant to sell. Nobody can time this deliberately (an attacker cannot see when the seller
will press Sell); it happens to an honest seller on an old page.

## Requirements

### The accept floor (marketplace-service)

1. **accept-bid carries the seller's floor.** The request names the leading bid amount the seller
   was shown as `minAmount`, the *accept floor*. It is required. **[charter default D1, D3]** —
   reason: one charter ships client and server together; an optional floor would let an old client
   skip the check silently.
2. **The floor is a floor, not an identity.** Accept is refused when the listing's WINNING bid
   amount is below `minAmount`. At or above it, settlement starts exactly as today, whoever leads.
   **[charter default D2]** — reason: FS-49Z37's confirm copy already promises "a higher bid landing
   first is the one that wins"; the client never knows the leader's bid id, and must not.
3. **Where it is checked.** `Listing.CanAcceptBid` gains the floor and applies it after its existing
   checks (seller, open, someone leads), so a non-seller still learns nothing about the listing from
   the refusal. `AcceptBidUsecase` asks it on its existing unlocked read before starting settlement.
   Settlement, step 0a and the other two triggers (expiry poller, buyout) are untouched; no bid id
   and no amount reaches the workflow (FS-NXP1W Req 3 and Req 42 stand). **[charter default D4]** —
   reason: 0a is shared by all three triggers, and the stale page is the real case.
4. **Accepted residual window.** Between the use case's read and 0a's freeze (milliseconds), the
   leading bid can still drop; that accept sells at the lower bid, or, with no bid left, takes 0a's
   no-bids arm, exactly as today. Closing it would mean carrying the floor into the workflow and
   checking it in 0a under the row lock. Not done: the window is far smaller than a stale page.
   **[charter default D4]**
5. **The refusal is its own code.** A floor refusal is the domain refusal `LEADING_BID_LOWERED`: a
   new code registered in `common/errcode` (`domainCodes`), raised by marketplace as
   `FailedPrecondition` with that ErrorInfo reason, answered by the gateway as
   `400 · LEADING_BID_LOWERED`, the same mechanism as `ITEM_WORN`. **[charter default D5]** —
   reason: the client must tell "the price dropped, look again" from "no longer for sale".
6. **No leader is unchanged.** A listing nobody leads is still refused as today (`ErrNoBidToAccept`,
   its existing mapping), whatever the floor. **[charter default D7]**
7. **Shape is checked at the boundary.** A request with `minAmount` missing, not an integer, or below
   1 is malformed and answered by the gateway as `422 · VALIDATION_FAILED`, before marketplace is
   called, the same way buyout's `amount` (`minimum:"1"`) is. Marketplace still refuses
   `min_amount` ≤ 0 on its own gRPC entry (`InvalidArgument`), for any caller that is not the
   gateway. **[charter default D3, status per `docs/specs/README.md`]** — the charter's "400
   VALIDATION" is applied as the repo's shape/domain split: a missing or non-positive field is shape
   (422), only a domain rule is 400. *(Amended 2026-11-05, A1: a request with no body at all
   answers `400 · VALIDATION_FAILED`, because huma refuses a missing required body before it
   validates the shape, as on buyout; a body without a valid `minAmount` is still 422.)*
8. **Contract.** The gRPC `AcceptBidRequest` gains `int64 min_amount`, regenerated from the `.proto`
   with `common`'s `make gen`, never hand-edited. The gateway's typed accept-bid operation gains a
   JSON body `{ "minAmount": <int ≥ 1> }`, documents `LEADING_BID_LOWERED` in its description, and
   the contract is regenerated with `make openapi && make client`, never hand-edited.

### The seller block (game-client)

9. **Sell sends what the confirm shows.** Pressing `Sell` sends accept-bid with `minAmount` equal to
   the `currentPrice` the confirm dialog displays at that moment (FS-49Z37 Req 14's
   `{currentPrice}`). The confirm copy is unchanged. **[charter default D6]**
10. **`400 · LEADING_BID_LOWERED`:** close the dialog, re-read the listing, and show
    `The leading bid dropped since you looked — check it and accept again.` The re-read listing
    shows the new leading bid with Accept, or `No bids yet.` if nobody leads. Nothing is sold.
    **[charter default D6]**
11. **Every other accept outcome is FS-49Z37 Req 16–17, unchanged:** `202` sold, `409 · CONFLICT`,
    `400 · FAILED_PRECONDITION`, `503`, anything else.

## User Stories

1. As a seller, I want my accept to sell for at least the leading bid I was shown, so that I never
   sell for less than I agreed to.
2. As a seller on a page I opened a while ago, I want my accept refused if the leading bid has dropped,
   so that a withdrawal I didn't see doesn't sell my relic cheaply.
3. As a seller, I want a higher bid landing before my accept to still win, so that accepting is never
   worse for me than what I saw.
4. As a seller whose accept was refused because the bid dropped, I want the listing re-read and a
   plain message, so that I see the new leading bid and can decide again.
5. As a seller whose leading bidder withdrew and left no bid, I want my accept refused rather than my
   auction quietly ended with no sale, so that my listing keeps running.
6. As a seller, I want the confirm copy to stay as it is, so that what I'm agreeing to reads the same.
7. As a seller, I want to accept again at the new leading bid with one more confirm, so that a drop
   costs me one extra click, not a lost listing.
8. As a bidder, I want the seller's floor never to reveal or depend on my bid id, so that bidding stays
   anonymous.
9. As a bidder whose higher bid landed just before the seller accepted, I want my bid to win, so that
   the floor never refuses a sale that is better for the seller.
10. As the marketplace service, I want the floor checked in the listing aggregate beside the other
    accept rules, so that every accept rule lives in one place.
11. As the marketplace service, I want the floor checked only after the seller check, so that a
    non-seller learns nothing about the leading bid from a refusal.
12. As the marketplace service, I want settlement and step 0a untouched, so that expiry and buyout,
    which share the workflow, behave exactly as before.
13. As the marketplace service, I want a non-positive `min_amount` refused on my own gRPC entry, so
    that a caller other than the gateway cannot skip the floor by sending zero.
14. As the gateway, I want a missing or non-positive `minAmount` refused as malformed before calling
    marketplace, so that shape errors never reach the domain.
15. As the gateway, I want `LEADING_BID_LOWERED` passed through as a registered code, so that the
    client can switch on it instead of reading prose.
16. As the game client, I want to tell "the bid dropped" apart from "no longer for sale", so that I
    show the right message and the seller knows the listing is still live.
17. As the game client, I want the generated client to require `minAmount`, so that a call without
    it fails to compile instead of failing at runtime.
18. As a maintainer, I want the accepted race window between the check and the freeze written down,
    so that nobody mistakes it for a bug or assumes it was closed.
19. As a maintainer, I want the contract and the proto regenerated, never hand-edited, so that the
    generated artifacts stay derived from their sources.

## Acceptance Criteria

Server (marketplace, common, gateway):

- [ ] `Listing.CanAcceptBid` with a floor: the seller, ACTIVE, not ended, WINNING amount ≥ floor →
      allowed; WINNING amount < floor → the new floor refusal; equal → allowed.
- [ ] The refusal order holds: a non-seller with any floor gets `ErrNotSeller`; a seller on a closed
      or ended listing gets the existing closed/ended refusal; a seller with nobody leading gets
      `ErrNoBidToAccept`, whatever the floor.
- [ ] `AcceptBidUsecase` refused on the floor starts no settlement.
- [ ] `AcceptBidUsecase` at or above the floor starts `settlement-{listingId}` with trigger
      `ACCEPT_BID`, and the workflow input carries no bid id and no amount.
- [ ] gRPC `AcceptBid`: a floor refusal answers `FailedPrecondition` with ErrorInfo reason
      `LEADING_BID_LOWERED`; `min_amount` ≤ 0 answers `InvalidArgument` and calls no use case.
- [ ] `LEADING_BID_LOWERED` is in `errcode`'s `domainCodes`, and the gateway maps it to
      `400 · LEADING_BID_LOWERED`.
- [ ] Gateway: `POST /api/marketplace/listings/{listing_id}/accept` with no body, no `minAmount`, or
      `minAmount < 1` answers `422 · VALIDATION_FAILED` and never calls marketplace; with a valid
      body it forwards `min_amount`. *(Amended 2026-11-05, A1: with no body at all it answers
      `400 · VALIDATION_FAILED`, as buyout does, and never calls marketplace; a body with no
      `minAmount`, a non-integer one or `minAmount < 1` answers 422.)*
- [ ] `openapi.yaml` and the generated client show the required `minAmount` body; both are
      regenerated (`make openapi && make client`), and the proto Go is regenerated (`make gen`).

Client:

- [ ] `Sell` sends `minAmount` equal to the `currentPrice` in the confirm copy.
- [ ] `400 · LEADING_BID_LOWERED` → dialog closed, listing re-read, the Req 10 message shown, not sold.
- [ ] Every other accept outcome behaves as FS-49Z37 Req 16–17 (existing tests still pass).

## Edge States

- **Leader withdrew, runner-up promoted lower:** refused `LEADING_BID_LOWERED`; the re-read shows the
  runner-up's amount with Accept.
- **Leader withdrew, no bid left:** refused as today with `ErrNoBidToAccept` (`400 ·
  FAILED_PRECONDITION`), so the client re-reads and shows `No bids yet.`, the FS-49Z37 Req 17 path,
  not this FS's message. Nothing is sold or expired.
- **A higher bid landed after the seller's page loaded:** allowed; the higher bid wins.
- **The same amount, a different bidder** (the leader withdrew and someone bid exactly that): allowed.
  The floor is about price, never bidder identity.
- **Floor above anything ever bid** (a tampered request): refused `LEADING_BID_LOWERED`. No harm.
- **The bid drops between the use case's read and 0a's freeze:** the accept goes through and 0a sells
  at the lower bid, or takes the no-bids arm. Accepted residual window (Req 4).
- **Accept while a buyout is landing, or after the listing froze:** unchanged, refused as today by
  the existing closed/bought-out checks, before the floor is looked at.
- **Expiry and accept race:** unchanged; both start the same workflow, the second start is a no-op.
- **Concurrent double press:** unchanged; the client guards in flight, and a second start is a no-op.
- **A higher bid is PENDING:** the read model's `currentPrice` counts a WINNING or PENDING bid, but
  the floor compares the WINNING bid only, so a seller shown a PENDING contender's amount is refused
  `LEADING_BID_LOWERED` while the WINNING bid is lower. Unreachable today: PlaceBid records and
  confirms a bid in one transaction, so a PENDING bid is never persisted. If one ever is, refusing
  is the safe outcome (comparing against the PENDING contender could sell below the floor), but the
  Req 10 refusal copy ("the leading bid dropped") would then need revisiting. *(Amended 2026-11-05,
  A2: new edge state, no code change.)*

## API surface

| Op | Method + Path | Query/Params | Request body | Response | Errors |
|----|---------------|--------------|--------------|----------|--------|
| accept-bid (changed) | `POST /api/marketplace/listings/{listing_id}/accept` | `listing_id` (uuid, path) | `{ "minAmount": integer, required, ≥ 1 }` — the leading bid amount the seller was shown | `202`, no body (unchanged) | `400 · LEADING_BID_LOWERED` (the WINNING bid is below `minAmount`; new) · `400 · FAILED_PRECONDITION` (closed, ended, or nobody leads; unchanged) · `403 · FORBIDDEN` (not the seller; unchanged) · `404 · NOT_FOUND` (unchanged) · `409 · CONFLICT` (unchanged) · `422 · VALIDATION_FAILED` (`minAmount` missing, not an integer, or < 1; new) · `400 · VALIDATION_FAILED` (no body at all; huma refuses it before shape validation, as on buyout; new) *(Amended 2026-11-05, A1)* · `401`, `500`, `503` (unchanged) |

gRPC: `marketplace.AcceptBidRequest { string listing_id = 1; int64 min_amount = 2; }`. Identity stays
the token's, never the body.

## Out of Scope

- Checking the floor inside settlement / step 0a, or carrying it into the workflow (Req 4's window).
- The expiry poller and buyout triggers.
- Exposing any bid id to the client, or accepting a specific bid.
- Changing the confirm copy, the seller block's layout, or FS-49Z37's other refusals.
- Withdraw rules (ADR-0028, ADR-0048) and the anti-snipe question.
- wallet-service, items-service, migrations.
