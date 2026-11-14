---
id: I-TQZ5J-50
status: open
implements: FS-TQZ5J
blocked_by: []
labels: [ready-for-agent]
title: "FS-TQZ5J batch 6, slice 1: the run's end row re-laid off the chat window (WATCH, LEAVE, SETTLEMENT)"
---
Implements FS-TQZ5J §Change: Batch 6: the end row and the chat (R120–R124, R136)

## What to Build

The run's buttons (the bottom-centre row, the dead player's card, the dead spectator's corner LEAVE) read
WATCH, LEAVE and SETTLEMENT in 13 px bold letter-spaced 1, each as wide as its label plus 24 a side. The
row stands left to right 8 apart, centred unless that comes within 12 of the open chat window, then from
x 442 (`resolvedRow.ts`: a pure placement from the widths and the view). The card's buttons centred on the
card 8 apart; the corner LEAVE keeps its right edge.

## Acceptance Criteria

- [ ] The labels, type and widths (R120–R122), one button rule for row, card and corner.
- [ ] The row's placements at 1080 and 1280 for every set of buttons (R123), whole px.
- [ ] A test: at every logical width 1080–1280, with 1, 2 or 3 buttons, the row meets neither the open
      chat window nor its open list (R123, R136).
- [ ] The card and the corner keep their places; `recordAnchor` unchanged (R124).
- [ ] Full vitest, tsc, lint, lint:fence.

## Blocked By

None

## TDD Approach

- RED: `resolvedRow.test.ts`: the row's left edges at 1080 and 1280; the sweep that it never meets the
  window; `BarrowspireScene.test.ts`: the labels and the button widths.
- GREEN: `rowPlace` in `resolvedRow.ts`, `worldButton` sized by its label, `syncRow`, `cardButton`,
  the corner place.
