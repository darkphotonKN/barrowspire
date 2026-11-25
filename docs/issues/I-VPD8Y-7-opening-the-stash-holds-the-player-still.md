---
id: I-VPD8Y-7
status: done
implements: FS-VPD8Y
blocked_by: []
labels: []
title: "FS-VPD8Y § Change: Opening the stash holds the player still, slice 1: stash mode owns the movement keys"
---
Implements FS-VPD8Y §Change: Opening the stash holds the player still (R45–R51)

**Lane: AFK (game-client).** No game-server, proto, gateway or manifest change. No new message.

## What to Build

While the gear overlay is open in stash mode (E at the stash chest), the movement keys read as
released, as the menu, the letter panel and an NPC's card make them. A stride in progress is stopped by
one `move {vx: 0, vy: 0}`, and nothing more is sent until the overlay closes. On close (I, B, Esc,
either ×), the keys still held walk on at once. The plain overlay opened by I or B away from the chest
keeps today's walking (FS-HRH2J R7).

Likely shape: `sendMovementIntent`'s `owned` gains `!!this.ui.ui.stash`, the part the UI scene's gear
already reports (`uiSceneGear.report`) and `showStashChest` already reads. The doc comment above
`sendMovementIntent` names the stash beside the menu, the letter panel and the NPC's card.

## Files expected to touch

- `game-client/src/scenes/HubScene.ts` (`sendMovementIntent` and its doc comment)
- `game-client/src/scenes/HubScene.test.ts` (in or beside the "HubScene the stash chest's E (FS-VPD8Y
  R34, R43–44)" describe; `pressAtTheChest` and `gearOnTown` already report `stash`)

## Acceptance Criteria

- [x] With W held, E at the stash chest opens stash mode; the next frame sends one `{vx: 0, vy: 0}`, and
      no further `move` for WASD or the arrows pressed, released or pressed again while it is open
      (R45, R47).
- [x] A still player opening the stash sends no stop (R47).
- [x] Esc, I, B and a panel's × close it with W still held: the next frame sends `{vx: 0, vy: -1}`
      (R48, R49). Q does not close the overlay in the town (FS-HRH2J R4; `UIScene` `EVENT_GEAR_KEYS`
      return in the hub).
- [x] The plain overlay (I or B, not at the chest) with W held sends moves as today, no stop (R46).
- [x] A move in flight in stash mode does not release the hold (R50).
- [x] "should end stash mode with the overlay's keys, the next I opening the plain overlay (R37)", the
      chest's open-frame test (R32) and the chest's E tests (R34) still pass.
- [x] No game-server, proto or `ActionType` change in the diff.
- [x] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

None

## Spec Reference

FS-VPD8Y §Change: Opening the stash holds the player still: R45–R51, every acceptance criterion, the
Edge States.

## TDD Approach

- RED: `HubScene.test.ts` "should send one stop as the stash opens over a stride, and no move while it
  is open (R45, R47)", written like "should send no move for WASD while the menu is open, and stop a
  stride it interrupts" and FS-TQZ5J's "should send one stop as an NPC's card opens over a stride".
- GREEN: `owned` in `sendMovementIntent` reads `this.ui.ui.stash`.
- RED: "should walk on with the keys still held as the stash closes (R49)", table over Esc, I, B and a panel's ×.
- Pin: "should keep walking under the plain overlay (R46)", and "should send no stop for a still player
  opening the stash (R47)".
