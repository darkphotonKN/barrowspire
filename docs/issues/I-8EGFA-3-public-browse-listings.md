---
id: I-8EGFA-3
status: open
implements: FS-8EGFA
blocked_by: []
labels: [ready-for-agent]
title: "FS-8EGFA slice 3: public browse of active listings"
---
Implements FS-8EGFA §Requirements 1–3, 5–10, 12, 15, 16, 19, §API surface

## What to Build

A visitor who isn't signed in can page through every live auction, with each listing's item
already joined in.

### marketplace-service

Add a `BrowseListings(cursor, limit)` RPC, backed by a plain query in `internal/listing/query/`
beside `list_my_listings_query.go`.

- **Filter:** `status = 'ACTIVE' AND ends_at > now()`.
- **Order:** `ends_at ASC, id ASC`.
- **Paging:** keyset paging with an opaque cursor (ADR-0012). The limit defaults to 50, with a
  maximum of 100.
- **Cursor shape:** the existing `common/utils/cursor.Cursor` is `{ID, CreatedAt}`, but the
  browse sort key is `ends_at`. Extend it or add a cursor shape. Don't store `ends_at` in a field
  named `CreatedAt`.
- **Price facts (req 5), on each listing:**
  - `bid_count`: bids in WINNING, PENDING or OUTBID.
  - `current_price` (optional): the highest WINNING or PENDING amount.
  - `minimum_bid`: `start_price` when there is no leading bid, otherwise `current_price + 1`.
- **`ended` (req 8)**, on each listing.

Build the price facts as a reusable piece, because slices 4 and 5 use them too.

### items-service

Add `GetItemSummaries(ids[] ≤ 100)`.

- **Returns:** id, name, description, item_type, the rarity **name** (joined from
  `item_rarities`), weapon_type, armor_slot, and the stats.
- **Leaves out:** owner, source and prices.
- **Unknown ids** are omitted from the result.

### common/auth

- Add `/marketplace.MarketplaceService/BrowseListings` and `/items.ItemsService/GetItemSummaries`
  to `publicMethods`.
- Add a comment saying why these two are genuinely public, unlike the wallet entries.
- Add a pair of tests in the style of b7c2133. These two methods pass with no metadata, and every
  other marketplace and items method still answers `Unauthenticated`.

### api-gateway

Add a typed public `browse-listings` op at `GET /api/marketplace/listings`, with no `protect`
and no `Security`.

- Call `BrowseListings`, then call `GetItemSummaries` once for the page's ids.
- Embed each summary as `item` on the extended `Listing` wire type. The type gains
  `currentPrice?`, `minimumBid`, `bidCount`, `ended` and `item?`.
- If items fails, the whole request fails (req 16). Never return rows without their items.
- Add `GetItemSummaries` to the gateway's items client interface, and `BrowseListings` to
  `ListingClient`.

### Proto

Proto changes are additive. Regenerate the proto Go, then run `make openapi && make client`.

### Out of bounds (req 1–2)

No changes to domain aggregates, FSMs, write use cases or files under `settlement/`.

## Acceptance Criteria

- [ ] `GET /api/marketplace/listings` answers 200 with no `Authorization` header.
- [ ] It returns only ACTIVE listings whose `endsAt` is in the future, ordered by `endsAt` ascending, each with `item` embedded.
- [ ] Paging with `nextCursor` visits every browsable listing exactly once.
  - A malformed cursor answers `400 · VALIDATION_FAILED`.
  - A limit out of range answers `422`.
- [ ] The price facts come out right in each bid scenario:

  | Scenario | `currentPrice` | `minimumBid` | `bidCount` |
  |---|---|---|---|
  | No bids | absent | `startPrice` | 0 |
  | One bid of N | N | N+1 | 1 |
  | A higher bid of M after that | M | M+1 | 2 |
  | Leader withdrawn, an OUTBID bid left | absent | `startPrice` | — |

- [ ] A listing whose item summary is missing comes back without `item`, not as an error.
- [ ] If items is unreachable the op answers `503 · SERVICE_UNAVAILABLE`, not a partial page.
- [ ] The public-method test pair passes. `PlaceBid`, `ListItem`, `ListMyListings`, `ReserveItem` and the rest still require a token.
- [ ] The diff touches no file under `marketplace-service/internal/settlement/`, no domain aggregate and no write use case.
- [ ] Contract gates and the client regen-diff pass. Tests pass.

## Blocked By

None

## Spec Reference

FS-8EGFA §Requirements 1–3, 5–10, 12, 15, 16, 19; §API surface (`browse-listings`, `Listing`, `ItemSummary`, RPCs); stories 1–8, 30, 31.

## TDD Approach

- **RED:** a query test against seeded listings and bids, asserting the order, the ended filter,
  and the four price-fact scenarios above.
- **GREEN:**
  1. The SQL (a lateral join or subquery for the leading bid, plus the count) and the keyset
     cursor.
  2. The items summaries query.
  3. The gateway join, tested with fake clients, including the case where items is down.
