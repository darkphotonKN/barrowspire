# ADR-0062 — On a dungeon floor, monsters move by A* paths on the floor's cell grid, 8-connected without corner cutting, repathing at most every 0.5 s

Status: accepted
Date: 2026-11-06
Scope: `game-service` monster AI on dungeon floors (floor 1 today). Floors 2–3, the hub and the
fields keep today's straight steer.
Specified by [FS-KE075](../specs/KE075-floor-1-dungeon.md) §D.
Amends: none. [FS-77AB6](../specs/77AB6-monsters-and-combat.md) (shipped) left pathfinding out of
scope; FS-KE075 brings it in for floor 1. Its wander → chase → attack states, distance-only aggro,
leash and wind-up stand.
Related: [ADR-0061](0061-floor-layout-conventions-later-floors-follow.md) (the cell grid).

## Context

Decided in the charter Nick approved on 2026-11-06 ("核准"), decision A8, with his later
constraint "floor 1 only". Recorded without adversarial review: no `challenge-me` pass. Kept as
its own ADR rather than a clause of ADR-0061 because it carries its own cost (CPU per tick) and
its own behaviour change, and a later navigation change (flow fields, line of sight) should be
able to supersede it without touching the layout conventions.

Forces:

- **Today a chasing monster steers straight at its target** and a wall body-blocks it
  (`monster_ai.go:200-206`). On a floor of rooms and corridors that leaves most monsters pressed
  against rock.
- **The floor is already a grid** of 80 px walkable cells (ADR-0061), at most a few thousand nodes
  (72×48 = 3,456).
- **Up to ~70 monsters** on a floor, a 30 Hz tick with a 33 ms budget.
- **Bodies are 20 px in radius** and corridors at least 2 cells (160 px) wide.
- **References.** Octile distance is the admissible heuristic for 8-direction grids with costs 1
  and √2 (Amit Patel, "Heuristics"). A diagonal step that skips a blocked orthogonal cell cuts a
  wall's corner; PathFinding.js's `OnlyWhenNoObstacles` allows a diagonal only when both
  orthogonal cells are walkable.

## Decision

1. **The navigation graph is the floor's walkable cells.** Bodies are not obstacles to a path;
   collision stays the movement system's.
2. **A*, 8-connected, no corner cutting**: a diagonal step only when both orthogonal cells it
   passes are walkable. Costs 1 and √2, octile heuristic, deterministic tie-break.
3. **A path is a list of cell centres** the monster steers along; it steers straight at its target
   only when they share a cell or are neighbours under the step rule.
4. **Repath at most every 0.5 s per monster**, and only when the target changed cell or the path
   ran out.
5. **Wander and return use paths too**; wander destinations are walkable cells within the home
   radius.
6. **Aggro and leash stay straight-line distances**, with no line of sight. A monster that aggroes
   through rock takes the long way round.
7. **A failed search falls back to the straight steer** until the next search.

## Consequences

- At ~70 monsters and two searches a second each, about 140 searches a second over ≤ 3,456 nodes;
  FS-KE075 sets a tick budget and measures it.
- Packs queue in corridors rather than pass through each other; FS-QG1HR D4 (one entity per hash
  cell) is more exposed and stays open.
- Paths hug cell centres, so movement looks grid-bound in tight places; smoothing (string pulling)
  is a later, local change that needs no new ADR as long as the rules above hold.
- Line-of-sight aggro, flow fields for packs, or bodies as obstacles would each be a new decision.
- A later dungeon floor gets paths with no new decision; a non-grid floor does not.
