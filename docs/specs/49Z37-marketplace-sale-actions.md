# FS-49Z37: Marketplace sale actions

> Status: draft · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Marketplace" → "Buy out a listing", "Accept the leading bid on my listing", "Set a buyout price when listing", "Bids stay below a listing's buyout price", "A refused bid retries under a fresh key" → this FS · Related ADRs: [ADR-0026](../adr/0026-buyout-replay-is-recognised-by-a-caller-key-and-the-buyers-own-bid.md), [ADR-0027](../adr/0027-place-bid-id-is-derived-from-the-callers-key.md), [ADR-0009](../adr/0009-idempotency-belongs-to-the-caller.md) · Related FS: [FS-8EGFA](8EGFA-marketplace-web-page.md) (the page this extends), [FS-NXP1W](NXP1W-auction-settlement-saga.md) (buyout / accept-bid endpoints, settlement), [FS-9XKS6](9XKS6-listing-buyout-price.md) (buyout price on listings)

## Scoping notes (raw)

Scoped 2026-10-20 with the user (scope-it), right after the backend for buyout (I-NXP1W-17/18/19),
place-bid key-derived IDs (I-0YXG6-6) and buyout write retry (I-NXP1W-20) merged to local main.
Client lane, spec-first. Every option below was the one recommended, and the user accepted each;
none was argued against. The pre-lock gate judged the cost of being wrong low (UI over a settled
backend contract), so challenge-me was not offered.

### What exists (FS-8EGFA)

- Browse, listing detail, bid (bid box, key handling in `marketplace/bid.ts` + `bidFlow.ts`),
  list an owned item (`listRelic*`), my listings.
- Detail's action area is chosen by `bidPanel(listing, memberId)`: `signIn` | `own` ("Your
  listing") | `bid`.
- Status label `ENDED_AWAITING_SETTLEMENT` = "Ended — awaiting settlement" (`listingStatus.ts`).
- No buyout, no accept, no buyout-price field on the listing form.

### Backend contract this consumes (already built, on local main)

- `POST /api/marketplace/listings/{listing_id}/buyout`. Body `{amount}` (int ≥ 1, must equal
  `buyoutPrice`; the gold charged is always the listing's price). Optional `Idempotency-Key` (uuid),
  minted once per buyout intent and reused on every resend of it. Answers `202`, empty.
  - `409 · CONFLICT`: listing busy, retry with the **same** key (the hold is kept for it, ADR-0027).
  - `409 · ALREADY_EXISTS`: this key's attempt was abandoned and its gold returned. Use a **new**
    key.
  - `400 · VALIDATION_FAILED`: amount ≠ buyout price.
  - `400 · FAILED_PRECONDITION`: not ACTIVE / past end / no buyout price / buyer short of gold.
  - `403 · FORBIDDEN`: caller is the seller. `404`. `422` (malformed id / key / body).
  - A resend after the buyout landed (same key, other key, or none) answers `202`.
  - Missing body answers `400` not `422` (I-ADR0001-1, deferred by the user as no practical
    impact: the generated client always sends the body).
- `POST /api/marketplace/listings/{listing_id}/accept`: seller only, no body, `202`. `403` not
  seller; `400 · FAILED_PRECONDITION` not ACTIVE / past end / nobody leads; `409 · CONFLICT` busy.
- `CreateListingBody.buyoutPrice`: optional, must be > `startPrice` (server checks).
- Listing read has `buyoutPrice`, `currentPrice`, `minimumBid`, `status`, `ended`, `sellerId`.
- Place-bid: since ADR-0027 a key whose attempt was refused or abandoned answers
  `409 · ALREADY_EXISTS` on reuse. A bid at or above the buyout price is refused
  `ErrBidAtOrAboveBuyout` → `400 · VALIDATION_FAILED`.
- Settlement is asynchronous: after `202` the listing goes `PENDING_SETTLEMENT`. **Flipping to
  `SOLD` is not wired yet** (I-NXP1W-13 open), so a sold listing currently stays
  `PENDING_SETTLEMENT`.

### Decisions

1. **One FS** for all of it (buyout, accept, buyout price on listing, the two bid fixes). They are
   the steps from bidding to a sale and share the detail page and the post-sale state. Rejected:
   two FS (listing price vs actions), which would duplicate the detail-page and settled-state
   description.
2. **Buyout asks for confirmation.** Pressing Buyout opens a confirm dialog, "Buy <item> for X gold?".
   Only confirming sends it, and the X shown **is** the `amount` sent. Rationale: it freezes the
   whole price and ends the auction, with no undo. Rejected: one click (misclick risk).
3. **Accept-the-leading-bid lives on the detail page only.** The seller's "Your listing" area is
   replaced by a block showing the current leading bid and "Accept X gold" (with confirm) when
   someone leads, or "No bids yet" when nobody does. My listings stays a list; a row opens the
   detail. Rejected: a button on every My-listings row (row complexity, per-row dialogs and
   errors).
4. **Buyout button visibility.** Shown only when signed in, not the seller, listing `ACTIVE`, not
   ended, and `buyoutPrice` set, near the bid box ("Buy out for 500"). Short of available gold:
   still shown but **disabled**, with "Not enough gold", matching the bid box's `availableGold`
   pre-check. Rejected: enabled, letting the server refuse.
5. **After a `202`** (buyout or accept): re-read the listing and the purse; the status label for
   `PENDING_SETTLEMENT` becomes **"Sold — settling"** (new copy); bid box, buyout and accept all
   hidden. The buyer also sees "Bought. The item reaches your inventory once settlement completes."
   When SOLD is wired, the label follows the status without a client change. Rejected: a toast only,
   keeping "Ended — awaiting settlement".
6. **Bid box capped below the buyout price.** Max = `buyoutPrice − 1`. Typing at or above it shows
   "Bids must be below the buyout price. To buy now, use Buy out." and sends nothing. The server's
   `ErrBidAtOrAboveBuyout` (stale page) shows the same line, **not** the "outbid, minimum is X"
   message it falls into today (`bidFailure` treats every `VALIDATION_FAILED` as outbid).
7. **Listing form gets an optional "Buyout price" field** under the start price. When filled it must
   be > start price (client check, server re-checks). Empty means a plain auction. Shown afterwards
   in the posted preview, My listings and detail. Rejected: a toggle that reveals the field (an
   extra step).
8. **Browse rows show a buyout badge** ("Buyout 500") next to the current price. Display only; the
   action stays on detail. Rejected: detail only.

### Buyout errors → copy and key (proposed by Claude, accepted without change)

| Answer | Copy | Key |
|---|---|---|
| `409 · CONFLICT` | "Busy, try again" | keep (same-key retry is safe, ADR-0027) |
| `409 · ALREADY_EXISTS` | "Please try again" | **new** |
| `400 · VALIDATION_FAILED` (amount mismatch) | re-read listing, "The price has changed" | new |
| `400 · FAILED_PRECONDITION` | "Not enough gold" if short, else "No longer available" | new |
| `503` | existing unreachable copy (`BROWSE_UNREACHABLE`) | keep |

A resend of a landed buyout answers `202`, so it is just success.

### Bug found while scoping: bid-key reuse vs ADR-0027

`bidAttempt(previous, amount, mint)` reuses the previous attempt's key whenever the amount is the
same, and `submitBid` keeps the attempt on **any** failure. Since ADR-0027 a key whose bid was
**refused** (too low, ended) or abandoned has its hold released, and reusing it answers
`409 · ALREADY_EXISTS`. `bidFailure` maps every 409 to `BID_CONFLICT` ("busy, retry"), so a player
who resubmits the same amount after a too-low refusal loops on a spent key. This is rare, because
the box follows the new minimum after a refusal, but it is wrong.

Intended rule (thin line "A refused bid retries under a fresh key"):
- keep the key only for answers where the same key is the right retry: `409 · CONFLICT` and `503`
  (and unknown or transport failures);
- mint a new key after a definitive refusal (`VALIDATION_FAILED`, `FAILED_PRECONDITION`) and on
  `409 · ALREADY_EXISTS`;
- `409 · ALREADY_EXISTS` is not shown as "busy"; it is shown as "please try again" and the next press
  uses the new key.

The same rule governs buyout's key (table above).

### Edge cases raised

- Two buyers press Buyout at once: one gets `202`; the other gets `400 · FAILED_PRECONDITION` →
  "No longer available" (and its gold is released server-side).
- A buyer whose buyout landed resends (double click, retry after a lost response) and gets `202`,
  shown as success. No double charge (ADR-0026).
- Seller accepts while a bid is in flight: the backend settles whichever bid leads at freeze (Req 3),
  so the amount the seller confirmed may not be the one that wins. Open: whether the confirm copy
  should say "the current leading bid" rather than promise X. Leaning: "Accept the leading bid
  (currently X gold)".
- Listing ends while the confirm dialog is open: send anyway; `400 · FAILED_PRECONDITION` → "No
  longer available".
- Purse shows enough gold but some is held by the buyer's own other bids: `availableGold` (not
  `gold`) drives the disable. The server is authoritative either way.

### Out of scope

- An accept button on My-listings rows; buying out from the browse list.
- Withdrawing a listing (backend `WithdrawListingUC` unexposed, live-bid handling undecided).
- Bid history / who leads; "my bids" view (no backend query yet).
- Flipping to SOLD (backend I-NXP1W-13); notifications for outbid / sold / won (no events yet).
- The missing-body 400 vs 422 (I-ADR0001-1, deferred).

### Open questions

- **All copy above is placeholder.** `game-client/CLAUDE.md` requires the lore voice (dread and
  rumor, terse, grim; players are "delvers"; no sci-fi register), and FS-8EGFA's existing marketplace
  strings set the house style. Settle the final strings for the buyout confirm, accept confirm,
  "Sold — settling", the cap message and the error copy in write-a-spec.

- Copy and lifetime of "Sold — settling" while SOLD is unwired: a listing may sit in
  `PENDING_SETTLEMENT` indefinitely today.
- Should the buyer's "reaches your inventory" note become a notification later?
- Exact accept-confirm wording given the race above.
