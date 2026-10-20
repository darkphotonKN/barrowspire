# FS-EYQ8K: My bids

> Status: work-order · SPECIFICATION.md: `game-server/marketplace-service/SPECIFICATION.md` "### Surface" → "Read a member's own bids", "Withdraw an outbid bid"; `game-server/api-gateway/SPECIFICATION.md` "### Marketplace" → "Read my bids"; `game-client/SPECIFICATION.md` "### Marketplace" → "View and withdraw my bids" → this FS · Related ADRs: [ADR-0029](../adr/0029-an-outbid-bid-may-be-withdrawn.md) (outbid bids may be withdrawn), [ADR-0028](../adr/0028-a-withdrawn-leader-is-replaced-by-the-next-highest-bid.md) (promotion on a withdrawn leader), [ADR-0024](../adr/0024-a-bids-hold-is-released-by-a-temporal-workflow-not-a-grpc-call.md) (withdraw releases its own hold) · Related FS: [FS-0YXG6](0YXG6-marketplace-http-surface.md) (withdraw-bid route; the `/listings/mine` pattern), [FS-8EGFA](8EGFA-marketplace-web-page.md) (the page and its house style)

## Summary

A delver can see every bid they have placed, with the relic, where its auction stands and whether
they lead, on a "My bids" view of the marketplace page. From that list they can withdraw a bid that
is leading or has been outbid, and the gold it held comes back. An outbid bid becomes withdrawable
for the first time (ADR-0029).

Scoped and specified under `/charter` on 2026-10-20. Every decision marked *charter default* was
approved by the user up front.

## Requirements

### Reading my bids

1. **`GET /api/marketplace/bids/mine`** pages the caller's own bids. The member is taken from the
   token, never the request. *Charter default: mirrors `/listings/mine` (FS-0YXG6).*
2. Paging is by an opaque `cursor` and a `limit` (default 50, max 100), with `nextCursor` present while
   more remain. *Charter default: same as `/listings/mine`.*
3. Order is newest placed first, `(createdAt DESC, id)`. *Charter default: recent bids are the ones
   looked at.*
4. Listed statuses are `PENDING`, `WINNING`, `OUTBID`, `WON`, `LOST`. `FAILED` (wallet never held gold
   for it) and `CANCELLED` (withdrawn) are not listed. *Charter default: v1 shows live and resolved
   bids; withdrawn history can come later.*
5. One row per bid, not grouped by listing. *Charter default: a member may bid more than once on a
   listing; grouping is deferred.*
6. Each row carries `bidId`, `listingId`, `amount`, `status`, `placedAt`, and a listing summary:
   `status`, `endsAt`, `ended`, `currentPrice`, `buyoutPrice` (absent when unset). *Charter default:
   the list must say whether the auction ended and what it stands at now.*
7. Each row embeds the listing's item summary the same way listings do (the gateway's `embedItems`
   join). If the items lookup fails, the whole request fails, as for listings. *Charter default.*
8. marketplace serves the read as one new gRPC RPC over `bids` joined to `listings`, using the existing
   `idx_bids_member`. No migration.

### Withdrawing from the list

9. **Backend (ADR-0029):** an `OUTBID` bid may be withdrawn while its listing is `ACTIVE` and not
   ended. The bid FSM gains `OUTBID → CANCELLED`. `WithdrawBidUC` already releases the withdrawn bid's
   hold (ADR-0024), so the gold returns at once. The leader is unaffected and no promotion runs.
10. A row offers **Withdraw** when its bid is `WINNING` or `OUTBID` and its listing is `ACTIVE` and not
    ended. `PENDING` bids are not offered it. *Charter default: `PENDING` lasts a moment.*
11. Withdraw asks for confirmation first, with copy by status. *Charter default: it cannot be undone.*
    - `WINNING`: "Withdraw your bid of {amount} gold? The next highest bid takes the lead." (ADR-0028)
    - `OUTBID`: "Withdraw your bid of {amount} gold? Your gold is returned."
12. Confirming calls the existing `DELETE /api/marketplace/listings/{listing_id}/bids/{bid_id}` through
    the generated client.
13. On `204`, the list and the purse are re-read. The bid then leaves the list (`CANCELLED` is not
    listed) and `heldGold` drops. *Charter default.*
14. Refusals: `400 · FAILED_PRECONDITION` → "This bid can no longer be withdrawn." and the list is
    re-read; `409` → the existing `BID_CONFLICT`; `503` → `BROWSE_UNREACHABLE`; anything else → the
    problem's `detail`. *Charter default.*

### The view

15. The marketplace page's Browse / Mine `ViewToggle` gains a third option, **My bids**. No new page.
    *Charter default.*
16. Status labels: `WINNING` "Leading", `OUTBID` "Outbid", `PENDING` "Placing…", `WON` "Won", `LOST`
    "Lost". *Charter default: FS-8EGFA house style.*
17. An empty list says so in the same voice as the existing empty states (e.g. "You have no bids.").
18. All calls go through the generated client. Decisions (which rows offer Withdraw, the confirm copy,
    refusal → copy) live in pure modules next to the existing marketplace ones, tested without a
    dialog.

## User Stories

1. As a delver, I want to see every bid I have placed, so that I know where my gold is committed.
2. As a delver, I want to see which relic each bid is on, so that I recognise it at a glance.
3. As a delver, I want to see whether I lead each auction, so that I know where to bid again.
4. As a delver, I want to see what each auction stands at now, so that I know what it would take to lead.
5. As a delver, I want to see whether an auction has ended, so that I stop thinking about it.
6. As a delver, I want to see bids I won and lost, so that I know how my auctions went.
7. As a delver, I want my newest bids first, so that the ones I care about are on top.
8. As a delver with many bids, I want them paged, so that the list stays fast.
9. As a delver who was outbid, I want to withdraw that bid, so that my gold comes back now rather than at the auction's end.
10. As a leading delver, I want to withdraw my bid, so that I can leave an auction I no longer want.
11. As a delver, I want to confirm before withdrawing, so that a misclick doesn't cost me my place.
12. As a leading delver, I want to be told the next bid takes the lead, so that I'm not surprised.
13. As a delver, I want my purse to show the returned gold right after withdrawing, so that I can bid elsewhere.
14. As a delver, I want a withdrawn bid to leave the list, so that the list shows only what's live or decided.
15. As a delver, I want to be told plainly when a bid can no longer be withdrawn, so that I stop trying.
16. As a delver, I want no withdraw offered on a finished auction, so that I'm not invited to do the impossible.
17. As a delver, I want the "My bids" view next to Browse and Mine, so that I find it where I already look.
18. As a delver who raised my own bid, I want each bid as its own row, so that I can see and withdraw either.
19. As a delver who was promoted after a leader withdrew, I want my bid to show as Leading, so that the list matches the auction.
20. As a delver, I want only my own bids listed, so that nobody else's activity is exposed.
21. As a client developer, I want the read through the generated client, so that the contract gates see it.
22. As a client developer, I want the withdraw rules in pure tested modules, so that changes are caught without a browser.

## Acceptance Criteria

- [ ] `GET /api/marketplace/bids/mine` returns only the caller's bids, newest first, paged by `cursor`/`limit` (default 50, max 100), with `nextCursor` while more remain.
- [ ] `FAILED` and `CANCELLED` bids are never returned; `PENDING`, `WINNING`, `OUTBID`, `WON`, `LOST` are.
- [ ] Each row carries the bid fields, the listing summary and the embedded item summary.
- [ ] A malformed cursor answers `400 · VALIDATION_FAILED`; no token answers `401`; an out-of-range `limit` answers `422`.
- [ ] Two bids by one member on one listing are two rows.
- [ ] Withdrawing an `OUTBID` bid on an `ACTIVE`, not-ended listing succeeds (`204`), cancels it and releases its hold; the leader is unchanged.
- [ ] Withdrawing an `OUTBID` bid on an ended, frozen or bought-out listing answers `400 · FAILED_PRECONDITION`.
- [ ] Withdrawing a `WON`, `LOST` or `CANCELLED` bid still answers `400 · FAILED_PRECONDITION`.
- [ ] The view offers Withdraw exactly on `WINNING`/`OUTBID` rows of `ACTIVE`, not-ended listings.
- [ ] The confirm copy follows the bid's status; `Cancel` sends nothing.
- [ ] After `204` the list and purse are re-read and the bid is gone from the list.
- [ ] Each withdraw refusal shows Requirement 14's copy.
- [ ] Status labels follow Requirement 16.
- [ ] `openapi.yaml` and the generated client are regenerated; oasdiff reports no breaking change.
- [ ] Tests pass on every surface; lint (including the client's token-only fence) and typecheck pass.

## Edge States

- **No bids:** an empty list with the empty-state line; no `nextCursor`.
- **Bid promoted while the list is open** (another leader withdrew, ADR-0028): the row still says "Outbid" until re-read; withdrawing it then withdraws a `WINNING` bid, which promotes the next. The confirm copy shown was the outbid one; the action is still right.
- **Bid outbid while the list is open:** the row says "Leading" until re-read; withdrawing it withdraws an `OUTBID` bid, allowed under ADR-0029.
- **Auction ended while the list is open:** withdraw answers `400 · FAILED_PRECONDITION` → "This bid can no longer be withdrawn." and the list is re-read.
- **Concurrent withdraw and settlement freeze:** whichever lands first under the listing lock wins; a refused withdraw shows the precondition copy.
- **Withdraw release fails to start:** the bid is still `CANCELLED`; the reconciler releases its hold later (ADR-0024, ADR-0029).
- **Items lookup fails:** the request fails as a whole (`500`/`503` through the seam), as for listings.
- **Signed out:** the My bids option asks the delver to sign in, as Mine does.

## API surface

New `list-my-bids`; `withdraw-bid` keeps its shape and only stops refusing `OUTBID` (ADR-0029).

| Op | Method + Path | Query/Params | Request body | Response | Errors |
|----|---------------|--------------|--------------|----------|--------|
| `list-my-bids` | `GET /api/marketplace/bids/mine` | query `cursor` opaque string, optional · query `limit` int, optional, default 50, 1–100 (same as `list-my-listings`) | none | `200` · `{ bids: MyBid[], nextCursor?: string }` | `400 · VALIDATION_FAILED` (malformed cursor) · `401 · UNAUTHENTICATED` · `422 · VALIDATION_FAILED` (limit out of range) · `500 · INTERNAL_ERROR` (items lookup failed) · `503 · SERVICE_UNAVAILABLE` (marketplace or items unreachable) |
| `withdraw-bid` (unchanged shape) | `DELETE /api/marketplace/listings/{listing_id}/bids/{bid_id}` | as FS-0YXG6 | none | `204`, no body | as FS-0YXG6; `400 · FAILED_PRECONDITION` no longer covers `OUTBID` |

`MyBid`:

| Field | Type | Notes |
|---|---|---|
| `bidId` | uuid | |
| `listingId` | uuid | |
| `amount` | int64 | gold bid |
| `status` | string | `PENDING` · `WINNING` · `OUTBID` · `WON` · `LOST` |
| `placedAt` | date-time | |
| `listing` | object | `status` string · `endsAt` date-time · `ended` bool · `currentPrice` int64, optional (absent when nobody leads) · `buyoutPrice` int64, optional |
| `item` | `ItemSummary`, optional | the same summary listings embed; absent only when items has no such instance |

## Out of Scope

- Place-bid returning `bid_id`: FS-0YXG6's `201` with no body stays (rejected in discussion: an id
  belongs to a read).
- Showing who leads on the listing detail.
- Withdrawn (`CANCELLED`) bids as history; collapsing several bids on one listing into one row.
- Withdrawing a listing (seller side).
- Notifications for outbid / won / sold; search and filter.
- Any migration: `idx_bids_member` serves the read.
