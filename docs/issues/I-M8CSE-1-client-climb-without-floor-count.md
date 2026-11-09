---
id: I-M8CSE-1
status: done
implements: FS-M8CSE
blocked_by: []
labels: [ready-for-agent]
title: "FS-M8CSE slice 1: the client climbs without floor_count"
---
Implements FS-M8CSE §B

## Files owned

- `game-client/src/ui/floor.ts`, `floor.test.ts`
- `game-client/src/types/gameState.ts`, `gameState.test.ts`
- `game-client/src/render/world/worldTheme.ts`, `worldTheme.test.ts`
- `game-client/src/scenes/BarrowspireScene.ts` (`:3536`, `:4079` only), `BarrowspireScene.test.ts` (the fixture at `:673`)

## What to Build

The client stops needing `floor_count`. This slice lands first so the server can stop sending it
without breaking anything (R6). The server keeps sending it until I-M8CSE-2, and the client ignores it.

1. HUD reads "Floor N", from `floor` alone; nothing with no floor (R7).
2. A predicate reads an empty `stairs` list as the top floor; an absent list (the hub) is not (R8,
   charter default: no new wire field).
3. `floorCard` takes `{ floor, top }` and picks its line from it (R9). `playFloorTransition` no
   longer returns early on a missing `floor_count`. A reconnect shows no card, as today.
4. No Master Spire card (R10, charter default).
5. `floorBand(floor)`: 1-2 `lower`, 3-5 `middle`, 6+ `upper`. `floorLook` loses its count (R11).
6. `floor_count` leaves `ClientGameState`.

Heights above 3 cannot appear yet; this slice is pure.

## Acceptance Criteria

- [ ] `floorLabel` gives "Floor 4" for floor 4, and `null` with no floor.
- [ ] `stairs: []` is the top floor; a non-empty list and an absent list are not; the card's line follows.
- [ ] `floorBand` maps 1, 2 to lower; 3, 4, 5 to middle; 6, 10 to upper.
- [ ] No source under `game-client/src` names `floor_count` outside a comment on its removal.
- [ ] `npm test` and the type check pass.

## Blocked By

None. Blocks I-M8CSE-2.

## Spec Reference

FS-M8CSE §B R6-R11; user stories 3-7.

## TDD Approach

- RED: `floorBand(6)` is `upper` and `floorCard({ floor: 3, top: true })` is the top line, against the one-argument and `{ floor, top }` shapes.
- GREEN: the signatures change and the scene reads `state.stairs`.
