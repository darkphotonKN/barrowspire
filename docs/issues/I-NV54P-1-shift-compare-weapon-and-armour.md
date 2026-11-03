---
id: I-NV54P-1
status: done
implements: FS-NV54P
blocked_by: []
labels: []
title: "FS-NV54P slice 1: Shift over a bag weapon or armour shows the worn tip beside it (game-client)"
---
Implements FS-NV54P §A, §B, §C, §D, §E, §F (R1–R26, rings excepted: R8's ring clause, R14's ring captions)

The whole compare gesture for one-slot items: the Shift trigger, what compares, the captioned worn
tip, the tip row and its placement, staying true across redraws, and the hint. Rings follow in
I-NV54P-2 on top of the row built here.

## What to Build

- **Shift, only while open** (R1–R7, R23): `GearOverlay` (`src/ui/GearOverlay.ts`) starts
  listening for Shift in `show()` and stops in `hide()`, beside its pointer handlers. No key
  capture (R5): the browser keeps Shift for DOM fields. Press and release re-show the current
  hover's tips without a pointer move; Shift already down counts. Shift over anything but a bag
  cell holding an item adds nothing (worn slots, stash cells, empty cells, outside the cells).
  The chat input's keyboard switch-off and the canvas blur reset must hide the worn tips (R6,
  edge state "Window or canvas loses focus"); if the keyboard's blur reset does not release Shift,
  clear compare on blur in the overlay.
- **What compares** (R8–R12): target slots from `getValidSlotsForItem`; consumables and items with
  no valid slot never compare; an empty target slot contributes nothing; nothing worn → the item's
  tip alone. Works in every world and in stash mode (bag cells only); below-level, not-available
  items and a set status line still compare.
- **The worn tip** (R13–R16): `buildItemTip` (`src/ui/itemTip.ts`) gains an optional caption,
  drawn as the tip's first line in its existing badge caption style (caption size, label tone,
  letter-spaced, upper-cased); with no caption the tip is exactly today's. A worn weapon or armour
  tip is captioned "Worn"; it is built from the same `itemView(item, characterLevel, world)` as the
  hover tip. No deltas, no new colour, no art.
- **The row** (R17–R20): hovered tip first, then worn tips in slot order, small gap, tops aligned;
  right of the pointer at today's offset, flipped whole to the left where it would leave the right
  edge (order unchanged), risen above the pointer where it would leave the bottom (tallest tip),
  pushed in from the right edge where neither side fits, never past the left edge (left wins on a
  screen narrower than the row). Put the placement in a pure function in
  `src/ui/gearOverlayLayout.ts` (row widths and heights, pointer, camera size → positions) so it is
  tested without Phaser; `moveTip` uses it for one tip or many.
- **Staying true** (R21–R22): the worn tips show, move, hide and rebuild with the item tip; every
  path that hides the tip today (`hideTip`, `teardown`, redraw, hide, shutdown) takes them too.
  After an equip with Shift held, the redraw's re-hover compares against the gear now worn.
- **The hint** (R24–R25): `GEAR_HINT` and `STASH_HINT` gain `  //  Shift: compare` between the
  gesture part and the close part, exactly as FS-NV54P R24 writes them; check the longer hint stays
  inside the right panel, clear of the bag grid, at the overlay test sizes (adjust the layout's
  hint area in `gearOverlayLayout.ts` only if it does not).
- Controls help (H) unchanged (R26).

## Acceptance Criteria

- [ ] Overlay open, pointer on a bag weapon with a weapon worn, Shift held: a second tip captioned "Worn" shows the worn weapon; with the weapon slot empty, no second tip. Same for each armour slot.
- [ ] Shift pressed mid-hover shows the worn tip; released hides it; no pointer move needed; the item tip stays.
- [ ] Shift already down when the pointer reaches the item shows the worn tip with the item tip.
- [ ] Consumables and items with no valid slot never compare; worn slots, stash cells, empty cells and space outside the cells add nothing under Shift.
- [ ] Closed overlay: Shift draws nothing and no Shift listener is attached; closing removes it; Shift is not captured.
- [ ] Stash mode: a bag item compares; a stash item does not.
- [ ] The worn tip comes from `buildItemTip` with the same view as the item's own hover tip (same width, rarity edge, standing note, requirement); the hovered tip has no caption; no delta or better/worse mark is drawn.
- [ ] Placement (pure-function tests, table-driven): right of the pointer; flipped whole near the right edge; raised near the bottom; pushed in from the right where neither side fits; left edge kept on a screen narrower than the row.
- [ ] No worn tip survives moving to another cell, a redraw (state change, equip, unequip, stash move, resize), closing or scene shutdown; after a Shift-held equip the worn tip shows the newly worn item.
- [ ] Below-level and not-available bag items compare; a set status line does not stop it.
- [ ] `GEAR_HINT` / `STASH_HINT` read as in FS-NV54P R24 and the hint stays inside the right panel, clear of the grid.
- [ ] Tests pass (vitest, next to the code); typecheck and lint clean; no game-server, wire, proto, OpenAPI, generated-client or art change.

## Blocked By

None

## Spec Reference

FS-NV54P §A R1–R7, §B R8–R12 (weapon and armour), §C R13–R16 ("Worn" caption), §D R17–R20,
§E R21–R23, §F R24–R26; User Stories 1, 4–9, 10–20 (rings excepted); Edge States (all but the
both-rings row).

Files expected: `game-client/src/ui/GearOverlay.ts`, `game-client/src/ui/GearOverlay.test.ts`,
`game-client/src/ui/itemTip.ts`, `game-client/src/ui/gearOverlayLayout.ts`,
`game-client/src/ui/gearOverlayLayout.test.ts`.

## TDD Approach

- RED: in `GearOverlay.test.ts`, hover a bag sword with an axe worn, emit Shift down on the
  recording scene's keyboard, expect the axe's name and a "WORN" caption drawn; emit Shift up,
  expect them destroyed. The recording scene needs a keyboard emitter (extend `recordingScene`).
- GREEN: Shift listener in `show()`/`hide()`, compare targets from `getValidSlotsForItem`, the
  caption option on `buildItemTip`, the row placement function.
