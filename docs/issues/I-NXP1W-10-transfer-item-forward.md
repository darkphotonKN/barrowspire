---
id: I-NXP1W-10
status: done
implements: FS-NXP1W
blocked_by: []
labels: []
title: "FS-NXP1W slice 10: step 4 TransferItem — forward"
---
Implements FS-NXP1W §Requirements 31

**Author: human** (Kranti)

## What to Build

The item changing hands. Failure handling is slice 11.

- **Forward (items):** `owner_member_id = buyer, status = AVAILABLE`, conditional on
  `status='PENDING_SETTLEMENT'`. Transfer and unfreeze happen in one write. Input: itemId, buyer
  memberId.
- A thin activity wrapper over a plain use case (Req 7), scheduled on the `items` queue after
  CreditSeller.

## Acceptance Criteria

- [x] After the step, the item is owned by the buyer and `AVAILABLE`
- [x] The write is conditional; it never touches an item that isn't `PENDING_SETTLEMENT`
- [x] Use case tested without Temporal; `make test` green

## Implementation notes

- **Not yet scheduled by the workflow:** the activity is registered on the items worker, but
  `SettleAuction` still stops after 0b. Step 4 is added once steps 1a–3 are wired in.

- **Input carries the listing ID (Req 8):** `TransferItemInput` gains `ListingID`, and the write is
  also conditional on `listing_id = $listingId`. Status alone cannot tell this listing's freeze
  from a later one's: without it, a late retry of this step could unfreeze the item after the
  buyer relists it and that listing reaches settlement. The workflow passes
  `FreezeListingOutput.ListingID` when it schedules step 4.
- **The transfer clears `listing_id`:** the item leaves the listing with its new owner, the same
  as ReturnItem on the no-bids arm (migration 000022: release clears it, the next reservation
  sets a new one).
- **Already applied ignores `listing_id`:** owner = buyer and status is not
  `PENDING_SETTLEMENT`, as Req 31 states. The ID is already cleared by then, so matching on it
  would turn every retry into a false impossibility.
- **Known gap, for I-NXP1W-11:** if the buyer relists within the retry window and that listing
  reaches its own freeze, a retry of this step sees the buyer's item frozen again and reports
  `TransferItemImpossible` although the transfer happened. No asset moves wrongly; it parks for
  an operator.

## Blocked By

I-NXP1W-4 (the pivot).

## Spec Reference

FS-NXP1W §Requirements 7, 31 (step 4). User story 6. ADR-0017.
