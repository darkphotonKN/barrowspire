---
id: I-PQ2TW-1
status: open
implements: FS-PQ2TW
blocked_by: []
labels: [ready-for-agent]
title: "FS-PQ2TW slice 1: the card is one shared piece with one table of words, and the climb plays through it (game-client)"
---
Implements FS-PQ2TW §B (R10, R12, R14–R17), §C (R19 climb rows, R23), §E (R37, R38); ADR-0073 Decisions 3, 5, 6

**Author: agent.** game-client only. A move with no change the player can see: the climb's card
looks and times as it does today.

## What to Build

1. The arrival card as a piece no scene owns (suggested `src/ui/arrivalCard.ts`): given a scene
   and a card's words, it makes the veil and the card, runs today's timings, holds the dark until
   told the place is built, re-covers and re-centres on a resize, and removes everything on scene
   end or when a new card starts. The five timings and the depth are named there, once.
2. The words as one typed table beside `floorCard` (`src/ui/floor.ts`, or a new
   `src/ui/placeCard.ts` that `floor.ts` feeds): an entry for the hub, one per `FieldId`
   (`Record<FieldId, …>`, so a field id without an entry does not compile), and the floors from
   `floorCard`. Text is FS-PQ2TW R19; the rows for the hub and the fields are used from slice 4.
3. `BarrowspireScene` plays the climb through the piece: `playFloorTransition`, `relayoutFloorVeil`,
   `floorVeil`, `veilRelease` and the `FLOOR_*` timings leave the scene. The climb's detection and
   the per-floor rebuild stay.

Leaving is still today's fade: the dust is slice 5.

## Acceptance Criteria

- [ ] A climb plays the same card, with the same look and the same five timings, from the shared piece.
- [ ] The veil still lifts only once the new floor is built from its map, less the time already waited.
- [ ] A resize during the card keeps the view covered and the card centred.
- [ ] `BarrowspireScene.ts` has no card, veil or card-timing code left.
- [ ] The run's existing floor-card tests pass, moved or re-pointed at the piece, none deleted.
- [ ] A `FieldId` with no entry in the words table fails `tsc`.
- [ ] `npx vitest run --maxWorkers=4 --minWorkers=1` and the lint are green.

## Blocked By

None

## Spec Reference

FS-PQ2TW §B R10, R12 (run, on a climb), R14–R17; §C R19 (the climb's rows), R23; §E R37, R38.
Facts 1, 2.

## Files it expects to touch

`game-client/src/ui/arrivalCard.ts` (+ test, new), `src/ui/floor.ts` (+ test) or
`src/ui/placeCard.ts` (+ test, new), `src/scenes/BarrowspireScene.ts` (+ test).

## TDD Approach

- RED: the piece, on a fake scene, holds the veil until `built()` and then lifts on schedule.
- GREEN: move `playFloorTransition`'s body into the piece; the scene calls it.
