---
id: I-P0HSP-6
status: done
implements: FS-P0HSP
blocked_by: [I-P0HSP-1, I-P0HSP-2, I-P0HSP-3, I-P0HSP-4, I-P0HSP-5]
labels: [blocked]
title: "FS-P0HSP slice 6: Nick's browser check of the town's and fields' minimap (HITL)"
---
Implements FS-P0HSP §Acceptance Criteria (whole FS), §User Stories 1–29

**Lane: HITL (Nick).**

## Files it expects to touch

- This issue file (ticks) and, on a pass, the FS's status flip by `spec-update`. No code.

## What to Check

- The town at 1080 and 1280 wide, windowed and fullscreen: the whole town at once; the edge line open
  where the three roads leave; the three buildings solid with their doors showing; walking into a
  building, the map unchanged.
- The marks by eye: the tower (the Spire), the teleport marks (Forest, Meadows; the dev test room's
  in a dev build), the chest (stash) and the bag (Quartermaster) side by side; no mark at the Elder
  (Nick, 2026-11-12: he only tells a story). Should the Inn carry a neutral, non-amber mark?
- M through normal, enlarged and the overlay in the town and a field; the overlay's 1/8 in the town
  (300 × 150) by eye; the mode kept from a run into the town and back.
- A field: the map filling in round you as you walk, the radius (480 world px) by eye, the road home's
  mark appearing once seen, the Forest's trails between solid stands; leave and come back: the
  ground is still charted; another character starts blank.
- With the party panel open at 1080, an invite prompt over the map: still readable and answerable.
- Should roads be drawn on the map?

## Acceptance Criteria

- [x] Nick's look passes, or each finding is written back as an FS amendment or a new issue.

## Blocked By

I-P0HSP-1, I-P0HSP-2, I-P0HSP-3, I-P0HSP-4, I-P0HSP-5

## Owner approval

2026-11-12: the owner checked the town and field minimap in the browser and approved it ("小地圖可以").
