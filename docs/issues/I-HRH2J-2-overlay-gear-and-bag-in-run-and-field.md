---
id: I-HRH2J-2
status: done
implements: FS-HRH2J
blocked_by: []
labels: [ready-for-agent]
title: "FS-HRH2J slice 2: the gear and bag overlay in runs and field worlds"
---
Implements FS-HRH2J §A Requirements 1–12, §B Requirements 13–22

**Author: agent**

## What to Build

The run's centred equip panel becomes the overlay's right panel, drawn over the live run and
field world: gear slots on top, a 6×5 bag grid below, with I/B/ESC open-close, the pointer rule
and the client-side full-bag pre-checks. The left (stats) panel is laid out as an empty,
correctly-sized and styled placeholder here so the layout is final; slice 3 fills it.

- The overlay component (rework `src/ui/EquipmentPanel.ts` or replace it with a new overlay
  module; keep the `HudPanel` port `EquipmentHud` drives, extending it only as needed). Layout per
  R2: edge-anchored, ~95% height with a top gap, small radius, 20–30% clear middle band, re-laid
  out on resize. Look per R3 (game palette world panels; baked item icons; rarity edge; item tip on
  hover).
- Bag grid 6×5, `N / 30` count, fill in bag order (R14); over-capacity rows render as in R23 if a
  bag ever reports >30 (shared with slice 4).
- Equip / unequip by hover + right-click or hover + E (R16–17); left-click does nothing; no drag
  (R18). Required-level dimming unchanged (R19).
- Keys in `BarrowspireScene.ts` and `FieldScene.ts`: I and B toggle; ESC closes the overlay before
  the run's ESC menu (R5); Q still closes; I/B ignored while the run's ESC menu is open (R6); E
  owned by the overlay while open (R10); H help lists `I / B` (R11).
- Pointer rule (R8): a press over either panel never casts, attacks or starts/feeds a Shadow Shot
  hold; a press in the clear band works as with the overlay closed. Replaces the run's
  `if (this.equipment?.isOpen()) return;` and the field's `takesPointer` "open swallows all"
  rule. Opening still cancels a hold (R9).
- WASD keeps moving with the overlay open (R7).
- Full-bag pre-checks (R20–22): unequip not sent at 30; container-view click / F (`ContainerView`,
  `BarrowspireScene.lootChestItem`) and field-pile take (`fieldPiles`) not sent at 30 counting
  pending items; "Your bag is full." via each scene's existing notice. Equip swap still sent.

## Acceptance Criteria

- [ ] I and B each toggle the overlay in a run and a field world; ESC and Q close it.
- [ ] Run: one ESC with the overlay open closes it and leaves the ESC menu closed.
- [ ] Panels laid out per R2 (edge-anchored, ~95% height, clear 20–30% middle band), re-laid out on resize; game-palette world-panel look.
- [ ] WASD moves with the overlay open.
- [ ] A left/right press over a panel sends no `cast_skill` and starts no Shadow Shot hold; a press in the middle band does.
- [ ] Right-click or E on a hovered bag item sends `equip`; on a worn slot sends `unequip`; displaced items show at the end of the bag.
- [ ] Bag grid 6×5 with `N / 30`; hover shows the item tip.
- [ ] At 30: unequip and pickups are not sent and "Your bag is full." shows; equip swap is sent; two quick takes at 29 send one.
- [ ] Left (stats) panel placeholder occupies its mirrored position.
- [ ] Unit tests (vitest) for the pointer-over-panel rule, the pre-check (incl. pending), key toggles and ESC precedence; `EquipmentHud.test.ts`, `EquipmentPanel.test.ts`, `BarrowspireScene.test.ts`, `FieldScene.test.ts`, `fieldPiles.test.ts`, `ContainerView.test.ts` updated and passing.
- [ ] No WS message shape change.

## Blocked By

None (the client pre-check stands alone; I-HRH2J-1 makes the server authoritative and can land
in either order)

## Spec Reference

FS-HRH2J §A R1–12, §B R13–22 (and R23's rendering); User Stories 1–16, 25, 30; Edge States
"Empty bag", "Bag exactly full", "Pending pickups", "Consumable slots full", "Below required
level", "World switch while open", "Dead, fallen, escaped or spectating", "Small window".

## Files expected

- `game-client/src/ui/EquipmentPanel.ts` (+ `.test.ts`) or a new overlay module under `src/ui/`
- `game-client/src/ui/EquipmentHud.ts` (+ `.test.ts`)
- `game-client/src/ui/ContainerView.ts` (+ `.test.ts`)
- `game-client/src/scenes/BarrowspireScene.ts` (+ `.test.ts`)
- `game-client/src/scenes/FieldScene.ts` (+ `.test.ts`), `game-client/src/scenes/fieldPiles.ts` (+ `.test.ts`)
- `game-client/src/ui/itemTip.ts`, `game-client/src/render/art/itemIcons.ts` (read/reuse)

## TDD Approach

- RED: a pure "is this point over a panel" / "may this press attack" test for a press inside and
  outside the panels; a pre-check test (29 + 1 pending → refuse).
- GREEN: the overlay's layout rects and the scenes' pointer handlers consulting them.
