---
id: I-NXP1W-8
status: open
implements: FS-NXP1W
blocked_by: [I-NXP1W-4, I-NXP1W-7]
labels: [blocked]
title: "FS-NXP1W slice 8: step 2 ReleaseLosingHolds — forward and roll forward"
---
Implements FS-NXP1W §Requirements 9, 29, 38

**Author: human** (Nick)

## What to Build

One issue for this arm: its failure handling is just classification plus the shared helper from
slice 7.

- **Forward (wallet):** every `RESERVED` hold for a losing bid on the listing → `RELEASED`. Returns
  the released count. Input: listingId, winnerBidId, losing bidIds.
- **Roll forward:** holds already `RELEASED` count as already applied. Transient failures use the
  default tail policy and escalate and park through slice 7. No rollback: this is the tail.
- **Crash-point table** for this step.

## Acceptance Criteria

- [ ] Every losing hold ends `RELEASED`; the winning hold is untouched
- [ ] Re-running after success returns the same count and changes nothing
- [ ] Cap exhaustion parks through the slice 7 helper
- [ ] Crash-point table committed
- [ ] Use case tested without Temporal; `make test` green

## Blocked By

I-NXP1W-4 (the pivot), I-NXP1W-7 (the helper).

## Spec Reference

FS-NXP1W §Requirements 9 (classification), 29 (step 2), 38 (crash points); Edge States: wallet
down after the pivot. User story 7.
