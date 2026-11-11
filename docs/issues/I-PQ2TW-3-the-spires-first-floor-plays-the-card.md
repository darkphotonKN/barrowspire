---
id: I-PQ2TW-3
status: open
implements: FS-PQ2TW
blocked_by: [I-PQ2TW-1, I-PQ2TW-2]
labels: [blocked]
title: "FS-PQ2TW slice 3: entering a run plays the first floor's card (game-client)"
---
Implements FS-PQ2TW §A (R2 run entry, R3, R5, R9), §B (R11–R13), §C (R19 floor 1, R21, R22)

**Author: agent.** game-client only. This is the fault the owner found: floor 1 shows no card.

## What to Build

In `BarrowspireScene`, when the scene starts with `arrival: true`:

1. The dark is up from `create`, before anything of the floor is visible (the world's 200 ms
   fade-in opens on it).
2. At the first broadcast the card fades in with that floor's words: floor 1 is "The First Floor /
   The barrow takes you in."; a first floor above 1 (none today) takes its climb card.
3. The dark lifts once the floor is built from its map, as a climb's does.

With `arrival: false` (a reconnect or refresh) nothing changes: the floor is built directly, no
dark, no card, on floor 1 as on any other. A climb that comes while the arrival's card is up
replaces it.

## Acceptance Criteria

- [ ] Entering a run (solo, and as a party) plays "The First Floor / The barrow takes you in."
- [ ] Nothing of the floor is drawn visible before the dark.
- [ ] The card fades in at the first broadcast; the dark lifts only after the floor's map is built; a map that came first lifts on today's schedule.
- [ ] A scene started with `arrival: false` on floor 1, 2 or the top plays nothing; the next climb after it plays its card.
- [ ] A height-10 run's floors play the same cards; no card differs for it.
- [ ] A climb during the arrival's card removes it and plays the climb's.
- [ ] State applies, the HUD and notices are readable and input works under the card.
- [ ] Tests and lint green (`npx vitest run --maxWorkers=4 --minWorkers=1`).

## Blocked By

I-PQ2TW-1 (the shared piece), I-PQ2TW-2 (`arrival` in the start data)

## Spec Reference

FS-PQ2TW §A R2, R3, R5, R9; §B R11–R14; §C R19, R21, R22; Edge States (the place is slow to
build, reconnect mid-card). FS-KE075 §H.41.

## Files it expects to touch

`game-client/src/scenes/BarrowspireScene.ts` (+ test), `src/ui/floor.ts` or `src/ui/placeCard.ts`
(+ test) for floor 1's line.

## TDD Approach

- RED: a run started as an arrival shows a veil at `create` and the floor-1 card at the first broadcast; one started as a return shows neither.
- GREEN: the scene hands its arrival and its "built" to the piece.
