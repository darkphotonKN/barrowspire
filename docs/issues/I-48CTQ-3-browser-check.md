---
id: I-48CTQ-3
status: open
implements: FS-48CTQ
blocked_by: [I-48CTQ-1, I-48CTQ-2, I-KE075-6]
labels: []
title: "FS-48CTQ slice 3: Nick's browser check of the floor-1 target frame against the Diablo II reference (HITL)"
---
Implements FS-48CTQ §Acceptance Criteria (whole FS), §User Stories 1–14

**Lane: HITL (Nick).**

## What to Build

Nick plays floor 1 on the branch (with a second browser as a teammate) and judges the frame against his reference point, Diablo II's hover-or-attack top-centre name and bar, in the game's own chrome. A floor-1 demon can be forced with a dev seed for the boss check.

## Files (expected)

- none (check only); findings go back into this issue

## Acceptance Criteria

- [ ] No plates over floor-1 monsters; pointing at one shows its name, level and bar at the top centre
- [ ] After hitting a monster and moving the pointer away, the frame keeps it and lets go about 3 s after the last hit
- [ ] An elite's prefix stands out by colour
- [ ] A teammate's fight does not take my frame
- [ ] The demon, once engaged, holds a wider frame
- [ ] The frame never covers the fullscreen button, floor indicator, minimap or notices
- [ ] Floors 2 and 3 still show plates over every monster

## Blocked By

I-48CTQ-1, I-48CTQ-2, I-KE075-6

## Spec Reference

FS-48CTQ as a whole.
