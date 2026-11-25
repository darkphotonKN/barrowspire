---
id: I-48CTQ-5
status: done
implements: FS-48CTQ
blocked_by: [I-48CTQ-4]
labels: []
title: "FS-48CTQ § Change: Floor 1 carries overhead markers; no floor uses the target frame, slice 2: the owner's browser check (HITL)"
---
Implements FS-48CTQ §Change: Floor 1 carries overhead markers; no floor uses the target frame (the owner's check)

**Lane: HITL (Nick).** Restart the client only: no server change. No screenshots needed.

## What to Check

### Floor 1 reads as floor 2 (24)

- [ ] On floor 1 every living monster carries its name, level and health bar over its head before any
      hit, an elite's prefix set apart in the hostile accent.
- [ ] Hit one: the bar drops with its chip, and the plate stays.
- [ ] Climb to floor 2: the monsters' markers look the same as floor 1's.

### No frame on floor 1 (25)

- [ ] Hover a monster and strike one on floor 1: nothing appears at the top centre; the strike-mark
      cursor still shows on hover.
- [ ] Optional, with a dev seed for the floor-1 demon: it carries a head plate and takes no frame.

### A crowded room (Edge States)

- [ ] Stand in a full room on floor 1: are the overlapping plates acceptable? If not, say so here; a
      declutter rule is a new change, not part of this one.

## Note

I-48CTQ-3 (the frame's own browser check against the Diablo II reference) can no longer be played on
floor 1: no floor uses the frame now. The coordinator decides whether to close it.

## Blocked By

I-48CTQ-4

## Spec Reference

FS-48CTQ §Change: Floor 1 carries overhead markers; no floor uses the target frame: 24–27, Acceptance
Criteria, Edge States.
