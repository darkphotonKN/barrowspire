---
id: I-NXP1W-6
status: open
implements: FS-NXP1W
blocked_by: [I-NXP1W-4, I-NXP1W-5]
labels: [blocked]
title: "FS-NXP1W slice 6: pivot arm compensation — retry policy, classification, rollback of 1a/1b"
---
Implements FS-NXP1W §Requirements 9, 12, 15, 36–38

**Author: human** (Kranti)

## What to Build

What happens when 1a or 1b fails. This is the last point where rollback is allowed.

- **Classification (Req 9)** in the 1a and 1b wrappers. For CommitHold, disambiguate "nothing
  changed" by reading the hold: `COMMITTED` → already applied; `RELEASED` or past expiry → semantic
  impossibility. A caller amount different from the hold's amount is non-retryable and raised
  loudly. Reaching the `gold >= amount` guard aborts the transaction as a semantic impossibility.
- **Retry policy (Req 11, 36):** same shape as slice 5.
- **Rollback actions for this arm (Req 12):** every bid on the listing → `LOST` (including one
  already `WON`) and every `RESERVED` hold on the listing → `RELEASED`. Idempotent, retried without
  a cap. Plug them into slice 5's rollback wiring so a failure at any pre-pivot step undoes
  everything done so far.
- **No `REVERSED` state and no `ReverseCommit` (Req 15).**
- **Crash-point table for 1a and 1b (Req 38).** The key case: a crash after CommitHold commits but
  before the workflow records it must resolve to already applied, moving gold once.

## Acceptance Criteria

- [ ] CommitHold on a `RELEASED` or expired hold is non-retryable; on a `COMMITTED` hold it is success; an amount mismatch is non-retryable
- [ ] A semantic impossibility in 1a or 1b leaves: listing `SETTLEMENT_FAILED`, all holds on the listing `RELEASED`, all bids `LOST`, item `AVAILABLE` with the seller, one `settlement_exceptions` row
- [ ] Crash-point table for 1a/1b committed
- [ ] `make test` green

## Blocked By

I-NXP1W-4 (the forward steps), I-NXP1W-5 (the rollback wiring).

## Spec Reference

FS-NXP1W §Requirements 9, 12, 15, 28 (CommitHold failure cases), 36–38; Edge States: crash after
CommitHold, hold expired while parked, insufficient gold. User stories 14, 20. ADR-0017, ADR-0018.
