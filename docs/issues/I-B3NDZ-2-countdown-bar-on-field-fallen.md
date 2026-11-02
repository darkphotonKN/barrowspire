---
id: I-B3NDZ-2
status: in-progress
implements: FS-B3NDZ
blocked_by: [I-B3NDZ-1]
labels: [ready-for-agent]
title: "FS-B3NDZ slice 2: the countdown bar on the field's fallen state (game-client)"
---
Implements FS-B3NDZ §Requirements 12, 14

**Lane: agent (AFK).** No server change.

## What to Build

- `FallenCountdown.fraction(now)`: 1 at the fall, 0 at `FIELD_RISE_MS` and after, none while
  standing.
- A pure `fallenFrame(canvasWidth, canvasHeight)`: a centred panel, the line, the number below it,
  and the bar along its foot (`countdownBarRect`).
- `fallenCopy` drops the number from the sentence ("You have fallen. You rise at the road home.");
  the number is the shared seconds element.
- `FieldScene` draws the fallen state as that panel (charcoal ground as today), the line, the
  18 px number, and the shared bar, redrawn each `update`; taken down on rising and on release.

## Acceptance Criteria

- [ ] `FallenCountdown.fraction` per FS-B3NDZ §Acceptance Criteria; `count` unchanged (3-2-1, holds
      at 1).
- [ ] `fallenFrame` is centred, the bar is `countdownBarRect(panel)`, and line and number sit above
      the bar inside the panel.
- [ ] The field shows the line, "3s" and the bar on the fall; the number counts down and the bar
      narrows on later frames; all of it goes on rising and on release.
- [ ] No loss copy, no result card (FS-X2F2H R58 unchanged).
- [ ] `vitest` green; `tsc --noEmit` clean; lint fence passes.

## Blocked By

I-B3NDZ-1 (the shared module)

## Spec Reference

FS-B3NDZ §Requirements 12, 14; §User Stories 8, 9; §Acceptance Criteria (FallenCountdown fraction,
fallen panel); §Edge States (late rise).

## Files expected to touch (game-client/src)

- `scenes/fieldFallen.ts` (+ `scenes/fieldFallen.test.ts`)
- `scenes/FieldScene.ts` (+ `scenes/FieldScene.test.ts`)

## TDD Approach

- RED: `fraction(1500)` after a fall at 0 is 0.5; `fallenFrame` bar is at the panel's foot; the
  field test sees "3s" and a bar whose width falls between frames.
- GREEN: the method, the frame, the scene's panel and bar.

## Charter run (2026-11-02)

Built by a /develop child (TDD), two-axis review: ready to merge. Browser check pending: the fallen panel's track against its charcoal ground. Optional follow-up: a FallenPanel module out of FieldScene.
