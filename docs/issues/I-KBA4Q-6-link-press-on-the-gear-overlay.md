---
id: I-KBA4Q-6
status: done
implements: FS-KBA4Q
blocked_by: [I-KBA4Q-2, I-KBA4Q-4, I-KBA4Q-5]
labels: [blocked]
title: "FS-KBA4Q slice 6: Ctrl+Alt or Cmd+Option left-click on an item links it into chat"
---
Implements FS-KBA4Q §Requirements A (R1–R8)

**Lane: AFK (game-client).** No server change. End to end with slice 1 once both are in.

## What to Build

In the gear overlay, a left-press (`button` 0) with Ctrl+Alt or Meta+Alt held, read from the
press's own event, on an item in a bag cell, a worn slot or a stash cell hands that item to the
chat input's link (slice 5), in the hub, a field and a run. The field is focused afterwards
whether or not it was before: this one press on the overlay does not let go of the field
(amending FS-TQZ5J R130, R131 for it alone). The press wears, moves and closes nothing. A
right-button press with the link modifiers held does nothing at all (R6). Both hint strings gain
`Ctrl+Alt+click: link in chat` (R8). Plain left-press, right-click, E, Shift-hover and the tip
are unchanged.

If a browser cannot tell Control+click from a right-click in a way R6 does not cover, stop and
report: that is the owner's call, not a different key.

## Expected files

- `game-client/src/ui/GearOverlay.ts` (**hotspot**: `onPointerDown`, the item under the pointer,
  `GEAR_HINT`, `STASH_HINT`, an `onLink` in what the overlay is built with) and its test
- `game-client/src/ui/EquipmentHud.ts`, `game-client/src/ui/HubGear.ts` (passing `onLink` to the
  overlay they drive)
- `game-client/src/ui/uiSceneGear.ts` (`GearWiring` gains the link) and its test
- `game-client/src/ui/uiSceneChat.ts` (`ChatPiece` / `UiChatSlot` gain `link(item)`) and its test
- `game-client/src/ui/ChatWindow.ts` (**hotspot**, small: `link(item)` to its input; `onPress`
  not blurring on a link press) and its test
- `game-client/src/scenes/UIScene.ts` (joining the gear slot's link to the chat slot)
- `game-client/src/ui/gearOverlayLayout.ts` only if the longer hint needs it (the 40 px band)

## Acceptance Criteria

- [ ] FS-KBA4Q §Acceptance Criteria "Client: linking": the first six criteria (both
      combinations, the caret insert seen from the overlay, worn slot and stash cell in each
      world, nothing worn or moved or closed, the right-button rule, the field still focused),
      the blocked case and the hint strings.
- [ ] A link press on the ×, an empty cell or the panel's ground does nothing, and a plain
      left-press on the × still closes the panel.
- [ ] The modifiers are read from the pointer's native event: the press links while the UI
      scene's keyboard is off for typing.
- [ ] The hint overlaps neither the purse line nor the grid at 1080 and 1280 logical width.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence` and `npx tsc --noEmit` pass.

## Blocked By

I-KBA4Q-2 (chat opens with a panel open), I-KBA4Q-5 (the input's link), I-KBA4Q-4 (serialised
behind it on the hotspot `ChatWindow.ts`)

## Spec Reference

FS-KBA4Q R1 (the link press), R2 (where), R3 (what it does), R4 (typing goes on), R5 (nothing
else changes), R6 (right button with the modifiers), R7 (where chat may not open), R8 (the hint).
Amends FS-HRH2J R18, FS-VPD8Y R38, FS-NV54P R24, FS-TQZ5J R130–R131. User stories 1, 2, 3, 18, 19.

## TDD Approach

- RED: a `pointerdown` with `button: 0` and `event: {ctrlKey: true, altKey: true}` over a bag
  item calls `onLink` with that item and sends no equip.
- GREEN: the link branch at the head of `onPointerDown`.
- RED: the same with `metaKey`; with `button: 2` nothing is called at all; with no modifiers
  nothing changes from today.
- Then the wiring test from the gear slot to the chat slot, and the hint strings.
