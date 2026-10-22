---
id: I-NXP1W-7
status: done
implements: FS-NXP1W
blocked_by: []
labels: []
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

- [x] A step exhausting its cap produces a `settlement_exceptions` row and a `settlement.failed` publish, and the workflow stays open
- [x] A parked settlement resumes on `RetryStep` and, separately, on the re-park timer; on success the exception is resolved
- [x] A tail invariant breach escalates and parks rather than failing the workflow
- [x] Tested against a stub step, so it doesn't depend on any real tail arm existing
- [x] `make test` green — for everything this issue touches; `TestPlaceBid_AtBuyoutPriceIsInvalidArgumentAndReleasesTheHold` (listing/grpc) already failed before it and belongs to the uncommitted release-hold work

## Implementation notes

- **The helper is `runUntilDone`** (`internal/settlement/park.go`). Each tail arm calls it instead of
  `ExecuteActivity`; NB2 (ExpireListing) is its first caller, which closes its `TODO(I-NXP1W-7)`.
- **`pivotPhase` instead of a bool:** a transient failure parks on either side of the pivot
  (ADR-0018); only an impossibility differs. `beforePivot` returns it for the rollback (Req 12),
  `afterPivot` parks it (Req 13). The rollback itself is I-NXP1W-5/6.
- **The repository owns the transaction.** `Raise` takes a closure that only builds the event (no
  I/O, same contract as `ListingRepository.Update`); the exception row and the outbox row commit
  together.
- **One `settlement.failed` per incident, not per lap.** At most one OPEN exception exists per
  (workflow, step); a later lap or a retried raise finds it and publishes nothing. The open row
  shows it is still unresolved. Read against the AC's "a step exhausting its cap produces … a
  publish", this is a deliberate narrowing: publish per lap instead by dropping the `!created`
  guard in `RaiseSettlementExceptionUC`.
- **No `HeartbeatTimeout` (Req 35).** No settlement activity can outrun the 30s
  `StartToCloseTimeout` today, and a `HeartbeatTimeout` on an activity that never heartbeats
  times it out. Add it per activity when one does.
- **`settlement_exceptions.published_at` is unused.** Req 24 lists it, but the alert goes through
  the outbox table, which tracks its own `published_at`.
- **Cancel ends a parked settlement.** A cancelled workflow returns instead of spinning (it hit
  the SDK's deadlock detector before). After the pivot that leaves a paid settlement unfinished,
  so operators should send `RetryStep`, not cancel:
  `temporal workflow signal --workflow-id settlement-<listingId> --name RetryStep`
- **Nobody consumes `settlement.failed` yet.** It reaches `marketplace.events`; alerting on it is
  out of scope for this FS.
- **Test-environment caveat:** the SDK test environment caps `MaximumAttempts: 0` at 10 attempts, so
  a lap ends in about four minutes there rather than at `stepCap`. The park tests measure from each
  raise.

## Blocked By

I-NXP1W-3 (the workflow shell to host it).

## Spec Reference

FS-NXP1W §Requirements 10–11 (escalate and park, tuning), 13–14 (no rollback or failure after the
pivot), 35–36 (activity options, retry caps); Edge States: operator never responds. User stories
11–13, 15–16, 28. ADR-0018.
