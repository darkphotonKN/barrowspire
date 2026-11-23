---
id: I-JS7C8-19
status: open
implements: FS-JS7C8
blocked_by: [I-JS7C8-18]
labels: []
title: "FS-JS7C8 slice 19: the owner approves the archer's sprint on the contact sheet, or names the fallback or a tune round (HITL)"
---
Implements FS-JS7C8 §Change: The archer's sprint and low-ready bow (R83, R86; D9)

**Lane: human (HITL).** The owner's ADR-0021 §5 gate. No code unless the owner asks for a tune
round; a tune round stays inside the charter (D9). It reworks I-JS7C8-16/17's values and re-bakes
through I-JS7C8-18's steps, then returns here.

## What to Check

For `char_archer_base`, `char_archer_hunter` and `char_archer_shadow_ranger`: the new run beside
main's, 8 facings, at game scale and ×2, and the animated preview (the paths are recorded in
I-JS7C8-18):

- The run reads as a dash, not easy: the trunk about 20° forward, the head looking ahead, a
  quicker, shorter stride with knee drive and heel kick, the flight and bounce no softer than
  today's.
- The bow is held ready: both hands in front, between the belly and the lower chest, not raised
  high; the bow about 45°, its upper tip under the head; the side it is canted to; no arrow.
- Nothing pokes through: no leg or boot through the tunic or cloak, the bow clear of the legs, the
  cloak and the quiver.
- The atlas report (I-JS7C8-18).

## Acceptance Criteria

- [ ] The owner approves, in his words, recorded below with the date.
- [ ] Or the owner names the fallback (R86: today's cadence and stride, the posture alone): it is
      recorded, built through I-JS7C8-16's and I-JS7C8-18's steps, and returned here.
- [ ] Or the owner names a tune: each round recorded, re-baked, returned here.

## Blocked By

I-JS7C8-18

## Spec Reference

FS-JS7C8 §Change: The archer's sprint and low-ready bow: D2's fallback, D9; R83, R86; the
Acceptance Criteria's "HITL: The owner approves".

## Files it expects to touch

None (a tune round touches I-JS7C8-16/17/18's files).
