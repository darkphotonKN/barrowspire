---
id: I-NXP1W-8
status: open
implements: FS-NXP1W
blocked_by: [I-NXP1W-7]
labels: [blocked]
title: "FS-NXP1W slice 8: tail arm compensation — roll forward, capped retry, escalate and park"
---
Implements FS-NXP1W §Requirements 9–11, 13–14, 35–36, 38

**Author: human** (Kranti)

## What to Build

How the tail survives failures. After the pivot there is no rollback: the saga retries, escalates
and parks until it can roll forward.

- **Classification (Req 9)** in every tail wrapper, with explicit non-retryable sets. A semantic
  impossibility in the tail is an invariant breach. It escalates and parks, it does not fail
  (Req 13). Example: MarkSold finding any status other than `PENDING_SETTLEMENT`.
- **Retry policies (Req 11, 35–36):** backoff 1s → 1m, 30m `ScheduleToCloseTimeout` cap, explicit
  `TaskQueue` and `StartToCloseTimeout`, `HeartbeatTimeout` plus heartbeats for any activity that
  can outrun its window.
- **Escalate-and-park helper (Req 10), one for every step:**
  1. `RaiseSettlementException` (marketplace queue, unlimited retry) writes a
     `settlement_exceptions` row and publishes `settlement.failed` through marketplace's
     transactional outbox. Check that the outbox is wired (`common/outbox`) and wire it if not.
  2. Park until a `RetryStep` signal arrives or the 1h re-park timer fires.
  3. Retry the same step from the start of its policy; on success, mark the exception resolved.
- **Crash-point table for steps 2–6 (Req 38).**

## Acceptance Criteria

- [ ] An activity exhausting its cap produces a `settlement_exceptions` row and a `settlement.failed` publish, and the workflow stays open
- [ ] A parked settlement resumes on `RetryStep` and, separately, on the re-park timer; on success the exception is resolved
- [ ] No settlement workflow ends in a failed state after CommitHold succeeded
- [ ] Every activity has `TaskQueue` and `StartToCloseTimeout` and declares its non-retryable set
- [ ] Crash-point table for steps 2–6 committed
- [ ] `make test` green

## Blocked By

I-NXP1W-7

## Spec Reference

FS-NXP1W §Requirements 9–11 (classification, escalate and park, tuning), 13–14 (no rollback
after pivot), 35–36 (assembly), 38 (crash points); Edge States: wallet/items/ledger down, MarkSold
mismatch, operator never responds. User stories 11–13, 15–16, 28. ADR-0018.
