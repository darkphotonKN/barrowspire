---
id: I-NXP1W-9
status: in-progress
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

- [x] The seller is credited exactly once per settlement
- [x] A second credit for the same (workflow ID, activity name) is rejected by the dedup and returns the same output
- [ ] Cap exhaustion parks through the slice 7 helper — **wired, unproven until I-NXP1W-7**: outage errors stay retryable and invariant breaches are non-retryable `CreditSellerImpossible`, but the park itself is the workflow helper slice 7 builds
- [x] Crash-point table committed
- [x] Use case tested without Temporal; `make test` green

## Implementation notes

- **Dedup decision:** a new `processed_activities` table keyed on the caller-minted
  `idempotency_key TEXT` (workflow ID + activity name, ADR-0009), not a widened
  `processed_events`. Widening `event_id` to TEXT would loosen the inbox for every broker-event
  consumer. Reasoning is in `migrations/000008_create_processed_activities.up.sql`.
- **Implemented ahead of its blocker:** built while I-NXP1W-7 was still open, at the user's request.
- Crash-point table: `game-server/wallet-service/docs/crash-points/credit-seller.md`.

## Blocked By

I-NXP1W-4 (the pivot), I-NXP1W-7 (the helper).

## Spec Reference

FS-NXP1W §Requirements 9, 23 (dedup), 30 (step 3), 38; Edge States: wallet down after the pivot.
User story 4. ADR-0005.
