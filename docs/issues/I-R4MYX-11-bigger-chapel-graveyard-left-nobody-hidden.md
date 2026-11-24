---
id: I-R4MYX-11
status: done
implements: FS-R4MYX
blocked_by: []
labels: [ready-for-agent]
title: "FS-R4MYX slice 11: the bigger chapel, the graveyard moved screen-left, and nobody outdoors hidden behind a building"
---
Implements FS-R4MYX §A Requirements 1, 3–5, §B Requirements 8, 10, §C Requirements 12–14, §D Requirements 16–17, 19–20, §E Requirements 21–22, §F Requirements 27–31, §I Requirements 39–40

**Lane: game-service code (agent, under the charter's bounds only: hub map data, the map size
constants, the golden and their tests) and game-client layout data.** Owner feedback from
I-R4MYX-10 (F1–F5). No proto, wire, DB or gateway change; if one looks needed, stop and escalate.

## What to Build

The chapel grows to about 620 × 440 with 20 × 100 pews, the Confessor stands in front of the dais,
the graveyard doubles and moves screen-left of the chapel, the town grows south to fit, and a
client test proves no outdoor NPC, quarter point or graveyard piece is drawn hidden behind a
town building. The FS's **indicative** layout passed R4, R5, R12, R13, R19, R20 and R39's model
by script; it was not checked against K1–K8. Move any figure a test needs, and note the final
numbers in the commit.

Server (game-service):
- `HubMapHeight` → the smallest multiple of 100 that holds the layout (1700 under the indicative
  one; R1); its comment names FS-R4MYX and the owner feedback.
- `hubBuildings`: the chapel at its new footprint (indicative (960, 1100), 620 × 440, door face
  east), six pews 20 × 100 and the altar per R12 (aisle ≥ 100, every furnishing ≥ 50 clear).
- `hubFixedResidents`: the Confessor in front of the dais, the worshippers in front of their
  pews, the mourners at their new graves (R17); the R13/R19/R20 tests still hold. The
  Confessor's comment says he stands in front of the dais, not behind the altar.
- `hubResidents`: the Woodcutter's and the Bellringer's quarters move out of the chapel's hidden
  ground (indicative 1780–1960 × 1000–1160 and 1780–1960 × 1240–1400), each outside every
  footprint and a function NPC's talk range + 40 clear (R5, FS-MRZH7 R9). The Cottar's and the
  Herbwife's stay.
- Tests: the flood fill's start at the new gap centre (R8); the chapel's size test; anything
  asserting 1500.
- The golden gains `wanderRegions` (name, x, y, w, h from `hubResidents`, R40); rewrite
  `hubTown.golden.json` with `-update`, never by hand.

Client (game-client):
- `HUB_SIZE` follows `HubMapHeight` (R22); the town minimap scale follows (0.0833 × 3000 /
  (2000 + height)).
- `hubTownGolden.ts`: the golden type gains `wanderRegions`; `HUB_KEEP_OUT.wander` is held to it
  by a vitest (R40), and moves with the server's.
- `hubInteriors.ts`: `HUB_CHAPEL`, the pews' and altar's mirror (pew rect 20 × 100), the chapel's
  indoor dressing moved and scaled (dais, lectern, candelabra; R14), `HUB_FIXED_RESIDENTS` at the
  new points with their facings unchanged (Confessor `e`, the rest `w`; R17, R26). The
  placeholder pew follows the furnishing's rect by itself.
- `hubKeepOut.ts`: the chapel's door spur and the re-routed chapel lane, east-arm extension,
  graveyard spur and gap path (R31); the old chapel lane `[1200, 700, 70, 775]` goes. Every
  outdoor spot still clears K1–K8 against the four buildings.
- `hubGraveyard.ts`: the enclosure (indicative x 40–580, y 1020–1520), four rows, 24 headstones
  (10 intact, 9 weathered, 5 broken), 3 fresh mounds, flowers at 6 graves (4 fresh, 2 withered),
  2 stone crosses, 3 dead trees, the wall runs with their collapsed stretches and the gap
  facing the graveyard spur (R28, R29); the belfry moved by the new door (R30). The R27 tests:
  K1–K8, inside the enclosure, 12 px clear of the mourners, each mourner 40–80 px east of their
  grave's head, and the counts.
- A new pure module (e.g. `render/world/hubCover.ts`, no Phaser) for R39: a building's bulk (its
  eave-grown footprint raised to the heights `planRoof` lays, a named allowance over the ridge
  row for the ridge piece and gable crosses) and `hiddenBehind(point, house)`, with
  `NPC_BODY_HALF` (16 screen px). Its test runs it over the golden's buildings against the
  outdoor function NPCs (the Elder), the outdoor fixed residents, every quarter on a ≤ 20 px
  grid (corners included), and every graveyard piece and wall tile by its footprint; plus
  fixture cases (a point just north of the chapel is hidden; a point just east or south of its
  eave is not).
- `hubTown.fixture.ts` only if the bigger chapel changes how it walls a building.

Expected files:
- `game-server/game-service/common/constants/game.go`
- `game-server/game-service/internal/game/hub_map.go` (hotspot: this slice owns it)
- `game-server/game-service/internal/game/hub_map_test.go`
- `game-server/game-service/internal/game/hub_town_golden_test.go`
- only if they assert the height: `internal/gameserver/hub_gates_test.go`,
  `internal/gameserver/hub_buildings_test.go`, `internal/systems/movement_bounds_test.go`,
  `internal/systems/wander_test.go`
- `game-client/src/render/world/hubTown.golden.json` (by `-update` only), `hubTownGolden.ts`
- `game-client/src/render/world/hubKeepOut.ts`, `hubKeepOut.test.ts`
- `game-client/src/render/world/hubInteriors.ts`, `hubInteriors.test.ts` (hotspot: I-R4MYX-13
  edits `hubInteriors.ts` next, never in parallel)
- `game-client/src/render/world/hubGraveyard.ts`, `hubGraveyard.test.ts`
- `game-client/src/render/world/hubCover.ts` (new), `hubCover.test.ts` (new)
- `game-client/src/ui/townMap.test.ts`, `worldMap.test.ts` (the scale), `hubStash.test.ts` and
  `src/scenes/hubReach.test.ts` only if they pin a chapel point
- `game-client/src/render/world/hubTown.fixture.ts` only if needed

Not touched: bake sources and the manifest (I-R4MYX-12), wall sheets, roofs and the scene's
drawing (I-R4MYX-13), `townLines.ts` (names and lines are unchanged), any proto,
`internal/matchmaker`, `internal/match_queue`.

## Acceptance Criteria

- [ ] `HubMapHeight` is the smallest multiple of 100 that fits; the client's `HUB_SIZE` equals it;
      nothing north of the chapel moved but the two quarters.
- [ ] Go tests: the chapel about 620 × 440, its east gap centred; six 20 × 100 pews and the altar
      each ≥ 50 clear; aisle ≥ 100; lanes, front-of-door ground, arrivals, quarters outside every
      footprint, no wall in a gap; the flood fill from the east door reaches talk range of the
      Confessor (east of the dais's edge) and the four worshippers; R19 and R20 hold.
- [ ] Golden carries `wanderRegions`; rewritten by `-update`; the client mirror tests (buildings,
      furnishings, fixed residents, quarters) green.
- [ ] Vitest (R39): nothing the rule covers is hidden behind any of the four buildings; the
      fixture cases pass.
- [ ] Vitest (R27–R31): K1–K8 for every graveyard piece, the belfry and every path rect; the
      graveyard screen-left of the chapel; R28's counts; mourners' spacing; paths cross no floor.
- [ ] `go test ./...` and `make lint` (game-service); `npm test`, `npm run lint`,
      `npm run lint:fence`, `npx tsc --noEmit` (game-client) green.
- [ ] Commit notes the final chapel, door, Confessor, graveyard and quarter numbers for
      I-R4MYX-13 and the FS.

## Blocked By

None (I-R4MYX-1 to I-R4MYX-9 are done in the working tree)

## Spec Reference

FS-R4MYX §A R1, R3–R5, §B R8, R10, §C R12–R14, §D R16–R17, R19–R20, §E R21–R22, §F R27–R31,
§I R39–R40; user stories 8, 15, 17, 31–33, 35.

## TDD Approach

- RED: the R39 test over today's golden (the Woodcutter's quarter, north of the chapel, reports
  hidden behind it, as the owner saw); the furnishing test asking for 20 × 100 pews.
- GREEN: the bulk model; then the server layout, `-update`, the client mirror, the graveyard and
  paths, until K1–K8, R27 and R39 all pass.
