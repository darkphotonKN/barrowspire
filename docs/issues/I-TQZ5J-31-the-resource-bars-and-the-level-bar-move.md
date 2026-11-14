---
id: I-TQZ5J-31
status: open
implements: FS-TQZ5J
blocked_by: [I-TQZ5J-30]
labels: [ready-for-agent]
title: "FS-TQZ5J batch 5, slice 2: the Health and resource bars and the level bar move into the UI scene"
---
Implements FS-TQZ5J §Change: Batch 5: the ability card, the potion cell and the HUD bars (R67–R69, R71–R73)

## What to Build

The field's and the run's `ResourceHud` and the town's and the run's `ProgressHud` drawn by the UI
scene's HUD slot from `hud({ kind: "bars" | "progress" })`; the level-up cue on the UI scene's tweens,
taken down with the world; a fresh bar per world visit, so a new world's first state raises no cue.

## Acceptance Criteria

- [ ] The bars at `RESOURCE_HUD_AT.field` / `.run`, the level bar at `PROGRESS_HUD_AT.hub` / `.run`.
- [ ] The cue once per rise; none on a new world's first state; a fading cue gone as the world leaves.
- [ ] No world scene imports `ResourceHud` or `ProgressHud` (bar helpers excepted where they only
      measure: `RESOURCE_HUD_AT`, `RESOURCE_HUD_W`).
- [ ] Full vitest, tsc, lint, lint:fence.

## Blocked By

I-TQZ5J-30

## TDD Approach

- RED: the slot draws the bars and the progress at each world's place, and builds a new bar after a
  leave (no cue on its first state).
- GREEN: the slot's two kinds; the worlds sending.
