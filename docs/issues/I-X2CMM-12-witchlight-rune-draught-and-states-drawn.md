---
id: I-X2CMM-12
status: open
implements: FS-X2CMM
blocked_by: ["I-X2CMM-3", "I-X2CMM-4", "I-X2CMM-6", "I-X2CMM-7", "I-X2CMM-10"]
labels: [ready-for-agent]
title: "FS-X2CMM slice 12: witchlights lift the fog, and runes, draughts and the four delver states are drawn for every viewer"
---
Implements FS-X2CMM §I

**Author: agent**

## What to Build

- **Witchlight (R47, R48).** A soft warm globe that bobs and drifts a little around its point,
  with a light pool (`LightMap` transient lights). The exploration (`exploration.ts`) gains lit
  points with a radius: the cells within 3 cells of each witchlight count as seen for every viewer
  and stay explored.
- **Rune:** a madder ring on the floor that pulses and flashes when it catches (a monster in it goes
  `stunned`).
- **Draught:** a small stoppered flask on the floor, reachable with the existing interact key and
  hint.
- **States:** afloat (lifted a little, a soft shadow below), hardened (a dull bronze sheen), long
  night (a dark ring at the feet), tracker's eye (a faint ochre ring), draught healing (a faint
  verdigris rise). Tokens only; motion per the design guideline.

## Acceptance Criteria

- [ ] A witchlight in the state is drawn and lifts the fog within 3 cells for every viewer.
- [ ] Runes, draughts and the four states draw from the state and go when it does.
- [ ] A player can drink a draught with the interact key.
- [ ] Client suites green.

## Blocked By

I-X2CMM-3, I-X2CMM-4, I-X2CMM-6, I-X2CMM-7, I-X2CMM-10

## Spec Reference

FS-X2CMM §I R47–R48

## TDD Approach

- RED: exploration treats a witchlight's cells as seen.
- GREEN: the lit points, the effect renderers.
