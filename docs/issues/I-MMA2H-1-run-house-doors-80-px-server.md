---
id: I-MMA2H-1
status: done
implements: FS-MMA2H
blocked_by: []
labels: [ready-for-agent]
title: "FS-MMA2H slice 1: a run house's door is 80 px wide, from one named width (game-service)"
---
Implements FS-MMA2H §A, §B

**Lane: agent (AFK), by charter.** game-service is the human lane by default; the charter "門加寬"
opens the door-width constants and building generation only (FS-MMA2H §Bounds). Ships on one branch
with I-MMA2H-2: server at 80 with art at 50 leaves 15 px of open doorway beside the drawn door.

## Files owned

- `game-server/game-service/internal/game/session.go`: `CreateBuilding`'s call to `AddBuilding`
  only (the literal `50`), and the one definition of the width. No other logic.
- `game-server/game-service/internal/game/hub_map.go`: `hubDoorWidth`'s definition and comment
  only, so the hub reads the run door's width. **Its value stays 50 in this slice** if D1 is still
  open (the Inn's partition stands in an 80 px street gap): keep the hub on its own number until
  I-MMA2H-3, and say so in the comment. If D1 is answered first, do I-MMA2H-3 with this.
- Tests in `internal/game` (and `internal/systems/wall_index_test.go` if it mirrors the house).

## What to Build

The run door's width is written once (R2) and is 80 (R1). `CreateBuilding` passes that name. A run
house's door stays centred, 20 thick, with nothing else about it changed (R3, R4). No dungeon
parameter, interact range or keep-out code changes: the monster keep-out already reads each door's
own width (R6).

## Acceptance Criteria

- [ ] A run house of each size (300, 400, 500 wide) has an 80 x 20 door centred in its south wall
      and wall segments of 110, 160 and 210 px either side.
- [ ] `CreateBuilding` passes a named width; no non-test source in game-service holds a run door's
      width as a literal.
- [ ] On a floor of buildings (forced generation failure) no monster overlaps a door or a building.
- [ ] A delver in front of a run door, 40 px to either side of its middle, opens it;
      `DefaultInteractableRange` is unchanged.
- [ ] A dungeon floor's layout for a fixed seed is the same before and after.
- [ ] `go test ./...` in game-service passes.

## Blocked By

None. Blocks I-MMA2H-3.

## Spec Reference

FS-MMA2H §A R1-R6, §B R7; user stories 1, 2, 5, 6, 9, 10, 12.

## TDD Approach

- RED: a house built by `CreateBuilding` has a door whose width is 80 and whose south segments are
  equal and meet it.
- GREEN: the named width replaces the literal.
