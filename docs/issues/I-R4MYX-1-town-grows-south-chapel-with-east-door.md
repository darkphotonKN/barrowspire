---
id: I-R4MYX-1
status: done
implements: FS-R4MYX
blocked_by: []
labels: [ready-for-agent]
title: "FS-R4MYX slice 1: game-service grows the town south and stands the chapel with an east door, pews and altar"
---
Implements FS-R4MYX §A Requirements 1–5, §B Requirements 6–8, §C Requirements 12–13 (furnishings)

**Lane: game-service code (agent, under the charter's bounds only: hub map data, a building's
door face, map size constants and their tests).** No proto, wire, DB or gateway change; if one
looks needed, stop and escalate.

## What to Build

The hub is 2000 × 1500 and holds a fourth enterable building, the chapel, whose street door is cut
in its **east** wall. Its pews and altar are furnishings. Every existing coordinate stays.

- `HubMapHeight` 1000 → 1500 (`common/constants/game.go`); its comment names FS-R4MYX.
- A town building gains a **door face**, south (the default, the three existing buildings,
  unchanged) or east. `addHubBuilding` cuts an east-door building's east wall into two segments
  around a centred `hubDoorWidth` gap and leaves its south wall whole; five walls either way. An
  east-door building with a partition is refused by a test (R6).
- `hubBuildings` gains the chapel at (660, 1040), 480 × 340, door face east, with six `pew`
  furnishings (20 × 70 at x 870, 940, 1010; y 1110 and 1240) and an `altar` (790, 1170, 30 × 80),
  per R12. The FS's layout passed every rule by hand; move it only if a test needs, and note it.
- Tests generalised to the door face: `doorGapOf` reads the gap on the building's face;
  "every building has a door gap a run door wide" (south gaps centred save the Inn's, the east gap
  centred on the east wall); R5's front-of-door rect lies outside the door face; the flood fill
  starts from the gap's centre for either face (the chapel's at (1130, 1210)); the "three town
  buildings" test becomes four, the chapel 480 × 340; the furnishings test lists the chapel's
  kinds with R12's 50 px clearance on every side (no new `wallBacked` kind: ADR-0070 Decision 5).
- The golden: `townGoldenBuilding` gains `doorFace` (`"south"` / `"east"`), its `doorGap` the gap
  as cut on that face; `TestHubTown_BuiltHubStandsTheGoldenTown` reads the gap by face. Rewrite
  `hubTown.golden.json` with `-update`, never by hand.
- `internal/gameserver/hub_buildings_test.go`: the town's building count 3 → 4, and its "south
  wall" wording where it asserts the gap.

Expected files:
- `game-server/game-service/common/constants/game.go`
- `game-server/game-service/internal/game/hub_map.go` (hotspot: owned by this slice until it lands;
  I-R4MYX-2 edits it next, never in parallel)
- `game-server/game-service/internal/game/hub_map_test.go`
- `game-server/game-service/internal/game/hub_town_golden_test.go`
- `game-server/game-service/internal/gameserver/hub_buildings_test.go`
- `game-client/src/render/world/hubTown.golden.json` (written by `-update` only)
- only if they assert the old height: `internal/gameserver/hub_gates_test.go`,
  `internal/systems/movement_bounds_test.go`, `internal/systems/wander_test.go`

Not touched: the client's code, any proto, `internal/matchmaker`, `internal/match_queue`.

Note: rewriting the golden turns the client's mirror tests red until I-R4MYX-4 follows; that is
the golden's design (FS-B0H2D R23). Land both on `feat/hub-chapel` before any merge to main.

## Acceptance Criteria

- [ ] `HubMapHeight` is 1500; no other hub coordinate changed (spawn, gates, arrivals, the three
      buildings and their furnishings, NPCs, quarters, fixed residents).
- [ ] Four buildings; the chapel 480 × 340 at the FS's place or a passing one; its east wall two
      segments round a centred 80 px gap, its south wall whole; the others' south gaps unchanged.
- [ ] Go tests: lanes (R4), front-of-door ground by face (R5), spawn and arrivals outdoors incl. the
      dev test room's (R6), quarters outside every footprint (R7), no wall in a door gap
      (FS-MMA2H R10), no east door with a partition.
- [ ] Go test: six pews and an altar, each a chapel wall touching no outer edge and ≥ 50 px clear
      of every wall and furnishing; the flood fill from the east door reaches the whole aisle.
- [ ] Golden carries `doorFace` and the chapel; rewritten by `-update`; both golden tests green.
- [ ] `go test ./...` and `make lint` green in game-service.
- [ ] Commit notes the final chapel coordinates for the client mirror (I-R4MYX-4).

## Blocked By

None

## Spec Reference

FS-R4MYX §A R1–R5, §B R6–R8, §C R12–R13 (furnishings and reach); user stories 1, 3, 5–7, 22, 27.

## TDD Approach

- RED: a door-face test asserting the chapel's east gap (no chapel yet), and the size test at four.
- GREEN: the door face in `addHubBuilding`, the chapel and its furnishings, the constant; then
  generalise `doorGapOf` and the flood fill's start until every existing test is green again.
