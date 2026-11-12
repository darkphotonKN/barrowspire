---
id: I-3EBCA-2
status: open
implements: FS-3EBCA
blocked_by: [I-3EBCA-1, I-1GZGD-12, I-G4VMQ-5]
labels: [ready-for-agent]
title: "FS-3EBCA slice 2: the corner row in fields and runs, Mail greyed there; the ability card and the leave button above the row (game-client)"
---
Implements FS-3EBCA §A, §B (fields and runs), §C

## What to Build

FieldScene and BarrowspireScene mount the row (Menu as one Esc, Character as I, Party as T, Mail
greyed), keep a press on it from the world, re-place it on resize; the ability card and the dead
spectator's leave button stand 70 px up, right-aligned with the row.

## Acceptance Criteria

- [ ] FS-3EBCA acceptance criteria for fields and runs: same rects, greyed Mail inert with "Mail · town only", presses, no attack under an icon, the card and button places.
- [ ] Whole client vitest, `tsc --noEmit`, `npm run lint` pass.

## Blocked By

I-3EBCA-1, I-1GZGD-12, I-G4VMQ-5

## Spec Reference

FS-3EBCA R1–R14; stories 5, 10–12.

## TDD Approach

- RED: the greyed Mail draws in `hudFaint`, has no hand cursor and answers no press; the ability card's corner in a run at 1080 × 720 is (1064, 650).
- GREEN: HudCorner's greyed icon, the scenes' wiring and the lifted placements.
