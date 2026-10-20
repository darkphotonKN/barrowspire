---
id: I-49Z37-4
status: done
implements: FS-49Z37
blocked_by: []
labels: [ready-for-agent]
title: "FS-49Z37 slice 4: after a sale, \"Sold — settling\" and no actions"
---
Implements FS-49Z37 §Requirements 18–19

**Author:** unassigned

## What to Build

- `listingStatusLabel`: `PENDING_SETTLEMENT` reads `Sold — settling`, on every status label. An
  `ACTIVE` listing past its end keeps `Ended — awaiting settlement`; `SETTLEMENT_FAILED` keeps its
  label.
- The detail's action area offers no bid box once the listing is not `ACTIVE` or has ended (and is
  the single place I-49Z37-5/6 add Buy out and Accept to, under the same rule).

## Acceptance Criteria

- [ ] `PENDING_SETTLEMENT` → `Sold — settling` everywhere a status label shows.
- [ ] Not `ACTIVE` or ended → no bid box on the detail.
- [ ] Existing labels for other statuses unchanged.
- [ ] Tests pass; lint and typecheck pass.

## Blocked By

None

## Spec Reference

FS-49Z37 §Requirements 18–19; §User Stories 17, 22; §Acceptance Criteria "PENDING_SETTLEMENT reads…".

## TDD Approach

- RED: `listingStatusLabel({status: "PENDING_SETTLEMENT"})` is `Sold — settling`.
- RED: the action-area chooser answers "none" for a non-`ACTIVE` or ended listing.
