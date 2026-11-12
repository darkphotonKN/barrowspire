---
id: I-3EBCA-1
status: done
implements: FS-3EBCA
blocked_by: [I-R82NV-13]
labels: [ready-for-agent]
title: "FS-3EBCA slice 1: the corner row in the town: Menu, Character and Party icons with hover labels, the Mail slot reserved (game-client)"
---
Implements FS-3EBCA §A, §B (the town)

## What to Build

A pure `hudCornerLayout` (the four slots right to left, the hover label's place, the clearance
above the row) and a `HudCorner` drawing Menu, Character and Party on carved plates with their
glyphs and labels; the hub mounts it, presses wired to one Esc, the I/B toggle and the T toggle
under their guards, and re-places it on resize.

## Acceptance Criteria

- [x] FS-3EBCA acceptance criteria for the rects, the drawing, the labels and the Menu, Character and Party presses, in the town.
- [x] While the gear overlay is open no icon answers (R11).
- [x] Whole client vitest, `tsc --noEmit`, `npm run lint` pass.

## Blocked By

I-R82NV-13 (the Esc order the Menu icon presses)

## Spec Reference

FS-3EBCA R1–R8, R11, R12; stories 1–3, 6–9, 13–16.

## TDD Approach

- RED: `cornerIconFrames` at 1080 × 720 gives Menu (1006, 658), Character (940, 658), Party (874, 658), Mail (808, 658).
- GREEN: the layout, then HudCorner on a recording scene, then the hub's wiring.
