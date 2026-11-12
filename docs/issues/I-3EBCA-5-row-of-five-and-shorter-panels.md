---
id: I-3EBCA-5
status: open
implements: FS-3EBCA
blocked_by: [I-3EBCA-4]
labels: [ready-for-agent]
title: "FS-3EBCA slice 5: the row of five (Menu, Inventory, Character, Party, Mailbox), the panels stopping above it, the row answering while they are open (game-client)"
---
Implements FS-3EBCA §A R1–R3, R5; §B R7, R11, R12; FS-HRH2J §Change: Character and inventory apart (C12, C13)

## What to Build

`hudCornerLayout` places five plates (Mail moving to 742 at 1080, the envelope with it); `HudCorner`
draws the Inventory icon's bag and names "Inventory (I)" and "Character (C)"; the three worlds wire
Inventory to their I path and Character to their C path; `overlayLayout` ends both panels
`CORNER_ROW_CLEARANCE` above the bottom and `gearPanelLayout` picks the largest cell at which the
doll and all 30 cells fit; the row no longer asks the overlay whether it is covered, so it answers
while the overlay is open.

## Acceptance Criteria

- [ ] FS-3EBCA acceptance criteria 1–3, 5 and 9 as amended (five rects at 1080 and 1280, labels, the two presses, the row answering under the open overlay).
- [ ] FS-HRH2J § Change acceptance criterion 9 (the panels' extent, whole bag and stash grids).
- [ ] Whole client vitest, `tsc --noEmit`, `npm run lint` pass.

## Blocked By

I-3EBCA-4

## Spec Reference

FS-3EBCA R1–R3, R5, R7, R11, R12; FS-HRH2J § Change C12–C13.

## TDD Approach

- RED: the five rects at 1080 and 1280 (Mail at 742, the envelope's frame with it); the labels;
  a press on Inventory and on Character in each world toggles its own panel; with the inventory
  open a press on Inventory closes it and one on Character opens the character panel; the
  panels' rects at 1080 and 1280 end at 650 and miss every plate; 30 cells at 44 px without a
  scroll bar.
- GREEN: the layout constants, the bag glyph, the scenes' icon lists, the shorter panels.
