---
id: I-R4MYX-4
status: done
implements: FS-R4MYX
blocked_by: [I-R4MYX-1]
labels: [ready-for-agent]
title: "FS-R4MYX slice 4: game-client's town grows south and mirrors the chapel, its door face and its path"
---
Implements FS-R4MYX §B Requirement 10, §E Requirements 21 (footprint and furnishings), 22, §F Requirements 31–32

**Lane: game-client code (agent).**

## What to Build

The client's copy of the town follows I-R4MYX-1's golden: 2000 × 1500, four buildings, a door on
either face, the chapel's furnishings, and the trodden path to the chapel and the graveyard.

- `HUB_SIZE` (`hubKeepOut.ts`) is 2000 × 1500, and `HubScene` reads it instead of its own
  `HUB_WIDTH`/`HUB_HEIGHT` (one source, R22): the ground fill and edge line, the camera's reach,
  the blackout's reach, K7, and the town minimap's world follow.
- `hubTownGolden.ts`: `TownBuilding` gains `doorFace: "south" | "east"`.
- `hubTown.fixture.ts`: `townDoorGap` and `townOutline` wall and measure a building by its
  `doorFace` (the east wall in two segments for an east door).
- Thresholds by face (R10) in `hubKeepOut.test.ts` (outdoor: beyond the sill) and
  `hubInteriors.test.ts` (indoor: inward from the sill); the door-spur rule by face.
- `HUB_DOOR_SPURS` gains the chapel's `[1140, 1170, 60, 80]`; `HUB_PATHS` gains the chapel lane
  `[1200, 700, 70, 775]`, the graveyard spur `[530, 1425, 740, 50]` and the gap path
  `[530, 1400, 70, 25]` (R31). Every existing outdoor spot still clears K1–K8 (no move expected).
- `hubInteriors.ts`: `FurnishingKind` gains `pew` and `altar`; `HUB_FURNISHINGS` gains the six
  pews (sheet `pew`, long along y) and the altar (sheet `chapel_altar`; `altar` is the run's Altar of Consecration, FS R24 as amended), in hub_map.go's order;
  `HUB_CHAPEL` (its footprint, held to the golden) and `isChapel`, as `HUB_INN` / `isInn`.
  Drawing them is I-R4MYX-5's.

Expected files:
- `game-client/src/render/world/hubKeepOut.ts`, `hubKeepOut.test.ts`
- `game-client/src/render/world/hubTownGolden.ts`, `hubTown.fixture.ts`
- `game-client/src/render/world/hubInteriors.ts`, `hubInteriors.test.ts` (hotspot: I-R4MYX-5 and
  I-R4MYX-7 edit them next, never in parallel)
- `game-client/src/scenes/HubScene.ts` (the size constants only)
- `game-client/src/render/world/hubStash.test.ts` only if the fixture change touches it

Not touched: the graveyard data (I-R4MYX-6), the fixed residents' mirror (I-R4MYX-7), the server.

Note: if I-R4MYX-2 has rewritten the golden first, the fixed-residents mirror test is red until
I-R4MYX-7; every other suite is green here.

## Acceptance Criteria

- [ ] `HUB_SIZE` 2000 × 1500 is the scene's only hub size; no 2000 × 1000 left in `HubScene`.
- [ ] Vitest: the golden's four buildings walled by face; outdoor and indoor thresholds by face;
      each `HUB_DOOR_SPURS` entry held to its gap by face.
- [ ] Vitest: K1–K8 for every outdoor spot and fence against the four buildings; the new paths
      cross no room's floor.
- [ ] Vitest: `HUB_FURNISHINGS` equals the golden's furnishings (the chapel's included);
      `HUB_CHAPEL` equals its footprint.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green (see the note).

## Blocked By

I-R4MYX-1 (the golden with the chapel and `doorFace`)

## Spec Reference

FS-R4MYX §B R10, §E R21–R22, §F R31–R32; user stories 2, 21, 22, 28, 30.

## TDD Approach

- RED: the mirror tests against I-R4MYX-1's golden (they fail on the chapel's furnishings and
  door face as soon as it lands).
- GREEN: the type, the fixture by face, the mirror entries, the paths, the size.
