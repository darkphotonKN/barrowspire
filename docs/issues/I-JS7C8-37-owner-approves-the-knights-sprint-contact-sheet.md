---
id: I-JS7C8-37
status: open
implements: FS-JS7C8
blocked_by: [I-JS7C8-34]
labels: []
title: "FS-JS7C8 slice 37: the owner approves the knight's sprint on the contact sheet, or names a tune round (HITL)"
---
Implements FS-JS7C8 §Change: The knight's sprint, and the attack-on-the-move clips retired (R153; K6)

**Lane: human (HITL).** This is the owner's ADR-0021 §5 gate. No code unless the owner asks for a
tune round. A tune round stays inside this change: it reworks I-JS7C8-33's values, re-bakes through
I-JS7C8-34's steps, then returns here. **Nothing waits on this issue** (K6). The retirement
(I-JS7C8-35) and the browser check (I-JS7C8-38) go ahead.

## What to Check

For `char_knight_base`, `char_knight_guardian` and `char_knight_berserker`: the new run beside
`23717cbb`'s, in 8 facings, at game scale and ×2, with the animated preview and the ×4 details. The
paths are recorded in I-JS7C8-34. Check that:

- The run reads like the others' sprint: the trunk about 20° forward and the quicker cadence. His
  knee drive and heel kick are the shared fast run's, not the sprint's (E1 option (a), or the
  coordinator's pick).
- The blade is carried raised as before, 23–42° above level, the wrist taking back the lean. The
  sword hand at the front of the pump sits a little under the chest. The shield is held up before
  him.
- The Berserker's axes are carried forward and down, the edges never turned up.
- Nothing pokes through: no leg through the hauberk, the surcoat or the cloak, the hauberk's back
  over the calf on keys 1 and 5.
- The frame box and atlas report (I-JS7C8-34).

## Acceptance Criteria

- [ ] The owner approves, in his words, recorded below with the date.
- [ ] Or the owner names a tune: each round recorded, re-baked, and returned here.

## Blocked By

I-JS7C8-34

## Spec Reference

FS-JS7C8 §Change: The knight's sprint, and the attack-on-the-move clips retired: K2, K6; E1; R146, R147, R153; the Acceptance Criteria's "HITL: The owner approves".

## Files it expects to touch

None (a tune round touches I-JS7C8-33/34's files).
