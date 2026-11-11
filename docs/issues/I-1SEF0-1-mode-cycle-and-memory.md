---
id: I-1SEF0-1
status: open
implements: FS-1SEF0
blocked_by: []
labels: [ready-for-agent]
title: "FS-1SEF0 slice 1: M cycles the minimap's three modes, remembered in the browser; the overlay mode clears the corner (game-client)"
---
Implements FS-1SEF0 §A, §D

## Files it expects to touch

- New `game-client/src/ui/minimapMode.ts` + test: the modes, the cycle, the stored mode's read and
  write (try/catch, unknown and `off` read as normal).
- `game-client/src/scenes/BarrowspireScene.ts` (`toggleMinimap` → a cycle, `minimapOn` → the mode,
  `resetRun`, `buildDungeonWalls`, `placeTopRightColumn`), `BarrowspireScene.test.ts` (the M and
  column tests that relied on M's off step).
- `game-client/src/ui/minimap.ts` (`setShown`/`shown` give way to the mode).

## What to Build

M steps normal → enlarged → overlay → normal, only where a minimap exists; the mode is read from
`localStorage` `barrowspire_minimap_mode` when a run scene starts and written on each press. In this
slice the enlarged mode still draws at normal size (slice 2) and the overlay mode draws nothing yet
(slice 3), but it already clears the corner: the column closes up and the readout stands under it.
The off step, `minimapOn` and the minimap's hide switch go.

## Acceptance Criteria

- [ ] FS-1SEF0 §Acceptance Criteria: the M cycle and its guards; M inert with no minimap; the
      stored mode (read, write, unknown, `off`, throwing storage); no `minimapOn` or hide switch;
      the column and readout in the overlay mode as for "no minimap shown".
- [ ] FS-56CKV's and FS-SRA9J's tests that pressed M to hide the minimap are rewritten to the
      overlay mode, each citing FS-1SEF0.
- [ ] Typecheck, lint and `npx vitest run --maxWorkers=4 --minWorkers=1` pass.

## Blocked By

None

## Spec Reference

FS-1SEF0 §A.1–§A.7, §D.21–§D.23; User Stories 1, 10–17, 21.

## TDD Approach

- RED: `nextMinimapMode("overlay")` is "normal"; `readMinimapMode` of a store holding "off" is "normal".
- GREEN: the module, then the scene cycling and storing it.
