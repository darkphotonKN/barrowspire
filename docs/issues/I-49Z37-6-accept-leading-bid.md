---
id: I-49Z37-6
status: done
implements: FS-49Z37
blocked_by: [I-49Z37-4]
labels: []
title: "FS-49Z37 slice 6: accept the leading bid on my listing"
---
Implements FS-49Z37 §Requirements 13–17, 25–27

**Author:** unassigned

## What to Build

- `api.acceptBid(listingId)` in `utils/api.ts` over the generated client
  (`POST /api/marketplace/listings/{listing_id}/accept`).
- Seller block replacing "Your listing" while `ACTIVE` and not ended: `Leading bid: {currentPrice}
  gold` + `Accept leading bid` when `currentPrice` is present, else `No bids yet.` without a
  button.
- Confirm dialog: `End the auction and sell to the leading bid (currently {currentPrice} gold)? A
  higher bid landing first is the one that wins.` · `Sell` / `Not yet`.
- `202`: close, re-read the listing only, show `Sold — your gold arrives once the sale settles.`
  Refusals per Requirement 17.

## Acceptance Criteria

- [ ] Seller block contents per Requirement 13; nothing actionable once not `ACTIVE` or ended.
- [ ] `Not yet` sends nothing; `Sell` sends accept.
- [ ] `202` re-reads the listing (not the purse) and shows the sold copy.
- [ ] `409 · CONFLICT`, `FAILED_PRECONDITION` (with re-read), `503` and others show Requirement 17's copy.
- [ ] Calls only through the generated client; tokens-only styling; tests, lint and typecheck pass.

## Blocked By

I-49Z37-4 (the post-sale label and the no-actions rule)

## Spec Reference

FS-49Z37 §Requirements 13–17, 25–27; §User Stories 10–13, 17; §Edge States (accept while a bid is in flight, listing ends while open).

## TDD Approach

- RED: `sellerBlock` answers "accept {currentPrice}" when someone leads, "no bids" otherwise, "none" once not `ACTIVE` or ended.
- RED: `acceptFailure` maps each answer to Requirement 17's copy.

## Decided at code review (2026-10-20)

The accept confirm **closes when the auction ends** while it is open, instead of staying up and
sending the press as FS-49Z37 §Edge States ("Listing ends while a dialog is open: the press is sent
anyway") describes. There is nothing left to accept on an ended auction, so the confirm drops and
no request is sent. Buy out keeps the FS behavior (its confirm stays up and the server answers "no
longer for sale"). Decided by the user; for /spec-audit to reconcile against the FS.

