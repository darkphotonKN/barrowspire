---
id: I-NXP1W-15
status: open
implements: FS-NXP1W
blocked_by: [I-NXP1W-3]
labels: [blocked]
title: "FS-NXP1W slice 15: no-bids arm — NB1 ReturnItem, NB2 ExpireListing"
---
Implements FS-NXP1W §Requirements 8, 24a, 34a, 34b

**Author: human** (Kranti)

## What to Build

When 0a returns `NO_BIDS`, the workflow runs NB1 then NB2 and ends. No other steps run.

- **NB1 ReturnItem** (items): `LISTED → AVAILABLE`, clearing `listing_id`, conditional on
  `status = 'LISTED' AND listing_id = :listing_id`. Zero rows changed is success.
- **NB2 ExpireListing** (marketplace): `PENDING_SETTLEMENT → EXPIRED` conditional on status. An
  already `EXPIRED` listing is success. Any other status escalates and parks.

**The race NB1 has to survive:** NB1 commits, but Temporal never gets the result, so it retries.
Before the retry runs, the seller relists the now-`AVAILABLE` item. A guard on status alone
would match the new listing's `LISTED` item and free it. The `listing_id` guard stops that: the
retry carries the old ID, matches nothing, and returns success.

That needs `listing_id` on the item:

- Migration 000022 adds the column (already written).
- items-service mints the ID at reserve (`AVAILABLE → LISTED`) and carries it on `ItemReserved`.
  The listing is born with that ID instead of minting its own.

## Acceptance Criteria

- [ ] Reserve sets `listing_id`, and the new listing's ID equals it
- [ ] A no-bids settlement ends with the listing `EXPIRED` and the item `AVAILABLE` with `listing_id` NULL; no wallet or ledger activity runs
- [ ] Retrying NB1 after the seller relisted the item returns success, and the new listing's item stays `LISTED`
- [ ] Re-running NB2 on an `EXPIRED` listing is success
- [ ] Use cases tested without Temporal; `make test` green

## Blocked By

I-NXP1W-3 (workflow shell and 0a's `NO_BIDS` outcome).

## Spec Reference

FS-NXP1W §Requirements 8 (zero bids), 18 (contract rows), 24a (`listing_id`), 34a–34b (NB1, NB2);
Edge States "Zero bids", "Item relisted before a release retry ran", "Crash after NB1 commits".
User story 3.
