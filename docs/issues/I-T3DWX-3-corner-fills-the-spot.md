---
id: I-T3DWX-3
status: open
implements: FS-T3DWX
blocked_by: [I-T3DWX-1]
labels: [ready-for-agent]
title: "FS-T3DWX slice 3: the top-right HUD fills the fullscreen button's spot"
---
Implements FS-T3DWX §Change: The top-right HUD fills the button's spot

**Lane: AFK (agent).** game-client only.

## What to Build

- The button's footprint, `FullscreenButtonPlace`, `TOP_RIGHT_HUD` and every hand-off and
  take-back of the button's place go (G1).
- The enlarged map's name and readout close up to the map (G3).
- With the overlay up, the map mode icon takes the corner, the name stands left of it, and the
  column starts at y 31 (G4).
- With no map, the column starts at y 10 (G5).
- The guideline's map section and `CONTEXT.md` follow (G7).

## Acceptance Criteria

- [ ] Every acceptance criterion of the § Change but the owner's browser check, each named by a
      test or by the diff.
- [ ] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

I-T3DWX-1 (done)

## Spec Reference

FS-T3DWX §Change: The top-right HUD fills the button's spot, G1–G7, Acceptance Criteria, Edge
States.

## TDD Approach

- RED: `topRightColumn.test.ts`. In the overlay, the icon's box is at (W − 19, 10), the name's
  right edge at W − 25, and the escaped count at y 31. With no map the column starts at y 10.
  Enlarged, the name's right edge is at map.x − 6.
- GREEN: `topRightCorner`, `minimapModeIconPlace`, `minimapNamePlace` and `positionReadoutPlace`
  without the button. Then the plumbing goes.
