---
id: I-NXP1W-9
status: open
implements: FS-NXP1W
blocked_by: [I-NXP1W-4, I-NXP1W-7]
labels: [blocked]
title: "FS-NXP1W slice 9: step 3 CreditSeller — forward and roll forward"
---
Implements FS-NXP1W §Requirements 9, 23, 30, 38

**Author: human** (Nick)

## What to Build

One issue for this arm: its "already applied" check is the dedup row, written in the same
transaction as the credit, and everything else is the shared helper.

- **Forward (wallet):** credit the seller by the settlement amount. Input: sellerId, amount,
  idempotency key (workflow ID + activity name). Output: seller walletAccountId.
- **Dedup (Req 23):** keyed on (workflow ID, activity name), in the same transaction as the credit.
  The existing `processed_events` is keyed on `(event_id UUID, event_type)` and a workflow ID is a
  string, so decide between a new table and widening that one.
- **Roll forward:** an existing dedup row is already applied, so return the same output.
  Transient failures use the default tail policy and escalate and park through slice 7.
- **Crash-point table** for this step.

## Acceptance Criteria

- [ ] The seller is credited exactly once per settlement
- [ ] A second credit for the same (workflow ID, activity name) is rejected by the dedup and returns the same output
- [ ] Cap exhaustion parks through the slice 7 helper
- [ ] Crash-point table committed
- [ ] Use case tested without Temporal; `make test` green

## Blocked By

I-NXP1W-4 (the pivot), I-NXP1W-7 (the helper).

## Spec Reference

FS-NXP1W §Requirements 9, 23 (dedup), 30 (step 3), 38; Edge States: wallet down after the pivot.
User story 4. ADR-0005.
