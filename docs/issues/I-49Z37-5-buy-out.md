---
id: I-49Z37-5
status: open
implements: FS-49Z37
blocked_by: [I-49Z37-4]
labels: [blocked]
title: "FS-49Z37 slice 5: buy out a listing"
---
Implements FS-49Z37 §Requirements 5–12, 25–27

**Author:** unassigned

## What to Build

- `api.buyout(listingId, amount, idempotencyKey)` in `utils/api.ts` over the generated client
  (`POST /api/marketplace/listings/{listing_id}/buyout`), like `placeBid`.
- A pure `marketplace/buyout.ts`: visibility (signed in, not seller, `ACTIVE`, not ended,
  `buyoutPrice` set), disabled when `availableGold < buyoutPrice` (purse states as the bid box), key
  lifetime (minted on the first confirm press, kept while the dialog is open, discarded on close),
  and refusal → copy and keep/replace key per Requirement 12.
- `buyoutFlow.ts` sequencing a press: send → on `202` re-read listing **and** purse and show the
  bought copy; on refusal apply the table, re-reading the listing for `VALIDATION_FAILED` and
  "no longer for sale".
- Buy out button `Buy out — {price} gold` and confirm dialog (`Buy {relic} outright for {price}
  gold? The auction ends at once.` · `Buy out` / `Keep looking`) in `ListingDetailDialog.tsx`.

## Acceptance Criteria

- [ ] Visibility and disabled state as Requirements 5–6.
- [ ] `Keep looking` sends nothing; `Buy out` sends `{amount: price}` with an `Idempotency-Key`.
- [ ] Same key after `409 · CONFLICT` / `503` within one dialog; new key after `409 · ALREADY_EXISTS` / `VALIDATION_FAILED` / `FAILED_PRECONDITION`; new key on reopening.
- [ ] `202`: dialog closes, listing and purse re-read, bought copy shown, status `Sold — settling`, no actions offered.
- [ ] Each refusal shows the copy of Requirement 12.
- [ ] Calls only through the generated client; tokens-only styling; tests, lint and typecheck pass.

## Blocked By

I-49Z37-4 (the post-sale label and the no-actions rule)

## Spec Reference

FS-49Z37 §Requirements 5–12, 25–27; §User Stories 1–9, 24, 25; §Edge States (two buyers, resend after landing, listing ends while open, purse states, unreachable).

## TDD Approach

- RED: `buyoutAction` is hidden for the seller, a non-`ACTIVE` or ended listing, or no `buyoutPrice`, and disabled when `availableGold < buyoutPrice`.
- RED: the key keeper keeps the key after `409 · CONFLICT` and replaces it after `409 · ALREADY_EXISTS`.
- RED: `buyoutFailure` maps each answer to Requirement 12's copy.
