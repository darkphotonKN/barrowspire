---
id: I-NXP1W-7
status: open
implements: FS-NXP1W
blocked_by: [I-NXP1W-4]
labels: [blocked]
title: "FS-NXP1W slice 7: tail arm forward — ReleaseLosingHolds, CreditSeller, TransferItem, AppendLedgerTx, MarkSold"
---
Implements FS-NXP1W §Requirements 23, 29–33

**Author: human** (Kranti)

## What to Build

The steps after the pivot, on the forward path only. The tail never rolls back; its failure
handling is slice 8.

- **2 ReleaseLosingHolds** (wallet): every `RESERVED` hold for a losing bid → `RELEASED`. Already
  `RELEASED` counts as applied. Returns released count.
- **3 CreditSeller** (wallet): credit the seller by the settlement amount, deduplicated in the same
  transaction on (workflow ID, activity name). The existing `processed_events` is keyed on
  `(event_id UUID, event_type)` and a workflow ID is a string, so decide between a new table and
  widening that one (Req 23).
- **4 TransferItem** (items): `owner = buyer, status = AVAILABLE`, conditional on
  `status='PENDING_SETTLEMENT'`. Transfer and unfreeze happen in one write.
- **5 AppendLedgerTx** (saga side): the workflow builds buyer DEBIT and seller CREDIT legs, reason
  `SETTLEMENT`, reference = listingId, keyed by the wallet account IDs from CommitHold and
  CreditSeller outputs. `transaction_id = uuidv5(fixed settlement namespace, "settlement:" +
  listingId)`. **The namespace and derivation are a permanent contract.** Schedule it on the
  `ledger` queue.
- **6 MarkSold** (marketplace): `PENDING_SETTLEMENT → SOLD`, conditional on status. The existing
  `MarkSoldListingUC` is find-then-save with retries, so rework it as a conditional write.

## Acceptance Criteria

- [ ] A happy-path settlement ends with: listing `SOLD`; winner `WON`, others `LOST`; winning hold `COMMITTED` and buyer debited; losing holds `RELEASED`; seller credited once; item owned by the buyer and `AVAILABLE`; exactly two ledger rows under the derived transaction_id
- [ ] Re-executing any tail activity after success returns the same output and changes nothing
- [ ] A second credit for the same (workflow ID, activity name) is rejected by the dedup
- [ ] Marketplace never reads wallet account IDs from wallet's data; it only passes them through
- [ ] `make test` green

## Blocked By

I-NXP1W-4. `AppendLedgerTx` itself comes from FS-F9R7Q (I-F9R7Q-5).

## Spec Reference

FS-NXP1W §Requirements 23 (dedup), 29–33 (steps 2–6), 18 (account IDs passed through). User
stories 4, 6–7, 22–23. ADR-0010, ADR-0017.
