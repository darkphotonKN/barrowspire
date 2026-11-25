---
id: I-R4MYX-17
status: done
implements: FS-R4MYX
blocked_by: []
labels: [ready-for-agent]
title: "FS-R4MYX slice 17: the chapel moves to the far left with a solid tower, the graveyard becomes a strip along its south wall, and the dev gate and everyone outdoors stay in sight"
---
Implements FS-R4MYX §Change: The chapel moves to the far left and gains a bell tower (§T-A T1–T5, §T-B T6–T8, §T-C T9–T10, T17–T18, §T-D T19–T22, §T-E T23, §T-G T26)

**Lane: game-service code (agent, under the charter's bounds only: hub map data, one new solid
wall, the map height constant, the golden and their tests) and game-client layout data.** No
proto, wire field, DB or gateway change; if one looks needed, stop and escalate. If the layout
needs a map taller than 2000, stop and escalate (T4).

## What to Build

The whole layout move, server and client together (the golden ties them: after `-update` the
client's vitests are red until its mirrors follow). The tower stands as a solid block with a
placeholder look; its art and final drawing are I-R4MYX-18 and I-R4MYX-19. The FS's **indicative**
figures passed a spec-time script (R39's model, K1, K2, K7); move any figure a test needs and
note the final numbers in the commit.

Server (game-service):
- `HubMapHeight` 1700 → the smallest multiple of 100 that fits, at most 2000 (T4).
- `hubBuildings`: the chapel at (220, 1300) with its pews and altar moved by the same offset
  (indicative (−740, +200)); comments updated (T1).
- `hubFixedResidents`: the Confessor and four worshippers by the offset; the mourners at their
  new graves (indicative Keener (805, 1865), Widower (800, 1945), Veteran (411, 1905); T21).
- The bell tower: one wall, indicative (80, 1450) 140 × 140, with a `house_id` of its own, **not**
  in `hubBuildings`; built in `InitialHubMapObjects` (T6).
- Tests: T7's tower rules; the building tests skip the tower's wall group (`hubWalls`,
  `houseOf`, the "four buildings" count); the chapel's placement rules (T1); "nothing else
  moved" (T2); the flood fill's start at the new gap centre; anything asserting 1700.
- The golden gains the tower's rect (indicative key `bellTower`); the built-hub check proves one
  wall on it with a lone `house_id` (T8). Rewrite `hubTown.golden.json` with `-update`, never by
  hand.

Client (game-client):
- `HUB_SIZE` 2000 × 2000; the town minimap's scale 0.0625; the minimap shows the chapel and the
  tower's block (T26).
- `hubTownGolden.ts`: the golden type gains the tower's rect. `hubTown.fixture.ts` walls the
  tower, so K1 sees it (T9).
- `hubInteriors.ts`: `HUB_CHAPEL`, the furnishings' and fixed residents' mirrors, the chapel's
  indoor dressing, `CHAPEL_NAVE_LANCETS`, `CHAPEL_EAST_LANCETS`, and a new `HUB_BELL_TOWER`
  held to the golden (T9).
- `HubScene.ts`: the wall on the tower's rect is taken out before houses are built: no house, no
  loose wall pieces; a placeholder block on its rect (T10, the no-art half). The belfry leaves
  the dressing it lays (T17).
- `hubKeepOut.ts`: the chapel's door spur, the new lane and graveyard spur; R31's four chapel-way
  rects go (T22, T5).
- `hubGraveyard.ts`: the strip (enclosure, seven lines of four slots, crosses, trees, wall runs,
  the gap in the east side), `HUB_BELFRY` deleted, the wayside cross by the new door (T17–T20).
  Its tests: T19's rules replace "screen-left of the chapel" and "about twice the area".
- `hubCover.ts`: the tower's bulk as a box to a **named** top (indicative 530 screen px; held to
  the manifest in I-R4MYX-19), and the dev gate's ground. Tests: T3 with its failing fixture,
  T23 over the chapel and the tower with its failing fixture.

Expected files:
- `game-server/game-service/common/constants/game.go`
- `game-server/game-service/internal/game/hub_map.go`, `hub_map_test.go`,
  `hub_town_golden_test.go`
- only if they assert the height or a chapel point: `internal/gameserver/hub_gates_test.go`,
  `internal/gameserver/hub_buildings_test.go`, `internal/systems/movement_bounds_test.go`,
  `internal/systems/wander_test.go`, `internal/game/session.go` (a comment)
- `game-client/src/render/world/hubTown.golden.json` (by `-update` only), `hubTownGolden.ts`,
  `hubTown.fixture.ts`
- `game-client/src/render/world/hubInteriors.ts`, `hubInteriors.test.ts`,
  `buildingLooks.test.ts` (pinned chapel points)
- `game-client/src/render/world/hubKeepOut.ts`, `hubKeepOut.test.ts`
- `game-client/src/render/world/hubGraveyard.ts`, `hubGraveyard.test.ts`
- `game-client/src/render/world/hubCover.ts`, `hubCover.test.ts`
- `game-client/src/scenes/HubScene.ts`, `HubScene.test.ts`
- `game-client/src/ui/townMap.test.ts`, `worldMap.test.ts`, `worldMinimap.test.ts` (the scale,
  the tower's block); `townMap.ts` only if the block does not come from the walls by itself

Not touched: `tools/bake/**`, `public/art/**`, `src/render/art/manifest.test.ts` (I-R4MYX-18,
which may run **in parallel** in its own worktree: no file is shared); `roofs.ts`, the tower's
sprite, sort key, silhouette and indoor hiding (I-R4MYX-19); `townLines.ts`; any proto;
`internal/matchmaker`, `internal/match_queue`.

**Serialises with I-R4MYX-19** on `hubCover.ts`, `hubInteriors.ts`, `HubScene.ts` and their
tests: this slice first.

## Acceptance Criteria

- [ ] `HubMapHeight` ≤ 2000 and the smallest multiple of 100 that fits; `HUB_SIZE` equals the
      golden's `mapSize`.
- [ ] Go tests: the chapel's placement rules; every furnishing and indoor resident at its
      shipped offset from the chapel's corner; nothing else in town moved; R5, R12, R13, R19,
      R20 green; the tower's rules (T7); the hub still has four buildings.
- [ ] The golden carries the tower's rect and the moved town, rewritten by `-update`; every
      client mirror test green.
- [ ] Vitest (T3): the dev gate's ground is hidden behind neither bulk; the 100-px-north
      fixture reports it hidden.
- [ ] Vitest (T23): nobody and no graveyard piece is hidden behind the chapel or the tower; the
      north-west-of-the-tower fixture reports hidden.
- [ ] Vitest (T19–T22, T5): the strip's rules and counts; the mourners' spacing; one gap; the
      paths' rules; nothing of this FS on the old site.
- [ ] Vitest (T10, T17, T26): the tower's wall makes no house and no loose wall and draws a
      placeholder block; no `HUB_BELFRY`; the minimap at 0.0625 with the chapel's notch and the
      tower's block.
- [ ] `go test ./...` and `make lint` (game-service); `npm test`, `npm run lint`,
      `npm run lint:fence`, `npx tsc --noEmit` (game-client) green.
- [ ] The commit notes the final chapel, tower, strip, mourner and path numbers and the map's
      height, for I-R4MYX-19 and the FS.

## Blocked By

None

## Spec Reference

FS-R4MYX §Change: The chapel moves to the far left and gains a bell tower: T1–T10 (T10's placeholder half), T17–T23, T26; user stories 2, 3, 5, 7–12, 14, 15.

## TDD Approach

- RED: the T3 test over the shipped bulk moved to (220, 1020), the graveyard's ground: the gate's
  ground reports hidden. The Go test asking for a lone-id wall on the tower's rect.
- GREEN: the server layout and `-update`; then the client mirrors, the strip and the paths,
  until K1–K8, T3, T19 and T23 all pass.
