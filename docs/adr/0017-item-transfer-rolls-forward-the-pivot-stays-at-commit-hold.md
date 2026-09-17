# ADR-0017 — Item transfer rolls forward; the settlement pivot stays at CommitHold

Status: accepted
Date: 2026-09-17
Scope: `game-server/marketplace-service`, `game-server/items-service`, `game-server/wallet-service`
Builds on: [ADR-0010](0010-the-ledger-is-appended-past-the-saga-pivot.md) — its pivot definition is unchanged
Realized by: FS-NXP1W (draft)

## Context

Recorded without adversarial review.

ADR-0010 put the settlement pivot at the winning hold's commit and the buyer's debit. The draft
saga nonetheless gave step 4, `TransferItem`, a compensation arm: `ReverseCommit`, a new verb
driving the hold to a terminal `REVERSED` state and refunding the buyer. That made TransferItem
the only compensable step in the post-pivot tail, contradicting the tail's own definition. The
draft also paired it with a ledger reversal, which was doubly wrong — the ledger append is step 5,
after step 4, and ADR-0010 removed reversals.

The deciding question: **items-service is down for six hours and the buyer's gold is already
committed. Refund, or keep retrying?**

What makes "keep retrying" safe is step 0b. `FreezeItem` moves the item to `PENDING_SETTLEMENT`
with a predicate on both `LISTED` and the seller's ownership, before the pivot. Past that point
nothing else can move the item, so TransferItem has no semantic failure left — only transient
ones. A step that can only fail transiently belongs in a roll-forward tail.

## Decision

**TransferItem is a roll-forward tail step with no compensation. The pivot stays at CommitHold,
exactly as ADR-0010 defines it. `ReverseCommit` and the `REVERSED` hold state are not built.**

A prolonged items outage is handled by the escalate-and-park mechanism of
[ADR-0018](0018-settlement-failures-are-classified-by-kind-and-park-rather-than-fail.md), not by
refunding.

Rejected: **refund the buyer** — cap step 4, then run `ReverseCommit`. More code, a second hold
state machine path to test, and it converts an operational outage into a cancelled sale.

## Consequences

- **The post-pivot tail is uniform.** Steps 2–6 all roll forward; there is no compensation arm
  anywhere past the pivot.
- **The wallet hold state machine stays three states** (`RESERVED`, `COMMITTED`, `RELEASED`).
- **The freeze at 0b is load-bearing.** Its owner predicate is what removes TransferItem's semantic
  failure modes. Anything that can unfreeze a `PENDING_SETTLEMENT` item — notably marketplace's
  stale-reservation reconciler — must treat it as live, or this decision's premise breaks.
- **Cost: a buyer can sit with committed gold and no item for as long as items-service is down.**
  Accepted as the escrow shape of the settlement; the parked workflow keeps it visible.
- **Cost: no automated refund path exists.** Refunding a committed settlement, if ever needed, is a
  new verb and a new ADR.
