# ADR-0018 — Settlement failures are classified by kind; transient ones park, only impossible ones compensate

Status: accepted
Date: 2026-09-17
Scope: `game-server/marketplace-service`, `game-server/wallet-service`, `game-server/items-service`, `game-server/ledger-service`
Builds on: [ADR-0010](0010-the-ledger-is-appended-past-the-saga-pivot.md), [ADR-0011](0011-settlement-write-path-is-a-temporal-activity-per-owning-service.md), [ADR-0016](0016-settlement-starts-from-an-expiry-poller-one-workflow-per-listing.md), [ADR-0017](0017-item-transfer-rolls-forward-the-pivot-stays-at-commit-hold.md)
Realized by: FS-NXP1W (draft)

## Context

Recorded without adversarial review.

Every settlement activity must answer: when this fails, what does Temporal do? Misclassification is
the leading cause of both stuck sagas (a permanent failure retried forever) and wrongly aborted ones
(a blip treated as fatal). ADR-0011 already requires each activity to declare its non-retryable set;
it did not say what the workflow does with the answer.

The textbook saga retries a step to a cap, then compensates backward. That shape assumes abandoning
is acceptable — a request fails, the user tries again. Settlement breaks both assumptions:

- **Nobody retries.** Settlement is triggered by a clock (ADR-0016). A compensated settlement is not
  re-attempted by anyone.
- **The outcome is unrepeatable.** Bidding has closed. Compensating on a thirty-minute wallet outage
  would permanently cancel a valid sale, or require a re-runnable failure state — a reuse policy
  allowing duplicates of failed runs, runs that end *failed* rather than completed, and coordination
  with hold expiry between attempts — rebuilding the very state compensation just undid.

Temporal also has no dead-letter queue for activities. A workflow that fails past its pivot loses
its position, and recovering it is a manual `workflow reset`.

And G2's poller constrains the compensation target: a listing compensated back to `ACTIVE` is
past expiry, so the poller would restart it — harmless for a blip, an infinite loop for a
settlement that can never succeed.

## Decision

**Failures are classified by kind, not by position relative to the pivot.**

| Failure kind | Before pivot (0a–1b) | After pivot (2–6) |
|---|---|---|
| transient — dependency unavailable, deadline, resource exhausted | retry → cap → escalate → park | retry → cap → escalate → park |
| already applied — our own retry catching up | success | success |
| semantic impossibility — hold released/expired, listing withdrawn, item owner changed | compensate to terminal `SETTLEMENT_FAILED` | unreachable by design → escalate → park |

**Escalate-and-park** — the workflow is the dead-letter queue:

1. The activity retries with capped exponential backoff, bounded by `ScheduleToCloseTimeout`.
2. On exhaustion the workflow **catches** the activity error instead of failing, and runs a
   marketplace activity that records a `settlement_exceptions` row and publishes
   `settlement.failed` through the transactional outbox.
3. It parks on whichever comes first: a `RetryStep` signal from an operator, or a re-park timer.
   Either returns it to step 1 for the same activity.
4. **Past the pivot there is no abandon signal.** Abandoning would mean refunding, which ADR-0017
   rules out. The only exit is forward.

**Compensation is reserved for semantic impossibility before the pivot, and it is terminal:** the
listing moves to `SETTLEMENT_FAILED`, holds are released, bids become `LOST`, the item is unfrozen to
its seller, and a `settlement_exceptions` row records it. A `SETTLEMENT_FAILED` listing is never
re-settled — consistent with ADR-0016's `REJECT_DUPLICATE`.

**A settlement workflow never fails past the pivot.**

Specific backoff, cap and re-park durations are tuning, not decision; they live in FS-NXP1W.

Rejected: **retry to cap, then compensate (textbook)** — for the unrepeatable outcome and the
re-run machinery above. Rejected: **compensate to `ACTIVE`** — the poller re-picks it and an
impossible settlement loops. Rejected: **re-runnable `SETTLEMENT_FAILED`** — needs
`ALLOW_DUPLICATE_FAILED_ONLY`, failed-not-completed runs and hold-expiry coordination, for a
case that under this classification can never succeed anyway.

## Consequences

- **One mechanism for every step.** A single escalate-and-park helper covers all activities,
  including MarkSold's "zero rows affected" invariant breach.
- **Nothing is lost.** The saga's position, inputs and history stay in an open, visible workflow;
  RabbitMQ carries only the alert, never the state.
- **Parked workflows are cheap** — a timer and a signal channel; a few history events per loop.
- **Compensation always means "this could never have worked".** It never masks an outage.
- **Cost: a frozen listing can wait on a human.** Before the pivot, a parked settlement holds the
  listing and item frozen for as long as the outage lasts.
- **Cost: parking can outlive the hold.** Holds expire at listing expiry plus a grace period. A
  pre-pivot park longer than that grace lets the hold sweeper release the hold; CommitHold then
  fails semantically and the settlement compensates. This is correct, but the grace must
  comfortably exceed the retry cap or outages will cancel sales through the back door.
- **Cost: classification is now per-activity correctness work.** Every activity must distinguish
  already-applied from impossible when "zero rows changed" could mean either — CommitHold most of
  all, since there the difference decides whether gold moves.
