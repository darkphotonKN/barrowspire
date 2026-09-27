---
id: I-2325V-4
status: open
implements: FS-2325V
blocked_by: [I-2325V-2]
labels: [ready-for-agent]
title: "FS-2325V slice 4: satchel container view replacing the chest item-row UI"
---
Implements FS-2325V §D

**Wave 2.** Needs the item icons and loader from slice 2. Independent of the projection (the
view is screen-space), so it can run **alongside I-2325V-3**. Keep BarrowspireScene edits to the
thin hook in the container/chest UI region, and rebase onto slice 1 before merging.

## What to Build

`src/ui/ContainerView.ts`: the leather satchel panel.

- **Open:** it pops in (short scale and alpha ease), the flap lifts (a vertical flip to negative
  scale with a darkened underside), and item icons drop in with a short stagger.
- **Close:** reverses the open.
- **Hover:** shows the item name.
- **Missing icon:** unmapped items use the generic fallback icon.

Satchel art is baked (slice 2) or drawn procedurally in the module, with colours from `BARROW`.
The spike's satchel is the visual reference.

It **replaces only the presentation** of today's chest item-row UI (`createItemRows` and
friends). It opens and closes on the same triggers. Clicking an icon does exactly what clicking
the row did: same `interact` message, same `lootedAt` optimistic-pending guard. There is no drag
and no client-side inventory state.

## Acceptance Criteria

- [ ] Opens and closes on the old triggers, including walking away and the container vanishing.
- [ ] Captured WS message for an icon click is identical to the old row click for the same item.
- [ ] A click during a pending loot is ignored exactly as the row UI ignored it.
- [ ] Hover shows the name; unmapped items show the fallback icon.
- [ ] `git diff main... -- game-server/` is empty.
- [ ] `npm run lint`, `npm run lint:fence`, `npm test` pass.

## Blocked By

I-2325V-2 (item icons + loader)

## Spec Reference

FS-2325V §D.1–D.6. User stories 15, 16, 17.

## TDD Approach

- RED: `ContainerView.test.ts`: given container contents, the view emits the same loot callback
  payload as the row UI's handler, and suppresses it while `lootedAt` is pending.
- GREEN: view model + Phaser rendering split so the logic is testable without a canvas.
