---
id: I-56CKV-11
status: open
implements: FS-56CKV
blocked_by: [I-56CKV-10]
labels: [blocked]
title: "FS-56CKV change: the owner's look at the enlarged minimap's name and coordinates inside the map (HITL)"
---
Implements FS-56CKV §Change: The enlarged map keeps its labels inside (Owner's look)

**Lane: HITL (Nick).** Restart the client only. No server change.

## What to Check

- [ ] In the run (dev build), press M to the enlarged map: the floor's name in the map's
      top-right, the X/Y readout in its bottom-right, each where it stands on the normal map.
- [ ] The same in the town and a field (the name only; they have no readout).
- [ ] Windowed and fullscreen.
- [ ] Hover a monster, and meet a boss: the target frame leaves the name and the readout shown.
- [ ] Normal and overlay modes look as before.

## Blocked By

I-56CKV-10

## Spec Reference

FS-56CKV §Change: The enlarged map keeps its labels inside, Acceptance Criteria (Owner's look).
