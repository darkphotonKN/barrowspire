# FS-8EGFA: Marketplace web page

> Status: work-order · SPECIFICATION.md:
> - `game-client/SPECIFICATION.md` "### Marketplace" → all four lines
> - `game-server/api-gateway/SPECIFICATION.md` "### Marketplace" → "Public listing browse and read"
> - `game-server/api-gateway/SPECIFICATION.md` "### Downstream routing" → "Typed wallet balance read"
> - `game-server/marketplace-service/SPECIFICATION.md` "### Surface" → "Browse active listings"
> - `game-server/items-service/SPECIFICATION.md` "## Inventory" → both lines
>
> → this FS
>
> **Related ADRs:**
> - [ADR-0001](../adr/0001-contract-layer.md) and [ADR-0002](../adr/0002-batch-retrofit-of-the-legacy-surface.md) §5: a touched endpoint is typed.
> - [ADR-0012](../adr/0012-cursors-are-opaque-sort-keys-carrying-no-identity.md): opaque cursors.
> - [ADR-0013](../adr/0013-client-styling-is-token-only-and-the-fence-must-be-watched-to-fail.md): token-only styling.
> - [ADR-0014](../adr/0014-account-id-claim-is-eventually-consistent-and-fails-closed.md): the wallet account appears eventually.
> - [ADR-0016](../adr/0016-settlement-starts-from-an-expiry-poller-one-workflow-per-listing.md): settlement is left untouched.
>
> **Related FS:**
> - [FS-0YXG6](0YXG6-marketplace-http-surface.md): the write surface this page drives.
> - [FS-22WKC](22WKC-uniform-error-contract.md): the error seam.
> - [FS-NTPW2](NTPW2-gateway-surface-serialized.md): the typed-operation pattern.
> - [FS-SWMNW](SWMNW-web-platform-fantasy-reskin.md): the theme.
> - [FS-NXP1W](NXP1W-auction-settlement-saga.md): settlement, deliberately not started here.

## Summary

The web platform gets a marketplace page at `/marketplace`. It sits in the browser, outside
the game canvas.

- **Anyone, signed in or not,** can browse the relics up for auction in a dense, sortable table.
  Each row shows the item, its rarity, the current price and the time left.
- **A signed-in delver** can also:
  - see their own relics, and which of them are already listed;
  - list one for auction;
  - bid on other delvers' listings;
  - filter the table down to their own listings.

The backend already takes listings and bids. This feature adds only the plain reads the page
needs to show them:
- browse listings;
- read one listing;
- item summaries and status;
- a typed gold balance.

Settlement stays unbuilt: auctions end, and nobody wins yet.

## Requirements

### Scope rule for the backend work

1. **Reads only.** The backend work in this FS is queries and wire types. It changes no domain
   aggregate, no FSM, no saga, and no write path:
   - `ListItem`, `PlaceBid` and `WithdrawBid` internals are not touched.
   - The wallet hold path is not touched.
   - Nothing in `settlement/` is touched.
2. **No settlement code or switch.** Nothing starts `SettleAuction` today. This FS adds no poller,
   no workflow start and no feature flag. An auction past `endsAt` stays `ACTIVE` in storage.
   The read surface reports it as ended (requirement 8).

### marketplace-service — reads

3. **Browse active listings.** A new RPC `BrowseListings(cursor, limit)`:
   - **Rows:** listings with status `ACTIVE` and `ends_at > now()`, from every seller.
   - **Order:** `ends_at ASC, id ASC`, so the soonest-ending come first.
   - **Paging:** keyset by an opaque cursor (ADR-0012). The default and maximum limit match
     `ListMyListings`: 50 and 100.
   - **Placement:** a plain query in the existing `internal/listing/query/` package, beside
     `list_my_listings_query.go`.
4. **Read one listing.** A new RPC `GetListing(listing_id)` returns the listing in any status.
   An unknown id is `NotFound`.
5. **Price facts on every listing read.** `BrowseListings`, `GetListing` and `ListMyListings`
   each carry three price facts per listing:
   - **`bid_count`:** the number of bids in status `WINNING`, `PENDING` or `OUTBID`.
   - **`current_price`:** the leading bid's amount (the highest `WINNING` or `PENDING` bid).
     Absent when there is no leading bid.
   - **`minimum_bid`:** the least amount marketplace would accept from a bid now.
     - With no leading bid it is `start_price`.
     - Otherwise it is `current_price + 1`.

   `minimum_bid` is computed by marketplace, the rule's owner. No other layer restates the
   increment rule.
6. **Public reads.** `BrowseListings` and `GetListing` are added to `publicMethods` in
   `common/auth/interceptor.go`, fully qualified, with a comment saying why. Unlike the wallet
   entries there, these are genuinely public: they reveal nothing that belongs to a member.
   `ListMyListings` stays authenticated.
7. **Proto changes are additive** in `common/api/proto/marketplace/marketplace.proto`:
   - two RPCs and their messages;
   - three fields on `Listing`.

   Generated Go is regenerated, never hand-edited.
8. **Ended is a read-side fact.** Each listing read carries `ended: bool`. It is true when
   `status = ACTIVE` and `ends_at <= now()`, computed at read time. Browse never returns one,
   by requirement 3. `GetListing` and `ListMyListings` do.

### items-service — reads

9. **Item summaries by id.** A new RPC `GetItemSummaries(ids[])` returns one summary per
   instance id found. Unknown ids are omitted, not an error. The limit is 100 ids.
   - **Fields:** id, name, description, item_type, rarity (the rarity **name** joined from
     `item_rarities`), weapon_type, armor_slot, and the stats `ItemInstance` already carries.
   - **Excluded:** the owner, the source and the prices.
10. **Public item summaries.** `GetItemSummaries` is added to `publicMethods`, with the same
    comment rule as requirement 6. A summary without the owner reveals nothing that belongs to
    a member.
11. **Status on owned instances.** `ItemInstance` gains `status`, one of `AVAILABLE`, `LISTED`
    or `IN_ESCROW`. It is read by the `ListItemInstances` query and carried to the wire.
    Additive: no existing field changes.

### api-gateway — typed operations

12. **Browse listings.** Public `GET /api/marketplace/listings`. The gateway:
    - calls `BrowseListings`;
    - calls `GetItemSummaries` once for the page's item ids;
    - embeds each summary as `item` on its listing.

    No `protect` middleware and no `Security`.
13. **Get one listing.** Public `GET /api/marketplace/listings/{listing_id}`. Same join, for one
    listing.
14. **My listings, enriched.** `list-my-listings` keeps its path, its auth and every existing
    field. It additively gains `item`, `currentPrice`, `minimumBid`, `bidCount` and `ended`,
    joined the same way. No field is removed or renamed.
15. **One listing shape.** Browse, get-one and my-listings all answer with the existing
    `Listing` wire type, extended as in requirement 14.
    - `sellerId` stays on the wire. The client needs it to recognise its own listings.
    - A missing summary leaves `item` absent rather than failing the page. This happens when
      items omits an unknown id.
16. **A join failure fails the request.** If marketplace answers but items is unreachable or
    errors, the operation fails through the seam as 503 or 500. It never returns rows without
    items as if nothing were wrong.
17. **Typed wallet balance.**
    - The gin `GET /api/wallet/account` is replaced by a typed operation at the same path:
      authenticated, `get-wallet-account`.
    - It answers `{gold, heldGold, availableGold}`. Every field is always present, with zeros
      included, so the omitempty loss is fixed.
    - The error mapping is carried over from `respondWithGRPCError`, rendered through the seam:
      - `NotFound` → 404, which `seed-dev.sh` relies on;
      - `Unauthenticated` → 401;
      - `Unavailable` → 503;
      - otherwise 500.
    - The other wallet routes (create, deposit, withdraw) stay on gin, untouched.
18. **Instances wire gains status.** `list-item-instances` items gain `status`, in snake_case
    like their siblings. Additive.
19. **Contract regenerated.** Every operation above is a typed Huma handler. The change is
    followed by `make openapi && make client`, and the handler, `openapi.yaml` and
    `game-client/src/api/generated/` are committed together.

### game-client — the page

20. **Route and nav.**
    - A new `'use client'` route `/marketplace`, with the heading "The Bazaar" (h1, the display
      face at 28px or more).
    - A "Bazaar" link in `Header.tsx`, marked active on the page.
    - The page never loads Phaser.
21. **Public browse.** The listing table loads through `publicClient` whether or not the visitor
    is signed in.
22. **Table.**
    - One row per listing, with these columns:
      - **Item:** the icon, the name, and a rarity badge with its text label.
      - **Type or slot.**
      - **Current price:** the `⟡` gold glyph with `currentPrice`, or `startPrice` marked
        "opening" when there are no bids.
      - **Bids:** the bid count.
      - **Time left:** a relative countdown that re-renders each minute, or each second in the
        last minute.
      - **Action.**
    - Rows sort by price, time left or rarity. The default is time left, ascending.
    - Filter chips for rarity (five tiers) and item type.
    - Sorting and filtering apply to the rows loaded so far. A "Show more" control fetches the
      next cursor page.
23. **All / Mine toggle.**
    - Visible only when signed in.
    - **All** is the browse endpoint. **Mine** is `list-my-listings` and shows every status.
    - Status labels:
      - `ended` → "Ended — awaiting settlement";
      - `PENDING_SETTLEMENT` → "Settling";
      - `SOLD` → "Sold";
      - `CANCELLED` → "Withdrawn".
24. **Listing detail.** Activating a row opens a detail dialog showing:
    - the item's full stats;
    - the description;
    - the start price, the current price, the minimum bid and the bid count;
    - the end time, both absolute and relative;
    - the bid box (requirement 26).

    The dialog traps focus, Esc and the close control dismiss it, and focus returns to the row.
    It refetches the listing through get-one when it opens.
25. **List a relic.**
    - A "List a relic" primary action is visible only when signed in. It opens a drawer showing
      the delver's instances from `list-item-instances`.
    - `AVAILABLE` items can be chosen. `LISTED` and `IN_ESCROW` items are shown disabled, with
      a "Listed" or "In escrow" tag.
    - The delver sets a start price (a whole number, 1 or more) and chooses a duration: 1 hour,
      12 hours, 24 hours or 3 days. The client computes `endsAt` from now.
    - On submit it calls `create-listing`. On 202 it shows "Posted — your listing will appear in
      a moment." It then switches the table to **Mine** and refetches every 1.5 seconds, up to
      8 times, until a listing with that `itemId` is `ACTIVE`.
    - If the listing never appears, it says "Still processing — refresh in a minute" and stops.
      The instances are refetched so the item now shows as Listed.
26. **Bid.**
    - The bid box pre-fills and enforces a floor of `minimumBid`. It shows the delver's
      `availableGold` from `get-wallet-account` beside it.
    - Submit is disabled when the amount is below `minimumBid` or above `availableGold`. The
      server remains the authority.
    - Each submit mints one `Idempotency-Key` UUID and reuses it on a retry of the same bid.
    - On 201 the client refetches the listing and the wallet, and shows "Your bid of ⟡N leads."
      The 201 body is empty and is not read.
27. **Own listings have no Bid.** Where `sellerId` equals the signed-in member's id, the action
    cell reads "Your listing" and the bid box is not rendered. Only the UI enforces this; the
    backend allows self-bids and that is out of scope.
28. **Signed-out prompts.** Signed out, the action cell and the bid box read "Sign in to bid",
    and "List a relic" is replaced by "Sign in to list". Each links to `/login`, then back to
    `/marketplace`.
29. **Error copy is plain.** Money clarity overrides lore, per the game-client CONTEXT.md voice
    rules. Each response code maps to one message:
    - **400 `VALIDATION_FAILED` on a bid:** "Someone bid higher — the minimum is now ⟡N." The
      page refetches first to learn N.
    - **400 `FAILED_PRECONDITION` on a bid:** "Not enough gold" when `availableGold < amount`,
      otherwise "This auction has ended."
    - **409 `CONFLICT`:** "Someone bid at the same moment — try again."
    - **500 on create-listing:** "That relic can't be listed right now — it may already be
      listed." This covers the item-side refusal.
    - **401:** the existing global handler logs out and redirects.
    - **503:** "The Bazaar is unreachable — try again shortly."
30. **Theme conformance.**
    - Tokens only, with no raw hex. `lint:fence` and `check-css-tokens` pass.
    - One torch per view: amber only on the "List a relic" or Bid primary CTA, the h1, and the
      focal price in the detail dialog.
    - Rarity colour only on the badge, the row's accent edge and a faint hover glow, and always
      beside the text label.
    - No emoji. Heroicons only.
    - Skeleton rows with a brass shimmer while loading. Motion is dropped under
      `prefers-reduced-motion`.
    - Targets are 40px or larger, with visible focus rings. The table is keyboard-navigable.
31. **Rarity mapping.**
    - A shared `RarityBadge` component is extracted from `src/app/page.tsx`. It covers all five
      server tiers, mapped by name to the existing tokens:
      - normal → common
      - uncommon → uncommon
      - rare → rare
      - runed → epic
      - fabled → legendary
    - An unknown name renders as common with the raw name as its label.
    - The landing page uses the shared component.
32. **Item icons in the DOM.**
    - The item-to-icon mapping in `src/ui/ContainerView.ts` (`ITEM_ICONS`, `WEAPON_ICONS`,
      `ARMOR_ICONS` and the resolver) is moved to a Phaser-free module that both the canvas and
      the page import. The canvas behaviour is unchanged.
    - The page renders the icon by cropping `public/art/icons-0.png` at the frame given in
      `public/art/manifest.json`.
33. **Guideline amendment.** Before the table ships, `game-client/docs/design-guideline.md`
    Part II's marketplace section is amended. It must state that the listing browser is a
    table, with rows, columns, sort, chips and an accent edge. The card grid is kept for the
    List-a-relic item picker.
34. **Client plumbing.**
    - New calls are `apiClient` or `publicClient` methods in `src/utils/api.ts`, which is the
      only place raw fetch is allowed.
    - Pages use `useEffect` with local state, per the existing pattern. No data-fetching library
      is added.
    - The decision logic lives in pure modules with Vitest tests:
      - minimum and disable rules for the bid box;
      - time-left formatting;
      - status labels;
      - rarity mapping;
      - sort and filter;
      - the posted-listing poll.

## User Stories

1. As a visitor who is not signed in, I want to open the Bazaar from the header, so that I can see what is for sale without an account.
2. As a visitor, I want each listing's item name, icon and rarity in the row, so that I can scan for relics worth having.
3. As a visitor, I want to see the current price (or the opening price when nobody has bid), so that I know what a relic is going for.
4. As a visitor, I want to see how long each auction has left, so that I can tell which ones are about to close.
5. As a visitor, I want the soonest-ending auctions first by default, so that urgent ones are on top.
6. As a visitor, I want to sort by price, time left or rarity, so that I can find what I am after.
7. As a visitor, I want to filter by rarity and item type, so that I can narrow a long table.
8. As a visitor, I want to load more listings when there are many, so that I am not limited to the first page.
9. As a visitor, I want to open a listing and see the relic's full stats and description, so that I can judge it before bidding.
10. As a visitor, I want "Sign in to bid" where the bid control would be, so that I know how to take part.
11. As a delver, I want the minimum acceptable bid pre-filled, so that I never have to work out the increment.
12. As a delver, I want to see my available gold next to the bid box, so that I don't bid gold I can't spend.
13. As a delver, I want the Bid button disabled when my amount is too low or more than I have, so that I don't send a bid that will fail.
14. As a delver, I want confirmation that my bid leads, with the listing's price updated, so that I know it landed.
15. As a delver, I want a clear message when someone outbid me before my bid arrived, including the new minimum, so that I can bid again at once.
16. As a delver, I want a double-click or a retry not to place two bids, so that I am never charged twice.
17. As a delver, I want a clear message when an auction has ended or I lack gold, so that I understand why a bid was refused.
18. As a delver, I want my own listings marked "Your listing" with no Bid control, so that I don't bid against myself by accident.
19. As a delver, I want to see all my relics and which are already listed, so that I know what I can put up.
20. As a delver, I want to list a relic with a start price and a duration from a short set of choices, so that listing takes seconds.
21. As a delver, I want confirmation that my listing was posted and to see it appear under Mine, so that I know it is live even though it takes a moment.
22. As a delver, I want a listed relic to show as Listed in my picker afterwards, so that I don't try to list it twice.
23. As a delver, I want to switch the table to Mine, so that I can follow my own auctions.
24. As a delver, I want my auctions that have passed their end time labelled "Ended — awaiting settlement", so that I don't mistake them for live ones or think they vanished.
25. As a delver, I want the time left to count down while I watch, so that the table stays truthful without a reload.
26. As a keyboard or screen-reader user, I want to move through the table, open a listing and close the dialog with the keyboard, so that the Bazaar is usable without a mouse.
27. As a user who prefers reduced motion, I want the shimmer and transitions to stop, so that the page is comfortable to use.
28. As a player in the game, I want the Bazaar reachable from the web platform nav, so that I can trade between delves without the game open.
29. As a client developer, I want the listing, summary and wallet shapes in the generated client, so that the page is built against the real contract and not hand-written types.
30. As the Bazaar page (an actor), I want one read that returns listings with their item already joined, so that a page renders in two requests, not one per row.
31. As a future settlement author, I want this feature to leave the listing lifecycle and saga untouched, so that settlement can be built later without undoing anything here.

## Acceptance Criteria

**Backend**
- [ ] `GET /api/marketplace/listings` answers 200 without an `Authorization` header. It returns only `ACTIVE` listings whose `endsAt` is in the future, ordered by `endsAt` ascending, each with `item` embedded.
- [ ] Paging with `nextCursor` visits every browsable listing exactly once. A malformed cursor answers `400 · VALIDATION_FAILED`, as `list-my-listings` does today.
- [ ] `GET /api/marketplace/listings/{id}` answers 200 without auth for a listing in any status, and `404 · NOT_FOUND` for an unknown id.
- [ ] For a listing with no bids: `currentPrice` is absent, `minimumBid = startPrice` and `bidCount = 0`.
- [ ] After one bid of N: `currentPrice = N`, `minimumBid = N + 1` and `bidCount = 1`.
- [ ] After a higher bid M: `currentPrice = M` and `bidCount = 2`.
- [ ] After the leader withdraws, with the outbid bid remaining: `currentPrice` is absent and `minimumBid = startPrice`. This mirrors the backend's no-promotion rule (FS-0YXG6).
- [ ] A listing that is `ACTIVE` and past `endsAt` is absent from browse. It appears in `/listings/mine` and get-one with `ended: true`.
- [ ] `/listings/mine` still answers every field it did before. The new fields are additive, and it still answers 401 without a token.
- [ ] `list-item-instances` returns `status` for every instance. A listed seed item shows `LISTED`.
- [ ] `GET /api/wallet/account` answers `{gold, heldGold, availableGold}`, with zeros present.
  - 404 when the account doesn't exist yet.
  - 401 without a token.
  - `seed-dev.sh` still runs green against it.
- [ ] `BrowseListings`, `GetListing` and `GetItemSummaries` answer without a token. Every other marketplace and items RPC still answers `Unauthenticated` without one; a per-method test proves this, in the style of the wallet exemption test.
- [ ] No file under `marketplace-service/internal/settlement/`, no domain aggregate and no write use case appears in the diff.
- [ ] `make openapi && make client` leaves no diff after commit. The contract breaking-change gate passes, since the changes are additive.

**Client**
- [ ] `/marketplace` renders the table signed out, and the header shows the Bazaar link as active.
- [ ] Signed in as `aldric@barrowspire.dev`, listing the Longsword for ⟡50 over 1h:
  - shows "Posted";
  - the listing appears under Mine within the poll window;
  - the Longsword shows Listed in the picker.
- [ ] Signed in as `brenna@`, the Longsword listing:
  - shows opening price ⟡50;
  - the bid box pre-fills 50;
  - bidding 50 leads, the price shows ⟡50 and Brenna's available gold drops by 50.
- [ ] Signed in as `corwin@`, the same listing pre-fills 51. Bidding 51 leads.
- [ ] Signed in as `aldric@`, their own listing shows "Your listing" and no bid box.
- [ ] A stale page submitting below the new minimum shows the "Someone bid higher — the minimum is now ⟡N" message with the correct N.
- [ ] Rapid double submit produces one bid: both requests carry the same Idempotency-Key.
- [ ] Rarity and type chips and all three sorts work over the loaded rows. Each of the five tiers shows its own token colour and text label.
- [ ] The dialog traps focus, Esc closes it and focus returns to the row.
- [ ] The table is fully usable with the keyboard alone.
- [ ] `npm run lint`, `npm run lint:fence`, `scripts-check-css-tokens.sh` and `npm test` pass. The pure modules in requirement 34 have tests.
- [ ] The Phaser canvas still shows the same item icons after the icon mapping moves.
- [ ] design-guideline.md Part II describes the listing table (requirement 33).

## Edge States

- **Empty browse:** the table area shows "The coffers are bare — no relics are up for auction."
  Signed in, there is also a "List a relic" action.
- **Empty Mine:** "You have nothing listed." with "List a relic".
- **No listable items:** the picker says every relic is already listed (or you have none).
  Submit is disabled.
- **Wallet account not yet created** (404, the ADR-0014 window just after signup): the bid box
  shows "Your purse isn't ready yet — try again shortly." Bid is disabled. Browse is unaffected.
- **Auction ends while the dialog is open:** when the countdown reaches zero, the bid box
  disables and reads "This auction has ended". A bid that is already in flight gets its server
  answer through requirement 29.
- **Auction ends while in the table:** the row stays until the next fetch. Its time left reads
  "Ended" and its Bid action disables. Browse drops it on refetch.
- **Outbid while viewing:** there is no push channel. The price shown is as of the last fetch. A
  bid below the new minimum is refused, and the page refetches and says so. Nothing is
  real-time.
- **Concurrent bid lost to contention (409):** a retry message is shown, and the same key is
  reused if the delver retries unchanged.
- **Listing posted but never appears** (item refused asynchronously, consumer down): the poll
  gives up with "Still processing — refresh in a minute". The reservation reconciler frees the
  item within about 10 minutes (existing behaviour), and the picker shows it AVAILABLE again.
- **Item summary missing for a listing:** the row renders "Unknown relic" with the generic icon,
  and is still biddable.
- **Items down, marketplace up:** browse fails as a whole (requirement 16). The page shows the
  503 message with a retry, never half-rendered rows.
- **Token expires mid-session:** the existing global 401 handler logs out. Browse keeps working
  on `publicClient` after logout.
- **Signed-in viewer on their own listing in All:** "Your listing". The same holds in the
  dialog.
- **Clock skew:** the client computes `endsAt` from local time for the duration presets. The
  server refuses a past `endsAt` (400, shown as "That end time has already passed — check your
  clock"). Time left is computed from the server `endsAt`.
- **Very large gold values:** prices are int64 on the wire. The client formats them with digit
  grouping and never uses floating-point arithmetic for the minimum.
- **Gold locked by outbid holds** (a known backend limit, parked): `availableGold` honestly
  shows less. The page doesn't explain holds beyond "available".

## API surface

**Conventions:**
- Typed Huma operations under the `marketplace`, `items` and `wallet` tags.
- Marketplace wire is camelCase. The `list-item-instances` wire stays snake_case.
- Errors are problem+json through the FS-22WKC seam, as `status · code`.
- Cursor paging works the same as `list-my-listings`: an opaque `cursor`, `limit` 1..100 with a
  default of 50, and a `nextCursor` that is absent on the last page.

| Op | Method + Path | Query/Params | Request body | Response | Errors |
|----|---------------|--------------|--------------|----------|--------|
| `browse-listings` **(new, public)** | GET `/api/marketplace/listings` | `cursor?`, `limit?` (1..100, default 50) | — | 200 `ListingPage` (`listings: Listing[]`, `nextCursor?`) | `400 · VALIDATION_FAILED` (malformed cursor, as `list-my-listings`); `422 · VALIDATION_FAILED` (limit out of range); `500 · INTERNAL_ERROR`; `503 · SERVICE_UNAVAILABLE` |
| `get-listing` **(new, public)** | GET `/api/marketplace/listings/{listing_id}` | `listing_id` uuid | — | 200 `Listing` | `404 · NOT_FOUND`; `422 · VALIDATION_FAILED` (non-uuid id); `500 · INTERNAL_ERROR`; `503 · SERVICE_UNAVAILABLE` |
| `list-my-listings` **(changed, additive)** | GET `/api/marketplace/listings/mine` | unchanged | — | 200 `ListingPage` with the extended `Listing` | unchanged, plus `503 · SERVICE_UNAVAILABLE` when items is down |
| `get-wallet-account` **(re-typed; was gin)** | GET `/api/wallet/account` | — | — | 200 `WalletAccount` | `401 · UNAUTHENTICATED`; `404 · NOT_FOUND` (account not yet created); `500 · INTERNAL_ERROR`; `503 · SERVICE_UNAVAILABLE` |
| `list-item-instances` **(changed, additive)** | GET `/api/items/instances` | unchanged | — | unchanged envelope; each `ItemInstance` gains `status` | unchanged |

**`Listing` (extended; the existing fields are unchanged):**

| Field | Type | Notes |
|---|---|---|
| `id`, `itemId`, `sellerId` | uuid | existing |
| `buyerId?`, `soldPrice?` | uuid, int64 | existing; present once sold |
| `startPrice` | int64 | existing |
| `status` | string | existing: `ACTIVE`, `PENDING_SETTLEMENT`, `SOLD`, `CANCELLED`, `EXPIRED` |
| `endsAt`, `createdAt`, `updatedAt` | date-time | existing |
| `currentPrice?` | int64 | **new.** The leading bid's amount; absent with no leading bid |
| `minimumBid` | int64 ≥ 1 | **new.** The least amount a bid would be accepted at now |
| `bidCount` | int32 ≥ 0 | **new.** Bids in `WINNING`, `PENDING` or `OUTBID` |
| `ended` | bool | **new.** `ACTIVE` and past `endsAt` |
| `item?` | `ItemSummary` | **new.** Absent only if items has no such instance |

**`ItemSummary` (new):**

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | the instance id (`= Listing.itemId`) |
| `name` | string | |
| `description?` | string | |
| `itemType` | string | e.g. `weapon`, `armor`, `consumable` |
| `rarity` | string | the rarity name: `normal`, `uncommon`, `rare`, `runed` or `fabled` |
| `weaponType?`, `armorSlot?` | string | drive the icon |
| `attackPower?`, `criticalRate?`, `defenseRating?`, `magicResistance?`, `healingAmount?`, `manaAmount?`, `buffDuration?` | number | present when non-zero for the item type |

No owner, source or price field.

**`WalletAccount` (new wire type for an existing route):**

| Field | Type | Notes |
|---|---|---|
| `gold` | int64 | total; always present |
| `heldGold` | int64 | the sum of reserved holds; always present |
| `availableGold` | int64 | spendable; always present |

No account id, member id or timestamps.

**`ItemInstance.status` (added):** `AVAILABLE`, `LISTED` or `IN_ESCROW`.

**RPCs (internal, gRPC; additive proto):**
- `marketplace.BrowseListings(cursor, limit) → (listings, pagination)`: public.
- `marketplace.GetListing(listing_id) → listing`: public. `NotFound` for an unknown id.
- `marketplace.Listing` gains `current_price` (optional), `minimum_bid`, `bid_count` and `ended`.
- `items.GetItemSummaries(ids[] ≤ 100) → summaries[]`: public. Unknown ids are omitted.
- `items.ItemInstance` gains `status`.

**Unchanged and driven by the page:**
- `create-listing` (202, empty).
- `place-bid` (201, empty; `Idempotency-Key` header).

Both work as specified in FS-0YXG6.

## Out of Scope

- **Settlement**, including:
  - the expiry poller;
  - starting `SettleAuction`;
  - winning, item transfer, and paying the seller;
  - any flag to turn settlement on or off.

  Auctions end and stay unsettled (FS-NXP1W, ADR-0016).
- **The place-bid response body** (`bid_id`, status, current price). Left for the human lane.
- **The withdraw-bid UI**, and a "my bids" or "am I winning" read.
- **Cancelling a listing:** the use case exists but is unwired, and it doesn't release the item.
- **Buyout and accept-bid.**
- **Releasing outbid holds, and a wallet hold sweeper.** Available gold drains as bids are
  placed; this is known and accepted.
- **Preventing self-bids server-side.** Only the UI hides the control.
- **Server-side filtering or sorting** of browse by rarity, type or price. Filtering and sorting
  are client-side over loaded pages.
- **Real-time price updates** (WebSocket or push) and the in-game marketplace (the Phaser canvas
  or the hub).
- **Seller display names** on listings.
- **A token refresh route.**
- **Typing the other wallet routes** (create, deposit, withdraw).
- **Denormalizing item data into marketplace storage.**
- **Marking FS-SWMNW shipped.**
