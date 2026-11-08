---
id: I-VHGE7-5
status: done
implements: FS-VHGE7
blocked_by: []
labels: [ready-for-agent]
title: "FS-VHGE7 slice 5: design guideline amendment: the blood-hide clause and the claw's flame (game-client docs, rule change)"
---
Implements FS-VHGE7 §E (Requirement 35)

**Author: agent. HITL flag:** this changes an art rule. Flag the wording to the owner in the
report. The charter approves the red demon, and this slice writes the rule it needs.

## What to Build

In `game-client/docs/design-guideline.md` "Enemy design language", beside the green-hide clause:

1. A **blood-hide clause (bosses only)**: a dark, desaturated oxblood hide mixed from `BARROW`
   oxblood toward charcoal and umber, never brighter or more saturated than oxblood, shaded off
   the knight's heraldic oxblood so it is never read as a player's red. Emissives stay ember red
   and must still read against it. Dated, "Amended at the owner's approval of FS-VHGE7,
   2026-11-08".
2. A line making the "never a player's heraldic red" materials rule point at that exception.
3. A line naming the demon fire claw's flame trail and flash as a hostile effect from the ember
   family, never amber.
4. If `docs/theming_plan.md` tracks guideline amendments, add the status line there.

## Acceptance Criteria

- [ ] The clause, the cross-reference and the effect line are in the guideline, dated, and contradict no existing clause.
- [ ] The owner has been flagged on the wording. That is the integrator's report, not a blocker on this file.

## Files expected to touch

- `game-client/docs/design-guideline.md`
- `docs/theming_plan.md` (only if it tracks amendments)

## Blocked By

None

## Spec Reference

FS-VHGE7 §E R35; User Story 24.
