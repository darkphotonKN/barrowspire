---
id: I-NXP1W-16
status: open
implements: FS-NXP1W
blocked_by: []
labels: []
title: "FS-NXP1W slice 16: scope 0b FreezeItem to its listing; align settlement not-found classification"
---
Implements FS-NXP1W §Requirements 9, 24a, 26

**Author:** unassigned

Follow-up found while building I-NXP1W-5.

## What to Build

- **0b checks `listing_id` (Req 24a).** FreezeItem's write is keyed on status and owner only, so a
  settlement's 0b can freeze an item the seller has since relisted under a new listing.
  - Add `ListingID` to `itemsactivity.FreezeItemInput` (additive, ADR-0019, golden fixture with it).
  - The workflow passes `frozen.ListingID`.
  - The conditional write and the already-frozen read both match `listing_id`.
- **Not-found classification (Req 9).** `ListingRepository.Update` reports a missing listing as
  `commonconstants.ErrNotFound` (via `WrapDBErr`), while the non-retryable sets of
  SetWinningBid, ExpireListing and MarkSold name only `apperr.ErrNotFound`. A missing listing in
  those steps is retried as an outage instead of being reported impossible. I-NXP1W-5 fixed this
  for 0a only.

## Acceptance Criteria

- [ ] FreezeItem on an item reserved for a different listing is non-retryable and changes nothing
- [ ] A retried FreezeItem after the item was relisted under a new listing leaves the new listing's item `LISTED`
- [ ] SetWinningBid, ExpireListing and MarkSold classify the repository's not-found as non-retryable
- [ ] `make test` green

## Blocked By

None.

## Spec Reference

FS-NXP1W §Requirements 9 (classification), 24a (`listing_id` on every item write for a listing),
26 (0b FreezeItem).
