---
id: I-PQ2TW-4
status: open
implements: FS-PQ2TW
blocked_by: [I-PQ2TW-1, I-PQ2TW-2]
labels: [blocked]
title: "FS-PQ2TW slice 4: the town and the fields play the card, and every world scene is held to it (game-client)"
---
Implements FS-PQ2TW §A (R2 town and field entries, R4, R5), §B (R11, R12, R15), §C (R19 town and field rows, R20), §E (R39)

**Author: agent.** game-client only.

**The town's title is "The Town"** (FS-PQ2TW R20, Open O1): the word CONTEXT.md gives the hub.
Do not invent a name. The four subtitle lines in R19 are starting lines; put them in the table as
written, the owner edits them in slice 6.

## What to Build

1. `HubScene` and `FieldScene`, started with `arrival: true`: the dark is up from `create`, the
   card fades in after the dark hold with the place's words (the hub's entry; the field's by its
   `FieldId`), and the dark lifts once the scene has drawn its first game state.
2. Started with `arrival: false`: nothing plays.
3. The veil sits over the world and its atmosphere and under the HUD in both scenes; check each
   scene's HUD, chat, party frames and notices stay above it.
4. A test that walks `WORLD_SCENES` (`src/components/worldRouting.ts`) and fails for a world scene
   that does not hand its arrival to the shared piece (the main menu is not a world).

Walking into a town building needs no code (no `world_entered`); it gets a test that says so.

## Acceptance Criteria

- [ ] Main menu → town plays "The Town" and its line.
- [ ] Town → Gentle Meadows and town → the Forlorn Forest play each field's card; the dev test room plays its own in a dev build.
- [ ] Field → town, run → town (ended, and left early, after the settlement record is closed) and travel to a leader's town play the town's card.
- [ ] Nothing of the place is visible before the dark; the dark lifts only after the first game state is drawn.
- [ ] A reconnect or a refresh into the same town or field plays nothing.
- [ ] Stepping into and out of the Inn and the store plays nothing.
- [ ] HUD, chat, party frames and notices are readable above the veil; input works under it.
- [ ] The `WORLD_SCENES` test fails when a world scene's hand-off is removed (shown once, then restored).
- [ ] Tests and lint green (`npx vitest run --maxWorkers=4 --minWorkers=1`).

## Blocked By

I-PQ2TW-1 (the shared piece and the words table), I-PQ2TW-2 (`arrival` in the start data)

## Spec Reference

FS-PQ2TW §A R2, R4, R5; §B R11, R12, R14, R15; §C R19, R20; §E R39; Edge States (the loading bar
shows, the settlement record holds the town back, world switch while a card is up).

## Files it expects to touch

`game-client/src/scenes/HubScene.ts` (+ test), `src/scenes/FieldScene.ts` (+ test),
`src/ui/placeCard.ts` or `src/ui/floor.ts` (+ test), `src/components/worldRouting.test.ts` or a new
test beside it.

## TDD Approach

- RED: a hub started as an arrival shows the veil at `create` and lifts it after `renderState`'s first run.
- GREEN: the two calls to the piece; then the field; then the `WORLD_SCENES` test.
