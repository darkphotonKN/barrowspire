---
id: I-NXP1W-11
status: open
implements: FS-NXP1W
blocked_by: [I-NXP1W-7, I-NXP1W-10]
labels: [blocked]
title: "FS-NXP1W slice 11: step 4 TransferItem — roll forward"
---
Implements FS-NXP1W §Requirements 9, 13, 38

**Author: human** (Kranti)

## What to Build

How the transfer survives failure. Once the buyer has paid, the item has to reach them; there is
no path back (ADR-0017).

- **Classification (Req 9):**
  - already applied: owner = buyer and status is not `PENDING_SETTLEMENT`, so return success
  - semantic impossibility: any other owner/status combination. After the pivot this is an
    invariant breach and must escalate and park, never fail (Req 13).
  - transient: items unavailable, deadline exceeded
- **Retry policy:** the default tail policy, escalating and parking through slice 7. Items may be
  down for hours; the settlement has to wait it out.
- **Crash-point table** for this step.

## Acceptance Criteria

- [ ] Re-running after success returns success and changes nothing
- [ ] An item with an unexpected owner or status escalates and parks; it is never overwritten
- [ ] Items being down past the cap parks the settlement, and it completes once items recovers
- [ ] Crash-point table committed
- [ ] `make test` green

## Blocked By

I-NXP1W-7 (the helper), I-NXP1W-10 (the forward step).

## Spec Reference

FS-NXP1W §Requirements 9, 13 (invariant breach after the pivot), 38; Edge States: items down for
hours after the pivot. User story 6. ADR-0017, ADR-0018.
