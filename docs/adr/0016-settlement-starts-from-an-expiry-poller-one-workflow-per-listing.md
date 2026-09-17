# ADR-0016 — Settlement starts from an expiry poller, as one workflow per listing identified by the listing

Status: accepted
Date: 2026-09-17
Scope: `game-server/marketplace-service`
Builds on: [ADR-0011](0011-settlement-write-path-is-a-temporal-activity-per-owning-service.md)
Realized by: FS-NXP1W (draft)

## Context

Recorded without adversarial review.

A listing can reach settlement through three doors: its auction expires, the seller accepts the
current winning bid early (AcceptBid), or a buyer pays the buyout price. All three must produce
exactly one settlement. Two starts racing — the clock firing while the seller clicks accept — must
not settle twice.

Two trigger shapes were on the table:

- **A — a poller starts the workflow at expiry.** Marketplace scans for ACTIVE listings past
  expiry and starts settlement for each. Step 0 is the beginning of the workflow.
- **B — the workflow starts at listing creation and sleeps on a Temporal timer.** Step 0 is the
  middle of a long-lived workflow; one open workflow per live listing.

B looks like it removes a component, but it does not remove the problem that component solves.
Inserting the listing row and starting the workflow are two writes to two systems: if the row
commits and the start fails, that listing never settles, so B needs an outbox or a reaper anyway.
It also turns every live listing into an open workflow, so any change to workflow code must go
through Temporal versioning, and AcceptBid and buyout stop being *starts* and become *signals*
into an existing run.

## Decision

**A marketplace poller starts settlement for ACTIVE listings past expiry. The workflow ID is
`settlement-{listingId}`, started with `WorkflowIdReusePolicy: REJECT_DUPLICATE`.**

AcceptBid and buyout are additional starters of the same workflow ID. Every starter treats
"workflow already started" as success. The workflow ID is the dedup identity: whichever door
opens first wins, the others are no-ops.

`REJECT_DUPLICATE` (not Temporal's default, which permits reuse once the prior run closes) is
chosen because no listing ever legitimately settles twice — a settlement that cannot succeed ends
in a terminal state and is not re-run ([ADR-0018](0018-settlement-failures-are-classified-by-kind-and-park-rather-than-fail.md)).

Rejected: **B, workflow-per-listing from creation** — for the dual write, the versioning burden on
long-lived runs, and the trigger asymmetry above.

## Consequences

- **Concurrency guard for free.** Three doors, one run; the race between clock and seller is
  resolved by Temporal's ID uniqueness, before any domain code runs.
- **Self-healing from the database.** The poller derives work from listing state, so a missed tick
  or a crashed starter is repaired by the next tick. There is no dual write to lose.
- **Workflows are short-lived.** Changing workflow code rarely needs versioning, because few runs
  are open at any moment.
- **The poller must not re-pick failed settlements.** It selects ACTIVE only; a terminal
  `SETTLEMENT_FAILED` listing is invisible to it. A rollback that returned a listing to ACTIVE
  would loop forever — this is why ADR-0018 forbids that target.
- **Cost: settlement lags expiry by up to one tick.** Accepted; nobody is waiting on the second.
- **Cost: the workflow ID is irreversible.** It is baked into every history and every starter.
  Changing the scheme later means two schemes coexisting until old runs drain.
- **Cost: one more component in marketplace** — the poller — to operate and keep single-purpose.
