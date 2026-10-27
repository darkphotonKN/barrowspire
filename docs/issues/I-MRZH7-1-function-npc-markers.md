---
id: I-MRZH7-1
status: done
implements: FS-MRZH7
blocked_by: []
labels: [ready-for-agent]
title: "FS-MRZH7 slice 1: amber nameplate and sigil over function NPCs"
---
Implements FS-MRZH7 §Requirements 1–7

## What to Build
In the hub, every NPC with a non-empty `function` reads as a function NPC: its nameplate draws in
a new canvas marker ink, `palette.markerFunction` (amber), at 13 px, under a small amber lozenge
sigil outlined in the marker stroke ink. The sigil is a marker: it draws at the nameplate's depth
and is placed over the head every frame with it. Ambient NPCs keep the vellum 12 px nameplate and
no sigil. A placeholder-drawn function NPC keeps its brass body tint.

## Acceptance Criteria
- [ ] `palette.markerFunction` resolves to `BARROW_HEX.amber` and is listed in `MARKER_INKS`; the marker contrast test covers it.
- [ ] Function NPC nameplates draw in `markerFunction` at 13 px; ambient NPC nameplates are unchanged.
- [ ] A lozenge sigil (about 8×11 px, amber fill, `markerStroke` outline) sits centred above each function NPC's nameplate and moves with it.
- [ ] Ambient NPCs carry no sigil.
- [ ] A function NPC with no baked sheet keeps its brass body tint and gets the new marker.
- [ ] An NPC with an unknown non-empty function is still marked.
- [ ] `tsc`, the client test suite and the lint fence pass.

## Blocked By
None

## Spec Reference
FS-MRZH7 §Requirements 1–7: who counts, nameplate ink, readability floor, the sigil, ambient NPCs unchanged, body tint unchanged, name size. User stories 1–4, 6–8, 10, 11, 13. Edge states: unknown function, no baked art, nameplates overlap, dialogue open.

## TDD Approach
- RED: a marker test asserting `MARKER_INKS` contains a "function name" ink equal to `palette.markerFunction`, which does not exist yet; and a pure test that the function-NPC check marks any non-empty `function` and no empty one.
- GREEN: add the token, the ink entry and the predicate; then draw the nameplate and sigil in `HubScene.renderNPCs` / `placeMarker`.
