# FS-9XKS6: Listing buyout price

> Status: work-order · SPECIFICATION.md: `game-server/marketplace-service/SPECIFICATION.md` "### Listings & bids" → "Listing buyout price"; `game-server/api-gateway/SPECIFICATION.md` "### Marketplace" → "Buyout price on listings" → this FS · Related: [FS-NXP1W](NXP1W-auction-settlement-saga.md) Req 4 (the Buyout trigger that consumes this price) · Related ADRs: none new

> Terms follow `game-server/marketplace-service/CONTEXT.md`. Decisions were made by the agent
> under the user's standing instruction to decide without asking; none were challenged
> (challenge-me not run). Marked "(not challenged)" below where the cost of being wrong is a
> migration or a public contract.

## Summary

A seller can set an optional **buyout price** when listing an item. A listing that has one can
later be bought out at that price (the Buyout trigger itself is FS-NXP1W / I-NXP1W-3, not this
FS). This FS adds the term only: stored, validated, carried from ListItem to the listing's
birth, exposed on reads, and respected by bidding.

Nothing here is rebuilt. The price rides the exact path `start_price` already rides:
`ListItem` → `ReserveItemUC` (draft validation) → items `ReserveItem` → `ItemReservedEvent` →
`CreateListingUC` → `NewListing`.

## Decisions (folded scoping notes)

1. **Nullable column, opt-in.** `listings.buyout_price BIGINT NULL`. NULL means "no buyout".
   Existing rows stay NULL, so the migration is additive and needs no backfill. *(not challenged)*
2. **`start_price` stays required.** Every listing is still an auction; a buyout price makes it a
   hybrid. Fixed-price-only listings (buyout without start price) are **out of scope**: they
   would make `start_price` nullable and change bid-floor, `minimum_bid` and browse-sort logic.
   Rejected for now as a rebuild, not an addition.
3. **`buyout_price > start_price`, strictly.** A buyout equal to the opening bid is just a bid.
   Enforced in the domain (`ErrInvalidBuyoutPrice`) and backstopped by a DB CHECK. *(not challenged)*
4. **Immutable after birth.** No edit flow exists for any listing term; none is added.
5. **Bids are capped below the buyout price.** On a listing with a buyout price, a `BID` whose
   amount is `>= buyout_price` is refused (`ErrBidAtOrAboveBuyout`). Paying that much is what
   Buyout is for. Rejected alternative: silently converting such a bid into a buyout (hidden
   control flow, and it would make PlaceBid start settlement). *(not challenged)*
6. **The buyout stays available while the listing is ACTIVE**, whatever the bids are (MMO
   auction-house behaviour). Because of Decision 5 the leading bid is always below it.
   Rejected: hiding the buyout once bidding starts (eBay style). That is a client/product
   choice that can be layered on later without a schema change.
7. **Carriage through items-service stays a pass-through.** items-service forwards
   `buyout_price` from `ReserveItemRequest` onto `ItemReservedEvent` without validating or
   storing it, exactly as it already does for `start_price`. Rejected: marketplace keeping
   pending terms locally keyed by listing_id. That redesigns listing creation, which this FS
   does not do.
8. **proto3 `optional int64`** on every message that carries it, so "unset" is distinct from 0.
   An in-flight `ItemReservedEvent` published before the deploy has no field and births a
   listing with no buyout. That is correct, not a fault.
9. **Validation happens once, before the item is locked.** `ReserveItemUC` already runs
   `NewListing` as a draft. Adding the price to `NewListing` means an invalid buyout is refused
   before items reserves anything. The gateway checks shape only (`minimum:1`).

## Requirements

### Schema

1. Migration `000006` adds `listings.buyout_price BIGINT NULL` with
   `CHECK (buyout_price IS NULL OR buyout_price > start_price)`. The down migration drops it.

### Domain

2. `Listing` carries an optional buyout price. `NewListing` takes it (nil = none). Non-nil
   must be greater than `startPrice`, otherwise `ErrInvalidBuyoutPrice`.
3. `ListingSnapshot` exposes `BuyoutPrice *int`. Rehydration (`ReconstituteParams`) carries it.
4. `PlaceBidWithID` (and therefore `PlaceBid`) refuses a `BID` with `amount >= buyoutPrice` on
   a listing that has one, with `ErrBidAtOrAboveBuyout`. Listings without a buyout price are
   unchanged. This check is in addition to the existing too-low checks, not instead of them.

### Carriage (ListItem → listing birth)

5. `ListItemRequest` gains `optional int64 buyout_price`. The handler passes it into
   `ReserveItemCommand`, which validates it through the `NewListing` draft and forwards it to
   the `ItemReserver` port.
6. items `ReserveItemRequest` and `ItemReservedEvent` gain `optional int64 buyout_price`.
   items-service copies the request value onto the event unchanged.
7. The `ItemReserved` consumer passes it into `CreateListingCommand` → `NewListing`.
   `ErrInvalidBuyoutPrice` is classified with `ErrInvalidStartPrice` (non-retryable).

### Persistence and reads

8. The repository writes `buyout_price` on insert and reads it on every load of the aggregate.
9. The marketplace `Listing` proto message gains `optional int64 buyout_price`. GetListing,
   BrowseListings and ListMyListings populate it.

### Errors

10. `ErrInvalidBuyoutPrice` maps to gRPC `InvalidArgument`. `ErrBidAtOrAboveBuyout` maps to
    gRPC `InvalidArgument`, alongside `ErrBidTooLow`. Both refuse an amount against the listing's
    price terms.

## API surface

Endpoint-level shorthand: the established marketplace pattern, additive fields only.

| Operation | Change |
|---|---|
| `POST /api/marketplace/listings` (create-listing) | request body gains optional `buyoutPrice` (int64, `minimum: 1`) |
| `GET /api/marketplace/listings` (browse-listings) | each `Listing` gains optional `buyoutPrice` (int64), absent when the listing has none |
| `GET /api/marketplace/listings/{listing_id}` (get-listing) | same `Listing.buyoutPrice` |
| `GET /api/marketplace/listings/mine` (list-my-listings) | same `Listing.buyoutPrice` |
| `POST /api/marketplace/listings/{listing_id}/bids` (place-bid) | no shape change; new refusal below |

| Case | Response |
|---|---|
| `buyoutPrice` < 1 | `422 · VALIDATION_FAILED` (shape, gateway) |
| `buyoutPrice` ≤ `startPrice` | `400 · VALIDATION_FAILED` (domain, marketplace `InvalidArgument`) |
| bid `amount` ≥ the listing's `buyoutPrice` | `400 · VALIDATION_FAILED` (domain, marketplace `InvalidArgument`, same as a bid too low) |

## User Stories

1. As a seller, I want to set a buyout price when I list an item, so that a buyer can end the auction at a price I'm happy with.
2. As a seller, I want a buyout price at or below my start price refused, so that I can't list a contradictory sale.
3. As a buyer, I want to see a listing's buyout price when I browse or open it, so that I know whether I can buy it now and for how much.
4. As a bidder, I want a bid at or above the buyout price refused, so that I'm steered to buying out rather than bidding more than the buyout costs.
5. As a seller listing without a buyout price, I want nothing to change, so that a plain auction behaves exactly as before.

## Acceptance Criteria

- [ ] Migration 000006 up adds the nullable column with its CHECK; down removes it; existing rows read back with no buyout price.
- [ ] `NewListing` with nil buyout succeeds; with buyout `> startPrice` succeeds; with buyout `<= startPrice` returns `ErrInvalidBuyoutPrice`.
- [ ] A listing round-trips its buyout price (set and nil) through repository insert and load.
- [ ] ListItem with an invalid buyout price is refused before items-service's `ReserveItem` is called.
- [ ] A valid buyout price on ListItem reaches the born listing via ReserveItem → ItemReservedEvent → CreateListing.
- [ ] An `ItemReservedEvent` with no buyout field births a listing with no buyout price.
- [ ] On a listing with a buyout price, a bid `>= buyoutPrice` returns `ErrBidAtOrAboveBuyout` and creates no bid; a bid below it follows the existing rules.
- [ ] On a listing without a buyout price, bidding behaviour is unchanged.
- [ ] GetListing, BrowseListings and ListMyListings return `buyout_price` when set and omit it when not; the gateway `Listing` mirrors it as `buyoutPrice`.
- [ ] The gateway create-listing body accepts `buyoutPrice`; `openapi.yaml` and the generated client are regenerated, and oasdiff reports the change as non-breaking.
- [ ] `make test` green in every touched service.

## Edge States

- **Event published before deploy, consumed after:** no field → listing born without buyout. Correct.
- **Rollout order:** any hop still on an old binary ignores the unknown field, and the listing is born without a buyout, so the seller's buyout is silently dropped. Deploy items-service and marketplace before the gateway exposes `buyoutPrice`. That closes the window, since nothing sends the field until the gateway does.
- **Bid lands exactly at `buyout_price`:** refused (`>=`); the bidder must use Buyout.
- **Leading bid is just below `buyout_price`:** the next valid bid has no room left (it must exceed the leader and be below the buyout). Every bid is then refused as too low or at-or-above buyout, which is correct: only Buyout can win from here.
- **`start_price` change in the future:** not possible (Decision 4), so the CHECK can't be violated by a later write.

## Out of Scope

- The Buyout action itself (RPC, use case, settlement trigger): FS-NXP1W Req 4, issue I-NXP1W-3.
- Fixed-price-only listings (buyout without a start price).
- Editing a listing's buyout price.
- Browse filtering or sorting by buyout price, and any index for it.
- game-client UI for entering or showing the buyout price (the generated client is regenerated; no component work).
- Reconciling `docs/schema/listings.md`'s "planned" target design (`starting_bid`, `expires_at`, `idempotency_key`) with the real table.
