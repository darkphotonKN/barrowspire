---
id: I-TQZ5J-60
status: done
implements: FS-TQZ5J
blocked_by: []
labels: [ready-for-agent]
title: "FS-TQZ5J § Change: A conversation holds the player still, slice 1: an NPC's card owns the movement keys and refuses the map mode icon"
---
Implements FS-TQZ5J §Change: A conversation holds the player still (R141–R150)

**Lane: AFK (game-client).** No game-server, proto, gateway or manifest change. No new message
(FS-B0H2D R29).

## What to Build

While the town shows an NPC's dialogue card (any card from `openDialogue` and every page turned from it,
not the Spire door's panel), the movement keys read as released, as the menu and the letter panel make
them. A stride in progress is stopped by one `move {vx: 0, vy: 0}`, and nothing more is sent until the
card closes. On close, the keys still held walk on at once. The door's panel keeps today's movement and
its walk-out close.

Under any card (the door's panel included), the map mode icon's press steps no mode, as M does not.
That is today's behaviour: the icon is built with `blocked: () => this.minimapKeysOwned()`, and the D6
guard table in HubScene.test pins it under a dialogue card; it gains a Spire door's panel row. Every
other corner icon and toggle key is already refused too. Pin each with a test, and guard any the tests
find open through the dialogue blocker. (Corrected 2026-11-24 at review: the first draft called the
icon the one toggle not yet guarded.)

Likely shape: `sendMovementIntent`'s `owned` gains an NPC's card open (a card that is not the door's
panel). Whether the open card is the door's is read from the card itself (its speaker), not kept in a
second field beside it.

## Files expected to touch

- `game-client/src/scenes/HubScene.ts` (`sendMovementIntent`, its doc comment; the door's panel read
  from the open card's speaker)
- `game-client/src/scenes/HubScene.test.ts`
- `game-client/src/ui/uiSceneCorner.test.ts`, `uiSceneTree.test.ts`, `uiSceneGear.test.ts`, only to pin
  refusals a sweep finds untested. `uiSceneDialogue.ts` and `uiBridge.ts` change only if a gap is found
  there (none is expected).

## Acceptance Criteria

- [ ] With W held, E at an NPC opens its card. The next frame sends one `{vx: 0, vy: 0}`, and no further
      `move` for WASD or the arrows pressed, released or pressed again while it is up (R141, R142).
- [ ] The same for a wandering resident, a fixed resident, the Confessor and a telling's turned page,
      with no `move` across the turn (R141; Edge States).
- [ ] A still player opening a card sends no stop (R142).
- [ ] Esc, Farewell pressed, or E on a card with no actionable row, with W still held: the next frame
      sends `{vx: 0, vy: -1}` (R146, R147).
- [ ] The door's panel: walking into the gate with W held keeps walking, and walking out closes it. The
      FS-0XMCP door tests pass: the walk-out one ("should not stack over another dialogue, nor close it
      on walking out") is extended to the hold, its original assertions kept (R143).
- [ ] Under an open NPC card, each corner icon (Menu, Inventory, Character, Party, Mailbox, Tree) changes
      nothing and plays `menu_error`. I, B, C, P, T, M and Enter change nothing. A party panel open before
      the card is still open after each (R144, R145).
- [ ] The map mode icon's press steps no mode under an NPC card or under the door's panel (R144).
- [ ] A resident walking out of talk range leaves its card up (R148). "should not stack over another
      dialogue, nor close it on walking out" still passes.
- [ ] The invite prompt, the ready check and the queue's Leave answer under a card as today (R149).
- [ ] No game-server, proto or `ActionType` change in the diff.
- [ ] Full client vitest, `tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

None

## Spec Reference

FS-TQZ5J §Change: A conversation holds the player still: R141–R150, every acceptance criterion, the
Edge States.

## TDD Approach

- RED: `HubScene.test.ts` "should send one stop as an NPC's card opens over a stride, and no move while
  it is up", written like "should send no move for WASD while the menu is open, and stop a stride it
  interrupts".
- GREEN: `owned` in `sendMovementIntent` reads the open card, excepting the door's panel.
- RED: "should walk on with the keys still held as the card closes", then "should keep walking under the
  door's panel".
- Pin: the map mode icon's press steps no mode under a dialogue card (today's, in the D6 guard table),
  and a Spire door's panel row added to that table. No GREEN step: the icon already reads M's guards.
- Sweep: one table test over the six corner icons and the toggle keys under an open card.
