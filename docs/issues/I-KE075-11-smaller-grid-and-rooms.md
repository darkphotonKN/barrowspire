---
id: I-KE075-11
status: open
implements: FS-KE075
blocked_by: []
labels: [ready-for-agent]
title: "FS-KE075 slice 11: room variety: a 60×40 grid, rooms 4–8 × 4–7, 16–22 a floor, segments ≤ 12, halls ≥ 7×6 (game-service)"
---
Implements FS-KE075 §Change: Room variety (§K, R62–R67)

**Lane: agent (AFK), game-service (charter child B).**

## What to Build

`DungeonFloor1Params` to 60 × 40 cells, rooms 4–8 wide and 4–7 tall, 16–22 rooms, `SegmentMax` 12;
`HallMinWidth` 7, `HallMinHeight` 6; start room minimum 5×5 kept. Tests and comments that pin the old
numbers (72×48, 5760×3840, 18–28, 10×8, 16-cell segments, 8×6 halls) follow.

## Acceptance Criteria

- [ ] The 1,000-seed property test passes on every sealed-floor parameter set at the new values
- [ ] The golden layout is re-pinned; floor size tests read 4800×3200
- [ ] `go test ./...` in game-service passes

## Blocked By

None

## TDD Approach

- RED: the property test asserts 60×40, 16–22 rooms, ≤ 8×7, segments ≤ 12
- GREEN: the parameter values
