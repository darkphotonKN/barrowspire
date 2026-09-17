---
id: I-NXP1W-5
status: open
implements: FS-NXP1W
blocked_by: [I-NXP1W-3]
labels: [blocked]
title: "FS-NXP1W slice 5: freeze arm compensation — retry policy, classification, rollback of 0a/0b"
---
Implements FS-NXP1W §Requirements 9, 12, 24, 36–38

**Author: human** (Kranti)

## What to Build

What happens when 0a or 0b fails. Before the pivot, a failure that can never succeed rolls back.

- **Classification (Req 9)** in the 0a and 0b wrappers: transient → plain retryable error; already
  applied → success; semantic impossibility → non-retryable application error. Each activity
  declares its non-retryable set.
- **Retry policy (Req 11, 36):** backoff 1s → 1m, `ScheduleToCloseTimeout` cap, explicit
  `TaskQueue` and `StartToCloseTimeout`.
- **Rollback actions for this arm (Req 12):** listing → `SETTLEMENT_FAILED` and item unfrozen to
  `AVAILABLE` for its seller. Each action is idempotent and retried without a cap. Record the
  rollback in a `settlement_exceptions` row (check the table exists, Req 24).
- **Withdrawn listing edge:** the rollback must not overwrite a final status another flow set.
- **Rollback wiring** in the workflow: a semantic impossibility in 0a/0b runs the rollback and
  ends the workflow in its final `SETTLEMENT_FAILED` state. Build this so slice 6 can plug the
  pivot arm's undo actions into it.
- **Crash-point table for 0a and 0b (Req 38):** for each crash point (before the write, after the
  write but before the activity completes, after completion but before the workflow records it),
  show it resolves to already-applied-and-continue or roll back. Commit it alongside the tests.

## Acceptance Criteria

- [ ] FreezeItem fails non-retryably when the owner is not the seller or the status is neither `LISTED` nor `PENDING_SETTLEMENT`
- [ ] A semantic impossibility in 0a or 0b leaves the listing `SETTLEMENT_FAILED`, the item `AVAILABLE` with the seller, and one `settlement_exceptions` row
- [ ] A `SETTLEMENT_FAILED` listing is never re-settled
- [ ] A rollback action that fails transiently retries until it succeeds; it never parks halfway
- [ ] Crash-point table for 0a/0b committed
- [ ] `make test` green

## Blocked By

I-NXP1W-3

## Spec Reference

FS-NXP1W §Requirements 9 (classification), 11 (tuning), 12 (rollback), 24 (exceptions table),
36–37 (policies, rollback wiring), 38 (crash points); Edge States: withdrawn listing, item owner
changed, rollback action fails. User story 14. ADR-0018.
