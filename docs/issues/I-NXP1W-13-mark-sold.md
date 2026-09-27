---
id: I-NXP1W-13
status: open
implements: FS-NXP1W
blocked_by: [I-NXP1W-4, I-NXP1W-7]
labels: [blocked]
title: "FS-NXP1W slice 13: step 6 MarkSold — forward and roll forward"
---
Implements FS-NXP1W §Requirements 9, 13, 33, 38

**Author: human** (Kranti)

## What to Build

One issue for this arm: it's one conditional write, and its only special failure is an invariant
breach, which goes to the shared helper.

- **Forward (marketplace):** `PENDING_SETTLEMENT → SOLD`, conditional on status. The existing
  `MarkSoldListingUC` is find-then-save with retries, so rework it as a conditional write.
- **Roll forward:** a `SOLD` listing is already applied. Zero rows updated with any other status
  is an invariant breach that escalates and parks through slice 7; it never overwrites. Transient
  failures use the default tail policy.
- **Crash-point table** for this step.

## Acceptance Criteria

- [ ] The listing ends `SOLD`; re-running after success changes nothing
- [ ] A listing in any status other than `PENDING_SETTLEMENT` or `SOLD` escalates and parks, and is not overwritten
- [ ] Crash-point table committed
- [ ] Use case tested without Temporal; `make test` green

## Blocked By

I-NXP1W-4 (the pivot), I-NXP1W-7 (the helper).

## Spec Reference

FS-NXP1W §Requirements 9, 13, 33 (step 6), 38; Edge States: MarkSold finds a
non-PENDING_SETTLEMENT listing.

## Carried from the listing-status audit

`MarkSold()` and the FSM currently contradict each other, so the rework above is not just
find-then-save → conditional write:

- `MarkSold()` guards on `status == ACTIVE` (it was `LISTED` before migration 000005) and then
  assigns `SOLD` directly, bypassing `transitionTo`.
- `listing_fsm.go`'s table allows `PENDING_SETTLEMENT → SOLD` and does **not** allow
  `ACTIVE → SOLD`.

Req 33 wants the FSM's version: `PENDING_SETTLEMENT → SOLD`. So the guard is the part that is
wrong, and going through `transitionTo` would have caught it. `MarkSold` also still requires
`endsAt` to have passed and re-validates `soldPrice` — decide which of those settlement still
owns once the winning bid is the source of the price.
