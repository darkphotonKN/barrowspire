---
id: I-84N1G-3
status: open
implements: FS-84N1G
blocked_by: [I-84N1G-1]
labels: [ready-for-agent]
title: "FS-84N1G slice 3: the controls panel opens by itself as the player first sees a run's first floor"
---
Implements FS-84N1G §Requirements A (R1, R2, R12)

**Lane: AFK (agent).** game-client only.

## What to Build

- The bridge gains `runBegun()`. The run sends it once a start, on an arrival whose first named floor is
  floor 1, once the arrival card has gone (R1).
- The UI scene opens the controls panel on it, silently, unless it is open, the menu slot is filled or
  the run has ended (R2).

## Acceptance Criteria

- [ ] An arrival on floor 1: `runBegun()` once, after the card; a return, a later first floor, a climb: never.
- [ ] The panel opens on it with no sound and no other window closed; refused under the menu or after the end.
- [ ] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

I-84N1G-1.

## Spec Reference

FS-84N1G R1, R2, R12; Edge States.

## TDD Approach

- RED: the controls slot's `runBegun` opens it silently; the run's update sends `runBegun` once after the card.
- GREEN: the bridge call, the run's due flag, the slot's open.
