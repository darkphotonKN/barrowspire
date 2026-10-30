---
id: I-B0H2D-2
status: open
implements: FS-B0H2D
blocked_by: [I-B0H2D-1]
labels: [ready-for-agent]
title: "FS-B0H2D slice 2: game-service furnishes the Inn and smithy and seats their people"
---
Implements FS-B0H2D §C Requirements 12–14, §D Requirements 16–18

**Author: agent** (charter: agent lane; no human-lane block)

## What to Build

The Inn gets a counter and three tables, the smithy a forge, as server keep-outs; and five
**fixed residents** (ambient NPCs with no wander region and no velocity) stand inside: the
Alewife behind the Inn's counter, the Drover, the Gravedigger and the Pilgrim one per table, the
Smith by the forge. No new NPC function, no wire field, no proto change; if one looks
unavoidable, stop and escalate.

- Furnishings (R12): wall entities with their building's `house_id`, each touching none of its
  building's four outer edges and at least 50 px clear of every wall and every other furnishing.
  Data lives with the building in `hub_map.go`.
- Fixed residents (R16–R18): new map data (name, appearance, point), created by a new factory
  function (e.g. `CreateFixedResidentEntity`) that adds `NPCComponent` with function `""`, the
  appearance and `Wander == nil`, a transform and an `NPCInteractRange` interactable, and **no
  velocity**. Appearances from the existing set (`rust_trousers`, `green_skirt`,
  `slate_trousers`, `flax_skirt`). Names exactly: `Alewife`, `Drover`, `Gravedigger`, `Pilgrim`,
  `Smith` (the client keys lines and facing by name).
- `InitialHubMapObjects` creates them and logs the count.

Expected files (hotspot `internal/game/hub_map.go`: runs after I-B0H2D-1, never in parallel with it):
- `game-server/game-service/internal/game/hub_map.go`
- `game-server/game-service/internal/game/hub_map_test.go`
- `game-server/game-service/internal/game/factory.go` (+ a test beside it, or in `internal/gameserver/hub_world_test.go`)

Not touched: wire types, serializer, `internal/systems` (WanderSystem already skips a nil region),
`internal/matchmaker`, `internal/match_queue`, the client.

## Acceptance Criteria

- [ ] Inn has a counter and three tables, smithy a forge; each a wall with its building's
      `house_id`; test: none touches its building's outer edges; each ≥ 50 px from every wall and
      other furnishing (R12).
- [ ] Five fixed residents exist with function `""`, an existing appearance, no wander region,
      no velocity; test: positions unchanged after several ticks.
- [ ] Test: every NPC inside a building is more than `NPCInteractRange` from each of its outer
      wall rects; furnishings excluded (R14).
- [ ] Test (R13): a coarse grid flood fill (≤ 10 px cells, walker radius `PlayerRadius`) from
      each door gap reaches a cell within `NPCInteractRange` of every NPC inside that building
      (the Alewife across the counter).
- [ ] All I-B0H2D-1 tests still green (lanes, doors, quarters).
- [ ] `NPCState` and every proto unchanged; `go test ./...` green; `make lint` clean.
- [ ] Commit notes each furnishing's kind and rect and each fixed resident's point, for the
      client mirror (I-B0H2D-3, I-B0H2D-5).

## Blocked By

- I-B0H2D-1 (needs the buildings; same hotspot file)

## Spec Reference

FS-B0H2D §C R12–R14, §D R16–R18; user stories 10, 14, 16, 20, 25, 27.

## TDD Approach

- RED: fixed-resident test (no velocity, nil region, never moves) against a missing constructor;
  then the reachability flood fill against a counter placed flush across the room.
- GREEN: the factory function and the furnished, peopled map data.
