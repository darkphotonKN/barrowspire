---
id: I-NXP1W-7
status: open
implements: FS-NXP1W
blocked_by: [I-NXP1W-3]
labels: [blocked]
title: "FS-NXP1W slice 7: escalate and park — the shared roll-forward helper for the tail"
---
Implements FS-NXP1W §Requirements 10–11, 13–14, 35–36

**Author: human** (Kranti)

## What to Build

The one piece of failure machinery every step after the pivot shares. Each tail arm (slices 8–13)
plugs into it instead of building its own.

- **Default tail retry policy (Req 11, 36):** backoff 1s → 1m, 30m `ScheduleToCloseTimeout` cap,
  explicit `TaskQueue` and `StartToCloseTimeout`, and `HeartbeatTimeout` plus heartbeats for any
  activity that can outrun its window (Req 35).
- **Escalate-and-park helper (Req 10):** when a step's cap is exhausted, or a tail step reports a
  semantic impossibility (an invariant breach, Req 13):
  1. `RaiseSettlementException` (marketplace queue, unlimited retry) writes a
     `settlement_exceptions` row and publishes `settlement.failed` through marketplace's
     transactional outbox. Check that the outbox is wired (`common/outbox`) and wire it if not.
  2. Park until a `RetryStep` signal arrives or the 1h re-park timer fires.
  3. Retry the same step from the start of its policy; on success, mark the exception resolved.
- **No failed end state after the pivot (Req 14).**

## Acceptance Criteria

- [ ] A step exhausting its cap produces a `settlement_exceptions` row and a `settlement.failed` publish, and the workflow stays open
- [ ] A parked settlement resumes on `RetryStep` and, separately, on the re-park timer; on success the exception is resolved
- [ ] A tail invariant breach escalates and parks rather than failing the workflow
- [ ] Tested against a stub step, so it doesn't depend on any real tail arm existing
- [ ] `make test` green

## Blocked By

I-NXP1W-3 (the workflow shell to host it).

## Spec Reference

FS-NXP1W §Requirements 10–11 (escalate and park, tuning), 13–14 (no rollback or failure after the
pivot), 35–36 (activity options, retry caps); Edge States: operator never responds. User stories
11–13, 15–16, 28. ADR-0018.
