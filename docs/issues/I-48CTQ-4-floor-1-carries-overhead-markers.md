---
id: I-48CTQ-4
status: done
implements: FS-48CTQ
blocked_by: []
labels: [ready-for-agent]
title: "FS-48CTQ § Change: Floor 1 carries overhead markers; no floor uses the target frame, slice 1: the table names no floor"
---
Implements FS-48CTQ §Change: Floor 1 carries overhead markers; no floor uses the target frame (24–27)

**Lane: AFK (game-client).** No game-server, proto, gateway or manifest change. No wire change.

## What to Build

Run floor 1 becomes an `overhead` floor: every living monster carries its name, level and health bar
over its head as on floor 2, the 1% demon its head plate, and no target frame shows there. The frame,
the last-hit hold, the engaged-boss latch and the per-floor table all stay; the table simply names no
floor. Frame-mode coverage stays alive through a table entry each test supplies itself.

Likely shape: `MARKER_MODES` becomes `{}`; the run scene reads the table through one replaceable
reference (default `MARKER_MODES`) so its frame tests can name a floor `frame`; the frame's scene
tests move onto that entry and floor 1 gains tests for plates shown and the frame hidden.

## Files expected to touch

- `game-client/src/render/creatures/markerMode.ts`, `markerMode.test.ts`
- `game-client/src/scenes/BarrowspireScene.ts` (the one reader of the table), `BarrowspireScene.test.ts`
- comments in any test that say floor 1 is `frame`

## Acceptance Criteria

- [x] `MARKER_MODES` names no world or floor; `markerMode` answers `overhead` for run floors 1, 2 and 3,
      a run with no floor, a field and the hub (24, 26).
- [x] A test adds one floor to a table of its own and `markerMode` answers `frame` there and `overhead`
      beside it (26).
- [x] Run scene, floor 1, shipped table: a living monster at full health shows its plate, as on floor 2
      (24).
- [x] Run scene, floor 1, shipped table: hovering a monster, striking one and an engaged boss each
      leave the frame hidden (25).
- [x] Run scene with a test's table entry naming a floor `frame`: no plate there, and every scene test
      of the original order still passes on that floor (26).
- [x] The roster's `frame` tests, `ui/targetFrame.test.ts` and `render/creatures/targetPick.test.ts`
      pass unchanged (26).
- [x] `render/markers/healthBar.ts` and its tests are untouched in the diff (27).
- [x] No game-server, proto or `ActionType` change in the diff.
- [x] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

None

## Spec Reference

FS-48CTQ §Change: Floor 1 carries overhead markers; no floor uses the target frame: 24–27, every
acceptance criterion but the owner's check, the Edge States.

## TDD Approach

- RED: `markerMode.test.ts` "should keep run floor 1 on overhead plates" and "should name no floor".
- GREEN: `MARKER_MODES` is `{}`.
- RED: `BarrowspireScene.test.ts` "should draw plates over floor 1's monsters and show no frame"
  (hover, strike, engaged boss).
- GREEN: follows from the table; then give the scene its table reference so the frame describe names
  its own `frame` floor and passes again.
