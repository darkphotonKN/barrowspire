---
id: I-NXP1W-10
status: open
implements: FS-NXP1W
blocked_by: [I-NXP1W-4]
labels: [blocked]
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

- [ ] After the step, the item is owned by the buyer and `AVAILABLE`
- [ ] The write is conditional; it never touches an item that isn't `PENDING_SETTLEMENT`
- [ ] Use case tested without Temporal; `make test` green

## Blocked By

I-NXP1W-4 (the pivot).

## Spec Reference

FS-NXP1W §Requirements 7, 31 (step 4). User story 6. ADR-0017.
