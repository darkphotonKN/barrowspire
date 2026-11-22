---
id: I-04EEA-3
status: done
implements: FS-04EEA
blocked_by: [I-04EEA-1]
labels: [blocked]
title: "FS-04EEA slice 3: the mage blinks toward the cursor, never through a wall"
---
Implements FS-04EEA §D

**Author: agent**

## What to Build

`cast_skill {skill_id: "blink"}` from a mage who has the tree ability moves them up to 180 px
toward the target point on the tick it resolves, stopping at the first thing that blocks a walk.

- Add a Blink row to `attackTable` (`internal/systems/combat.go`): cost 30 (mana), cooldown 8 s,
  `slows: true`, a new delivery for an instant move (R5, R18).
- **The landing (R18, R19).** Distance = min(180, |target − mage|). Along the straight line, the
  mage lands at the farthest point their body (`constants.PlayerRadius`) reaches without
  crossing a wall, a closed door, the world's edge or, on a dungeon floor, a non-walkable cell.
  The first blocker ends it, even with open ground beyond. The test must be continuous, not
  sampled: reuse the MovementSystem's swept wall test (`wallIndex.sweepX/sweepY` or `SweptX`) and
  the floor's nav grid (`navigation.Grid.Clear` / `Cell`) rather than stepping in fixed
  increments. The CombatSystem does not hold the walls or the grid today; pass in what it needs
  where the systems are built.
- Bodies do not block (R20). The ordinary body collision separates an overlap on later ticks.
- **Nowhere to go (R21).** A zero distance, or a body that cannot move at all along the line:
  nothing happens, nothing is spent, no cooldown.
- **Not a dash (R22).** No `DashComponent`, no Ashwalk trail, nothing carried over later ticks.

## Acceptance Criteria

- [ ] A mage with the node, 30+ mana and off cooldown, target 300 px away in open ground, lands 180
      px along the line on the resolving tick; target 100 px away, lands on it; 30 mana spent, 8 s
      cooldown.
- [ ] A wall 120 px along the line: the mage lands against its near side, and never beyond it, for a
      wall thinner than any tick step too. The same for a closed door and the world's edge.
- [ ] On a dungeon floor, rock 120 px along the line stops the mage before it.
- [ ] An open door does not block.
- [ ] A monster or a delver on the line does not block.
- [ ] Target under the mage, or a wall at their edge on the line: no move, no mana, no cooldown.
- [ ] No `DashComponent` is added and an Ashwalk wearer lays no trail.
- [ ] Not a mage, or no node: nothing happens.
- [ ] I-04EEA-1's exported tree-ability cost read answers 30.
- [ ] `go test ./...` and `golangci-lint run` pass in `game-server/game-service`.

## Blocked By

I-04EEA-1 (the kinds, aliases and the gate).

## Spec Reference

FS-04EEA §A R4–R6, §D R18–R22; §User Stories 8–11; §Acceptance Criteria "game-service" (Blink
rows); §Edge States "Blink at the target under the mage", "Blink pressed into a corner", "Blink
onto stairs or an escape zone", "Blink through an open door", "Blink in a field".

## Files expected

- `game-server/game-service/internal/systems/combat.go`
- `game-server/game-service/internal/systems/blink_test.go` (new)
- `game-server/game-service/internal/systems/wall_index.go` (only if a segment test is added there)
- `game-server/game-service/internal/navigation/grid.go` (only if a segment test is added there)
- `game-server/game-service/internal/game/session.go` (handing walls or the grid to the CombatSystem)

## TDD Approach

- RED: `blink_test.go`, a mage at (100, 100) blinking at (400, 100) with a 4 px-thick wall at
  x = 220 lands with their body against x = 220 and never past it.
- GREEN: the row, the instant-move delivery, the swept landing.
