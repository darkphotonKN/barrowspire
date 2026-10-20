# FS-49Z37: Marketplace sale actions

> Status: work-order · SPECIFICATION.md: `game-client/SPECIFICATION.md` "### Marketplace" → "Buy out a listing", "Accept the leading bid on my listing", "Set a buyout price when listing", "Bids stay below a listing's buyout price", "A refused bid retries under a fresh key" → this FS · Related ADRs: [ADR-0026](../adr/0026-buyout-replay-is-recognised-by-a-caller-key-and-the-buyers-own-bid.md) (buyout key per intent), [ADR-0027](../adr/0027-place-bid-id-is-derived-from-the-callers-key.md) (bid key spent once refused; same-key retry of a busy listing is safe), [ADR-0009](../adr/0009-idempotency-belongs-to-the-caller.md) · Related FS: [FS-8EGFA](8EGFA-marketplace-web-page.md) (the page this extends), [FS-NXP1W](NXP1W-auction-settlement-saga.md) (buyout and accept-bid endpoints, settlement), [FS-9XKS6](9XKS6-listing-buyout-price.md) (buyout price on listings)

## Summary

The marketplace page lets a delver buy a listed relic outright at its buyout price, lets a seller
end their own auction early by selling to the leading bid, and lets a seller set a buyout price when
listing. Bidding learns to respect a buyout price, and a refused bid no longer retries under a key
the server has already spent. Everything here is client work over endpoints that already exist.

## Requirements

### Buyout price on a new listing

1. The listing form has an optional **Buyout price** field under the starting bid, labelled
   `Buyout price (optional)`. Empty means a plain auction; the request then carries no
   `buyoutPrice`.
2. When filled, the buyout price must be a whole amount **above the starting bid**. Otherwise the
   form shows `The buyout price must be above the starting bid.` and does not send. The server
   re-checks; its refusal is shown the same way.
3. A listing's buyout price, when set, is shown in the posted preview, in My listings, and on the
   listing detail.

### Browse

4. A browse row whose listing has a buyout price shows a badge `Buyout {price}` next to its current
   price. Display only: buying out happens on the detail.

### Buy out (buyer)

5. On the listing detail, a **Buy out** button labelled `Buy out — {price} gold` is shown only when
   all hold: the viewer is signed in, is not the seller, the listing is `ACTIVE`, it has not ended,
   and it has a `buyoutPrice`. Otherwise it is absent.
6. When the viewer's **available** gold (`availableGold`, not `gold`) is below the buyout price, the
   button is shown **disabled** with `Not enough gold`, the same pre-check the bid box makes. A purse
   that is not read yet or failed to read uses the bid box's existing purse states.
7. Pressing it opens a confirm dialog: `Buy {relic} outright for {price} gold? The auction ends at
   once.`, with `Buy out` and `Keep looking`. Nothing is sent until `Buy out` is pressed.
8. The `amount` sent is exactly the price shown in the dialog.
9. **Key lifetime.** A fresh `Idempotency-Key` is minted on the first press of `Buy out` inside the
   dialog and is reused for every resend while that dialog stays open. Closing the dialog discards
   it; opening it again is a new buyout intent with a new key (ADR-0026).
10. A buyout is sent through the generated client (`POST /api/marketplace/listings/{listing_id}/buyout`)
    with that key and amount.
11. On `202`: close the dialog; re-read the listing **and** the purse; show
    `Bought — the relic reaches your stash once the sale settles.`
12. On a refusal, the dialog shows the answer's copy and handles the key as follows:

    | Answer | Copy | Key |
    |---|---|---|
    | `409 · CONFLICT` | `Someone acted at the same moment — try again.` | keep |
    | `409 · ALREADY_EXISTS` | `That attempt lapsed — try again.` | replace with a new key |
    | `400 · VALIDATION_FAILED` | re-read the listing; `The buyout price has changed — check it and try again.` | replace |
    | `400 · FAILED_PRECONDITION` | `Not enough gold` when available gold is below the price, else `This relic is no longer for sale.` | replace |
    | `503`, transport failure | the existing `BROWSE_UNREACHABLE` copy | keep |
    | anything else | the problem's `detail` | replace |

    A `FAILED_PRECONDITION` that is "no longer for sale" also re-reads the listing, so the page stops
    offering an action it no longer allows.

### Accept the leading bid (seller)

13. For the seller, the detail's "Your listing" area becomes a seller block. While the listing is
    `ACTIVE` and not ended:
    - someone leads (`currentPrice` present): `Leading bid: {currentPrice} gold` and an
      `Accept leading bid` button;
    - nobody leads: `No bids yet.` and no button.
14. Pressing it opens a confirm dialog: `End the auction and sell to the leading bid (currently
    {currentPrice} gold)? A higher bid landing first is the one that wins.`, with `Sell` and
    `Not yet`. The copy promises the leading bid, not the amount: the server settles whichever bid
    leads when settlement freezes the listing.
15. `Sell` sends `POST /api/marketplace/listings/{listing_id}/accept` through the generated client.
    No key, no body.
16. On `202`: close the dialog; re-read the listing only (the seller's gold arrives at settlement,
    so the purse would not change); show `Sold — your gold arrives once the sale settles.`
17. Refusals: `409 · CONFLICT` → `Someone acted at the same moment — try again.`;
    `400 · FAILED_PRECONDITION` → re-read the listing and show `This relic is no longer for sale.`;
    `503` → `BROWSE_UNREACHABLE`; anything else → the problem's `detail`.

### After a sale

18. The status label for `PENDING_SETTLEMENT` is `Sold — settling`, wherever a status label is shown
    (detail, My listings, browse if shown). It replaces the generic words for that status. The
    label for an `ACTIVE` listing past its end (`Ended — awaiting settlement`) is unchanged.
19. Once a listing is `PENDING_SETTLEMENT`, or any status other than `ACTIVE`, the detail shows no
    bid box, no Buy out, and no Accept.

### Bids and the buyout price

20. On a listing with a buyout price, the bid box's highest acceptable amount is `buyoutPrice − 1`.
    An amount at or above the buyout price shows `Bids must stay below the buyout price — to buy
    now, use Buy out.` and sends nothing.
21. The server's refusal of a bid at or above the buyout price (`400 · VALIDATION_FAILED` from
    `ErrBidAtOrAboveBuyout`, reached when the page is stale) shows the same copy, **not** the
    outbid message. A `VALIDATION_FAILED` that is a plain too-low bid keeps today's outbid
    behavior (re-read, then `outbidMessage`). The two are told apart by the re-read listing: if the
    refused amount is at or above its `buyoutPrice`, it was the buyout cap.

### Bid keys

22. A bid's `Idempotency-Key` is reused only for answers where a same-key retry is the correct
    retry: `409 · CONFLICT`, `503`, and transport failures (ADR-0027 keeps the hold for those).
23. After a definitive refusal (`400 · VALIDATION_FAILED`, `400 · FAILED_PRECONDITION`) or
    `409 · ALREADY_EXISTS`, the next press mints a **new** key, even for the same amount.
24. `409 · ALREADY_EXISTS` on a bid shows `That attempt lapsed — try again.`, not the
    `BID_CONFLICT` "someone bid at the same moment" copy.

### General

25. All calls go through the generated client (`game-client/src/api/generated`). No hand-written
    `fetch`.
26. The decision logic (visibility, key handling, refusal → copy and key, the cap) lives in pure
    modules next to `bid.ts` / `bidFlow.ts`, so it is tested without a dialog, as FS-8EGFA did.
27. Copy follows FS-8EGFA's marketplace house style: plain sentences, light lore words (relic,
    stash, Bazaar), an em dash before the follow-up hint.

## User Stories

1. As a buyer, I want to buy a relic outright at its buyout price, so that I don't have to wait out the auction.
2. As a buyer, I want to confirm before a buyout, so that one misclick doesn't spend my gold and end the auction.
3. As a buyer, I want the confirmation to show the exact price, so that I know what I'm agreeing to pay.
4. As a buyer, I want the Buy out button disabled when I can't afford it, so that I'm not sent down a path that will be refused.
5. As a buyer, I want to see which listings have a buyout price while browsing, so that I can find what I can take at once.
6. As a buyer, I want to be told plainly when someone else bought the relic first, so that I stop trying.
7. As a buyer on a flaky connection, I want pressing Buy out again to be safe, so that a retry never charges me twice.
8. As a buyer, I want to see that my purchase is settling, so that I know the relic is on its way even though it isn't in my stash yet.
9. As a buyer, I want my purse to reflect the held buyout gold right away, so that I don't over-commit elsewhere.
10. As a seller, I want to end my auction early by selling to the leading bid, so that I can take a price I'm happy with.
11. As a seller, I want to confirm before ending the auction, so that I don't sell by accident.
12. As a seller, I want the confirmation to be honest that a higher bid may land first, so that I'm not surprised by the final price.
13. As a seller, I want to see "No bids yet" when nobody leads, so that I know there is nothing to accept.
14. As a seller, I want to set a buyout price when listing, so that a buyer can take the relic at a price I choose.
15. As a seller, I want the form to stop a buyout price at or below the starting bid, so that I don't post a listing the server rejects.
16. As a seller, I want my listing's buyout price shown in My listings and on the detail, so that I can check what I posted.
17. As a seller, I want to see my listing marked as sold and settling after I accept, so that I know it worked.
18. As a bidder, I want the bid box to stop me at the buyout price, so that I use Buy out instead of a bid that will be refused.
19. As a bidder on a stale page, I want a bid over the buyout price to tell me to use Buy out, not that I was outbid, so that the message matches what happened.
20. As a bidder, I want a refused bid not to leave me stuck on a spent key, so that pressing Bid again actually places a bid.
21. As a bidder, I want a bid that met a busy listing retried under the same key, so that the retry is recognised and never lands twice.
22. As any delver, I want a sold listing to stop offering bid, buyout and accept, so that I'm not invited to act on a finished auction.
23. As any delver, I want the same "unreachable" message the Bazaar already uses when the server can't be reached, so that the page speaks with one voice.
24. As a client developer, I want every call through the generated client, so that the contract gates see it.
25. As a client developer, I want the decision logic in pure tested modules, so that changes to it are caught without a browser.

## Acceptance Criteria

- [ ] Listing form: an empty buyout price sends no `buyoutPrice`; a filled one at or below the starting bid shows the message and sends nothing; a valid one is sent and then shown in the posted preview, My listings and detail.
- [ ] Browse: a row with a buyout price shows `Buyout {price}`; a row without one shows no badge.
- [ ] Buy out is shown exactly when signed in, not seller, `ACTIVE`, not ended and `buyoutPrice` set; otherwise absent.
- [ ] Buy out is disabled with `Not enough gold` when `availableGold < buyoutPrice`.
- [ ] The confirm dialog shows the relic and price; `Keep looking` sends nothing; `Buy out` sends `{amount: price}` with an `Idempotency-Key`.
- [ ] Within one open dialog, a resend after `409 · CONFLICT` or `503` uses the same key; after `409 · ALREADY_EXISTS`, `400 · VALIDATION_FAILED` or `400 · FAILED_PRECONDITION` it uses a new key; reopening the dialog uses a new key.
- [ ] Buyout `202`: dialog closes, listing and purse are re-read, the bought message shows, the status reads `Sold — settling`, and no bid, Buy out or Accept is offered.
- [ ] Each buyout refusal shows the copy in Requirement 12.
- [ ] Seller block shows `Leading bid: {n} gold` with Accept when someone leads, `No bids yet.` without Accept otherwise, and nothing actionable once the listing is not `ACTIVE` or has ended.
- [ ] Accept confirm copy says "currently {n} gold" and that a higher bid landing first wins; `Not yet` sends nothing; `Sell` sends accept.
- [ ] Accept `202`: dialog closes, only the listing is re-read, the sold message shows.
- [ ] Each accept refusal shows the copy in Requirement 17.
- [ ] `PENDING_SETTLEMENT` reads `Sold — settling` on every status label; `Ended — awaiting settlement` is unchanged.
- [ ] Bid box: an amount ≥ `buyoutPrice` shows the cap message and sends nothing; a server `ErrBidAtOrAboveBuyout` refusal shows the same message, not the outbid message; a plain too-low refusal still shows the outbid message.
- [ ] Bid keys: after `VALIDATION_FAILED`, `FAILED_PRECONDITION` or `409 · ALREADY_EXISTS`, the same amount is sent under a new key; after `409 · CONFLICT` or `503`, under the same key.
- [ ] Bid `409 · ALREADY_EXISTS` shows `That attempt lapsed — try again.`; `409 · CONFLICT` still shows `BID_CONFLICT`.
- [ ] No hand-written `fetch`; calls go through `src/api/generated`.
- [ ] Unit tests cover the pure modules (visibility, key rules, refusal mapping, cap); tests pass; lint (including the token-only styling fence) and typecheck pass.

## Edge States

- **Two buyers press Buy out together:** one gets `202`; the other gets `400 · FAILED_PRECONDITION` → `This relic is no longer for sale.` and a re-read that hides the actions. The server returns their held gold.
- **Buyer resends after their buyout landed** (double press, retry after a lost response): the server answers `202`; shown as success, no second charge (ADR-0026).
- **Seller accepts while a bid is in flight:** whichever bid leads at the freeze wins; the confirm copy already says so.
- **Listing ends while a dialog is open:** the press is sent anyway; `FAILED_PRECONDITION` → `This relic is no longer for sale.` and a re-read.
- **Buyer's gold is partly held by their own other bids:** `availableGold` drives the disabled state; the server stays authoritative.
- **Purse not read or unreadable:** Buy out uses the bid box's purse states (`PURSE_NOT_READY` / `PURSE_FAILED`) and stays disabled until the purse reads.
- **Server unreachable:** `BROWSE_UNREACHABLE`; the key is kept, so the retry is the same intent.
- **Signed out:** no Buy out and no seller block; the existing sign-in prompt stands.
- **Between the sale and settlement:** a sale reads `Sold — settling` while settlement runs (`PENDING_SETTLEMENT`), then `SOLD` once settlement's step 6 marks it (I-NXP1W-13). *(Corrected 2026-10-20: this line first said step 6 was unwired and the label would stay indefinitely. That was read off a stale issue status; the step was already wired.)*
- **`SETTLEMENT_FAILED`:** keeps its existing label; no actions offered.

## Out of Scope

- An Accept button on My-listings rows, and buying out from the browse list.
- Withdrawing a listing (backend `WithdrawListingUC` unexposed; live-bid handling undecided).
- Bid history, who leads, and a "my bids" view (no backend query).
- Notifications for outbid / sold / won (no events). Flipping a sale to `SOLD` is backend settlement (I-NXP1W-13, already wired).
- Making the buyer's "reaches your stash" note a notification.
- Any backend or contract change: every endpoint used already exists. The missing-body `400` vs
  `422` (I-ADR0001-1) is deferred and does not affect the generated client, which always sends the
  body.
