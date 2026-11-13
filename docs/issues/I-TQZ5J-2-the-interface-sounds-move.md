---
id: I-TQZ5J-2
status: open
implements: FS-TQZ5J
blocked_by: [I-TQZ5J-1]
labels: [ready-for-agent]
title: "FS-TQZ5J slice 2: the interface sounds move into the UI scene"
---
Implements FS-TQZ5J §Requirements E (R22), R12

**Lane: AFK (agent).** game-client only. No behaviour change: every sound plays as FS-WDM0X says.

## What to Build

- The game's one `UiSounds` lives in the UI scene (R22); the three world scenes stop making
  their own (`mountUiSounds` goes).
- The world reports its windows (R9: `letter`, `party`, `inventory`, `character`, and, until
  slice 4 moves the menu, its own `menu`), and every world player action that can open or close a
  window runs through the bridge's `act` (R12), which reports before and after once. `GearOverlay`
  and `PartyPanel` are handed the bridge's wrapper instead of the scene's `UiSounds`.
- A change the world makes on its own (a server message) plays nothing, as today.

Ordered before the corner row and the menu (the charter suggested it last) so that slices 3 and 4
move their pieces straight onto the UI scene's `act`, instead of routing sounds back through a
world that is about to lose them.

## Acceptance Criteria

- [ ] Every acceptance criterion of FS-WDM0X still holds; its tests pass, moved with the code.
- [ ] One sound per player action (an opening that pushes others closed plays only its open);
      menu ↔ OPTIONS silent; a server-made close silent.
- [ ] No world scene constructs `UiSounds`.
- [ ] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

I-TQZ5J-1. **Do not start until `feat/client-tower-music` and
`feat/client-enlarged-map-labels-inside` are both merged to main**: both edit the world scenes this
slice changes. Then cut from that main.

## Spec Reference

FS-TQZ5J §Requirements E (R22), B (R12); §Acceptance Criteria (the sounds line).

## Parity (R23)

Sounds have no screenshot: parity is FS-WDM0X's tests plus I-TQZ5J-5's listen-through.

## TDD Approach

- RED: a bridge `act` test: a world action closing the letter and opening the inventory reports
  once and plays `inventory_open` only; an action inside a UI `act` joins it; a report not made
  through `act` plays nothing.
- GREEN: the bridge's `act`, the UI scene's `UiSounds`, the worlds' actions rewired.
