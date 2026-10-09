---
id: I-8RBQY-3
status: done
implements: FS-8RBQY
blocked_by: [I-8RBQY-2]
labels: [ready-for-agent]
title: "FS-8RBQY slice 3: per-floor bands, computed run dressing, light budget and the baked spiral stairs"
---
Implements FS-8RBQY §0, §C, §E

Makes each floor look different, places run dressing with a keep-out computed from the
broadcast, caps fixed lights, and swaps the placeholder stairs for `stairs_spiral` through the
existing `StairsSet` stage.

> Sequenced after slice 2, which owns the same scene and planner files first. Siblings are
> concurrently editing `game-server/**` and `src/render/effects/**`. This slice touches neither.

## Files owned

All paths under `game-client/src/`.

- `render/world/worldTheme.ts` + `worldTheme.test.ts`: `floorBand(floor, floorCount)` and the
  one per-band table (hall ground, back-wall shares, dressing weights).
- `render/world/runDressing.ts` + `runDressing.test.ts` (new): the computed keep-out and the
  deterministic dressing plan.
- `render/world/floorLights.ts` + `floorLights.test.ts` (new): the per-floor fixed-light budget
  and drop order.
- `render/world/ground.ts` + `ground.test.ts`: band hall materials, flags/dirt patches on
  `lower`, and the floor seed.
- `render/world/walls.ts` + `walls.test.ts`: per-band variant shares.
- `render/world/scene.ts`: `GroundLayer` takes the floor seed; dressing reuses `addProp`.
- `render/world/index.ts`: exports.
- `scenes/BarrowspireScene.ts` (and `BarrowspireScene.test.ts` if it needs updating): band
  build per floor, dressing build and teardown at `leaveFloor`, routing every fixed light through
  the budget, and the `StairsStage.add` swap.

Not owned: `render/world/stairs.ts` (unchanged by FS-8RBQY §E.5), `render/world/hubKeepOut.ts`
(import its `Footprint` helpers only, never edit), `perimeter.ts`, `render/lighting/**`,
`render/effects/**`, `scenes/HubScene.ts`, and every file slice 1 owns.

## What to Build

1. **Floor band** (FS-8RBQY §C.1): `floorBand(floor, floorCount)` →
   `lower | middle | upper` via `t = (floor − 1) / (floor_count − 1)` (or `0` when
   `floor_count ≤ 1`), with cut points at 1/3 and 2/3.
2. **Band table** (§C.2): one table, the only place band shares live. `lower`: flags with
   `ground_dirt` patches edged by `ground_flags_dirt`, cobweb-leaning back walls, no banners,
   roots, bone piles and rubble. `middle`: flags, plain/pillar/sconce walls with few banners,
   rubble, broken crates and chains. `upper`: `ground_dressed`, pillar/sconce/banner walls with
   no cobweb, chains and braziers, no roots or bones. Room floors are planks in every band.
3. **Seeding** (§C.3): ground, wall variants and dressing hash from (theme, floor, tile or
   position) and server positions only. `GroundLayer` repaints with the floor seed on a floor
   change.
4. **Run dressing** (§C.4–§C.5, R3): planned once the floor's static entities are known, from
   the band's weights, at most 16 props per floor. A candidate is dropped (never nudged) when it
   overlaps a wall rect grown by 24 px, lies in a door threshold zone (door rect grown 40 px on
   every side and extended 60 px south), lies within 60 px of the stairs, chest, escape door or
   switch, or lies within 30 px of the play-area edge. Drop piles are not keep-out. Dressing
   sprites are never interactive and never in a physics group or collider.
5. **Light budget** (§C.6): a floor's fixed lights (sconces, slits, braziers, the stairs pool)
   are capped at 24. Past the cap, drop slits, then braziers, then sconces, deterministically.
   The stairs pool is never dropped. The carried torch and transient lights don't count.
6. **Stairs** (§E): `StairsStage.add` draws `stairs_spiral` at the server position, sorted by
   footprint like any prop, registered as an occluder, with its light stamped once per floor
   build. It falls back to the `stairs_up` placeholder when the sheet is missing. `StairsSet`,
   `nearby`, `INTERACT_RANGE` and the climb flow are untouched. The top floor draws none.
7. **Floor change and reconnect** (§C.7): a climb tears down the band's ground, dressing and
   fixed lights at `leaveFloor` and builds the next floor's. A reconnect builds the floor's band
   from the first broadcast, with no transition.

## Acceptance Criteria

- [ ] `floorBand` maps (1,3)→lower, (2,3)→middle, (3,3)→upper, (1,1)→lower, and floors 1–5 of a
      5-floor run to a monotone ramp (unit-tested).
- [ ] The ground, wall-variant and dressing plans for a given (floor, floor_count, broadcast)
      are equal across two calls and differ between floors 1 and 3 (unit-tested). No
      `Math.random` on the baked path.
- [ ] `upper` plans no roots, bone piles or cobweb pieces; `lower` plans no banners
      (unit-tested).
- [ ] Every planned dressing footprint passes each §C.5 rule on a fixture with walls, doors,
      stairs, chest, escape door and switch; a crowded fixture rejects the crowded candidate; no
      floor plans more than 16 props (unit-tested).
- [ ] Dressing sprites are never interactive and never in a physics group or collider.
- [ ] Fixed lights per floor never exceed 24; the drop order is slits, braziers, sconces; the
      stairs pool survives a crowded fixture (unit-tested).
- [ ] The stairs draw `stairs_spiral` at the server position, footprint-sorted and registered as
      an occluder, with its light stamped; with no manifest they draw `stairs_up`.
      `render/world/stairs.ts` is unchanged.
- [ ] A climb rebuilds ground, dressing and fixed lights for the next band; a reconnect onto
      floor 2 or 3 builds that band directly.
- [ ] With the theme constant set to `"exterior"`, no dressing is placed and the ground and walls
      are today's; only the stairs art differs (§E.1).
- [ ] On Node 22 (`export PATH=~/.nvm/versions/node/v22.13.1/bin:$PATH`), `npm test`,
      `npm run lint`, `npm run lint:fence` and `npm run bake -- --check` pass in `game-client/`.
- [ ] `git diff -- game-server/` shows nothing from this slice, and `src/types/gameState.ts` is
      unchanged.
- [ ] Hand-back describes floors 1, 2 and 3 for the coordinator's visual check at integration
      (no owner HITL gate). Band shares are tuned there.

## Blocked By

- I-8RBQY-2 (the world theme seam, tower walls and ground plan this slice varies, and the same
  scene files).

## Spec Reference

FS-8RBQY §0 (boundary), §C (floor band, band table, seeding, run dressing, computed keep-out per
R3, light budget, floor change and reconnect), §E (baked stairs: placement, cue, pool, logic
unchanged, fallback). User stories 8–12, 14–16, 24–25.

## TDD Approach

- RED: `worldTheme.test.ts` expects the `floorBand` mapping; `runDressing.test.ts` expects every
  planned footprint clear of each keep-out rule on a fixture, the 16-prop cap, determinism and
  per-band exclusions; `floorLights.test.ts` expects the 24 cap, the drop order and the surviving
  stairs pool; `ground.test.ts` expects different plans for floors 1 and 3 and equal plans for
  repeated calls.
- GREEN: the band table, the planners, then the scene wiring and the stairs stage swap.
