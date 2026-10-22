# ADR-0024 — A bid's hold is given back by a Temporal workflow, not by a gRPC call to wallet

Status: accepted
Date: 2026-10-10
Scope: `game-server/marketplace-service`, `game-server/wallet-service`
Builds on: [ADR-0011](0011-settlement-write-path-is-a-temporal-activity-per-owning-service.md) — extends its
"write-path operations are activities in the owning service" rule from settlement to the bid path

## Context

Recorded without adversarial review.

Three marketplace use cases freeze a bidder's gold with `PlaceHold` and must give it back when no
bid ends up standing behind it:

- **PlaceBid**, as the Cancel of its TCC: the bid write provably did not land, or the request was
  a replay deduplicated on its idempotency key.
- **WithdrawBid**: the bid was cancelled, and a CANCELLED bid is in neither of settlement's
  release sets.
- **Buyout**: the listing definitively refused the buyout under the lock.

Each did it by calling wallet's `ReleaseHold` over gRPC, inline, on the bidder's request path.
That forces the release to be bounded by what a waiting bidder will tolerate: PlaceBid retried
transient failures three times inside five seconds, Buyout had its own three-attempt loop, and
WithdrawBid tried once. Anything those budgets missed fell to `ReconcileHoldsWorker`, which can
only judge a hold once it is ten minutes old (it cannot tell an orphan from a request still
mid-write) and runs every five minutes.

So any wallet outage longer than a request stranded a bidder's gold for ten to fifteen minutes,
and a marketplace crash between the failed write and the release lost the compensation outright.
The one place that *knows* the hold backs nothing — the use case, at that moment — was the place
least able to finish the job.

ADR-0011 already settled the shape for settlement: a write to wallet's data is an activity on
wallet's own task queue, scheduled by a workflow, not an RPC from the orchestrator. Its scope was
the settlement write path; the bid path was left as gRPC.

## Decision

**Giving back a bid's hold is a Temporal workflow, `ReleaseHold`, hosted by marketplace
(`internal/releasehold`). Its single step is wallet's `ReleaseHold` activity, executed by
wallet's worker on the `wallet` task queue.** No use case calls wallet's `ReleaseHold` RPC.

- **Identity.** Workflow ID `release-hold-{bidID}`, `REJECT_DUPLICATE`; "already started" is
  success. A hold belongs to one bid, so the bid id is the dedup key, and a caller may start the
  release without knowing whether an earlier attempt already did.
- **Retry.** Uncapped: no `ScheduleToCloseTimeout`, unlimited attempts, a bounded single attempt.
  Giving up leaves gold reserved behind nothing, which is strictly worse than retrying.
- **Non-retryable set.** Only `ErrInvalidHoldTransition` (the hold is COMMITTED) and
  `ErrHoldNotFound`. Both mean marketplace's request contradicts wallet's records; the run fails
  visibly instead of retrying forever. A missing or already-released hold is success, as it
  already was in `ReleaseHoldUC`.
- **Callers start, never wait.** PlaceBid, WithdrawBid and Buyout start the run once, on a
  context detached from the request's cancellation with a five-second timeout. A start that fails
  is logged and not returned; the Temporal client already retries its own transient failures.
- **The reconciler stays** as the backstop for a start that never happened, and still releases
  through the gRPC `ReleaseHold`.

What does **not** move: deciding *whether* to release. The TCC classification in PlaceBid —
which write failures prove the bid did not land — stays in the use case. Temporal can make a
release durable; it cannot tell whether a COMMIT landed.

Rejected: **keep gRPC, with bounded inline retries.** Simpler, no new workflow, and the request
path already had it. Rejected because its bound is the bidder's patience rather than the outage's
length, and because a process crash between the failed write and the release loses the release
with nothing durable recording that it was owed.

Rejected: **start the release from the reconciler only.** It would remove the start from the
request path entirely, but every release would then wait out the ten-minute grace the reconciler
needs to tell an orphan from an in-flight write — for holds the use case already knows are orphans.

## Consequences

- **A wallet outage no longer strands gold.** Once the run is started, the release lands whenever
  wallet comes back, and a marketplace restart loses nothing.
- **The request path stops waiting on wallet to clean up.** PlaceBid's release retry
  (`withBackoff` over `ReleaseHold`) and Buyout's release loop are gone; `withBackoff` remains for
  PlaceBid's ambiguous-write retry, which is a different question.
- **WithdrawBid gains retry it never had.** It went from one attempt to uncapped.
- **The reconciler's job shrinks** to holds whose release was never started — Temporal
  unreachable at that moment, or a crash before the start — instead of every release that hit a
  slow wallet.
- **Cost: a new hard dependency on the bid path.** Starting the release needs Temporal. When it is
  down, compensation degrades to the reconciler's ten-to-fifteen minutes — the same as a wallet
  outage was before, no worse.
- **Cost: two release paths exist.** The workflow for use cases, gRPC for the reconciler. Retiring
  the RPC means moving the reconciler onto the workflow too; that is left open here.
- **Cost: an impossible release fails a run rather than surfacing in the request.** A
  `ReleaseHoldImpossible` is visible only in Temporal, so someone has to be watching failed
  `ReleaseHold` runs.
