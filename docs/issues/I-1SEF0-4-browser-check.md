---
id: I-1SEF0-4
status: open
implements: FS-1SEF0
blocked_by: [I-1SEF0-1, I-1SEF0-2, I-1SEF0-3]
labels: [blocked]
title: "FS-1SEF0 slice 4: Nick's browser check of the minimap's three modes (HITL)"
---
Implements FS-1SEF0 §Acceptance Criteria (whole FS), §User Stories 1–24

**Lane: HITL (Nick).**

## Files it expects to touch

- This issue file (ticks) and, on a pass, the FS's status flip by `spec-update`. No code.

## What to Check

- Floor 1, a dev build, 1080 and 1280 wide: M steps normal → enlarged → overlay → normal; the
  enlarged map crisp, the floor and escaped lines and x/y moved down with it; the overlay over the
  view, see-through, on your figure as you walk, clicks and attacks working through it, the HUD on
  top, the corner holding only the two lines with x/y under them.
- The tunables by eye: the overlay's scale (1/8), opacity (40%) and line (2 px).
- A refresh keeps the mode; a climb keeps it; a floor of buildings has no map and M does nothing.
- Spectating after death: the overlay on the watched teammate; Tab moves it.

## Acceptance Criteria

- [ ] Nick's look passes, or each finding is written back as an FS amendment or a new issue.

## Blocked By

I-1SEF0-1, I-1SEF0-2, I-1SEF0-3
