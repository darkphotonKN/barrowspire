---
id: I-1GZGD-12
status: done
implements: FS-1GZGD
blocked_by: [I-3EBCA-1]
labels: [ready-for-agent]
title: "FS-1GZGD change slice: the envelope toggles the letter panel, stands in the corner row's Mail slot and names itself \"Mailbox\" (game-client)"
---
Implements FS-1GZGD §Change: The envelope toggles the letter panel and stands in the corner row

## What to Build

`envelopeFrame` returns the corner row's Mail slot; a press on the envelope with the panel open
closes it; under the pointer it shows the row's "Mailbox" label.

## Acceptance Criteria

- [x] FS-1GZGD § Change acceptance criteria, all five.
- [x] Whole client vitest, `tsc --noEmit`, `npm run lint` pass.

## Blocked By

I-3EBCA-1 (the row's layout and label)

## Spec Reference

FS-1GZGD § Change C1–C3.

## TDD Approach

- RED: `envelopeFrame` at 1080 × 720 is (808, 658, 58, 46); a press on the envelope with the panel open closes it.
- GREEN: the layout call and the envelope's press and hover.
