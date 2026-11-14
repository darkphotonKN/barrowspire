---
id: I-TQZ5J-16
status: done
implements: FS-TQZ5J
blocked_by: [I-TQZ5J-15]
labels: [ready-for-agent]
title: "FS-TQZ5J phase 3, slice 4: the party frames lowest, every window over them, B1's transitional state ended"
---
Implements FS-TQZ5J §Change: Phase 3: the gear, the container view, the settlement record and the controls panel (R59, R60, R62, R63)

**Lane: AFK (agent).** game-client only.

## What to Build

- The party frames at 999, under every other UI piece (R62).
- A test of the order: every window's ground and objects over the frames; a press, a hover or the
  wheel over a frame under a window reaches only the window, not Travel, not the world (R63).
- B1's transitional edge state is gone: no hidden cell lights, tips, scrolls or moves under a frame.

## Acceptance Criteria

- [x] The frames draw under the corner row, the prompts, the notice line and every window.
- [x] Over a frame under the gear overlay, the container view, the controls panel or the record, a
      press, a hover and the wheel reach only the window.
- [x] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

I-TQZ5J-15.

## Spec Reference

FS-TQZ5J §Change: Phase 3 (R59, R60, R62, R63); Amendment B1's edge state; ADR-0086 D4, Consequences.

## TDD Approach

- RED: the frames' depth is under every other piece's; a press over a frame under a window's ground
  hits the ground first (Phaser's sort by the render list).
- GREEN: the frames' depth.
