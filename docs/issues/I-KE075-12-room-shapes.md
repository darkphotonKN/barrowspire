---
id: I-KE075-12
status: open
implements: FS-KE075
blocked_by: [I-KE075-11]
labels: [blocked]
title: "FS-KE075 slice 12: room shapes: rectangle, L, cross, pillared, cut corners as cut cells in the room's rect (game-service levelgen)"
---
Implements FS-KE075 §Change: Room variety (§L, R68–R76)

**Lane: agent (AFK), game-service (charter child B).**

## What to Build

Each room draws a shape (R69–R71) after corridors and roles; the start, stairs, switch, escape door
and hidden rooms stay rectangles (R72). Cut cells leave the room's region and become shell where they
touch the floor; corridor-carved cells are never cut; pockets cut off from the centre are cut (R73).
The room's region is its floor (R74). The validator checks it all; the 1,000-seed property test is
extended to every shape (R76). Game side: a Weighted Plates seal takes rectangle rooms only (R75).

## Acceptance Criteria

- [ ] Every room's region equals its rect less its shape's cuts, carved cells kept, pockets cut
- [ ] Every shape comes up across 1,000 seeds; none on a room too small for it; fixed-role rooms rectangles
- [ ] Every room's centre cell is floor; every walkable cell reachable from the start
- [ ] Same seed, same shapes; golden re-pinned
- [ ] `plateRooms` returns rectangle rooms only; FS-5FZ4J's tests pass
- [ ] `go test ./...` in game-service passes

## Blocked By

I-KE075-11

## TDD Approach

- RED: `roomCuts` for each shape at a few sizes (table test), then the validator rejecting a region that is still the whole rect
- GREEN: the shape masks, the draw and the region build
