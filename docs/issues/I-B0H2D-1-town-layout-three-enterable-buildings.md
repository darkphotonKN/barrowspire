---
id: I-B0H2D-1
status: open
implements: FS-B0H2D
blocked_by: []
labels: [ready-for-agent]
title: "FS-B0H2D slice 1: game-service lays out the town as three enterable buildings with clear lanes"
---
Implements FS-B0H2D §A Requirements 1–8, §B Requirements 9–10

**Author: agent** (charter: "no hand coded here, all agents now"; no human-lane block)

## What to Build

The hub's map data swaps the five closed FS-29KSH buildings for three enterable town buildings
(the Quartermaster's store, the Inn, the smithy), each with a centred 50 px door gap in its south
wall and no door entity, and proves by test that nothing walls off the way to any gate.

- `hubBuildings`: three entries, sized per R2 (store and smithy 300×240; Inn ~360×260, at most
  400×300, the largest), placed per R3 (the FS's table is one passing layout; move it if a test
  needs). Give each entry a name or kind so later slices can attach furnishings and people to it.
- `addHubBuilding`: cut the south wall into two segments around a centred 50 px gap, like
  `AddBuilding`, but create **no** door entity. All walls of a building share one `house_id`.
- The Quartermaster's `hubNPCs` entry moves inside his store, at a point that satisfies R14
  (more than `NPCInteractRange` from each of the store's outer walls). The Spirewarden stays.
- `hubResidents`' quarters re-fit (R7): wholly outside every building footprint, inside the map,
  and FS-MRZH7's clearance test still green against the Quartermaster's new place.
- Comments and doc lines in `hub_map.go` that say the hub's buildings are closed scenery are
  corrected (FS-B0H2D, not FS-29KSH §Out of Scope).

Expected files (hotspot `internal/game/hub_map.go` is owned by this slice until it lands;
I-B0H2D-2 edits it next, never in parallel):
- `game-server/game-service/internal/game/hub_map.go`
- `game-server/game-service/internal/game/hub_map_test.go`
- `game-server/game-service/internal/gameserver/hub_buildings_test.go` (its "exteriors, no way
  in" wording and any closed-wall assertion; keep "no door entity")
- only if they assert old coordinates: `internal/gameserver/delve_npc_test.go`,
  `internal/gameserver/hub_world_test.go`

Not touched: `internal/matchmaker`, `internal/match_queue`, any proto, the client.

## Acceptance Criteria

- [ ] Exactly three hub buildings; Inn footprint the largest; store and smithy 300×240; Inn ≤ 400×300.
- [ ] Each building's south wall has a centred 50 px gap; no `Door` component anywhere in the hub.
- [ ] Test: for each gate (Spire 1000,50; Forest 40,400; Meadows 1960,360) every wall rect is more
      than 120 px from the spawn→gate segment (the 240 px lane, R4).
- [ ] Test: a gap-wide, 80 px deep rect south of each door gap lies in the map and touches no wall (R5).
- [ ] Test: spawn and both gate arrival points lie outside every building (R6).
- [ ] Test: every resident quarter lies outside every building footprint and inside the map (R7);
      `TestHubResidents_QuartersClearOfFunctionNPCs_KeepTalkRangePlusMargin` passes unchanged.
- [ ] Test: every NPC inside a building (here, the Quartermaster) is more than `NPCInteractRange`
      from each of that building's outer wall rects (R14).
- [ ] `go test ./...` in game-service green; `make lint` clean.
- [ ] Commit notes the final coordinates (buildings, Quartermaster, quarters) for I-B0H2D-3's mirror.

## Blocked By

None

## Spec Reference

FS-B0H2D §A R1–R8, §B R9–R10, R14 (for the Quartermaster); user stories 1–5, 8, 9, 21, 22, 24.

## TDD Approach

- RED: lane test (R4) against today's map: the north-row houses cross the Spire lane, the
  west/east houses the field lanes.
- GREEN: new `hubBuildings` and the door-gapped `addHubBuilding`; then the quarter and
  talk-through-wall tests, each red first against a deliberately wrong point.
