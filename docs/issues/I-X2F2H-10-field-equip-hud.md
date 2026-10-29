---
id: I-X2F2H-10
status: open
implements: FS-X2F2H
blocked_by: [I-X2F2H-1, I-X2F2H-5]
labels: [ready-for-agent]
title: "FS-X2F2H slice 10: the field scene offers the run's equip HUD, shared not copied (game-client)"
---
Implements FS-X2F2H §H (Requirement 56), §Acceptance Criteria, §Edge States

**Author: agent** (game-client only). A slice the original slicing missed: Requirement 56 and its
acceptance criterion say the field scene offers the satchel **and equip HUD**, shared with the run
scene, never copied. I-X2F2H-5 shipped the satchel through `fieldPiles`; the field scene still
says "The equip HUD comes later", and no issue owned it. Without it a player cannot equip a found
item in a field, so the edge state "equipping a found item in a field makes it worn in the stored
loadout" cannot happen from the client.

## What to Build

1. **One equip HUD, two scenes.** The run's inventory and equipment bookkeeping (the server
   inventory merged with items taken but not yet confirmed, the server's equipment mapped onto the
   panel's slots, the panel's equip and unequip sent to the server with the optimistic update) is
   lifted out of `BarrowspireScene` into one Phaser-free module in `src/ui/` that drives the run's
   `EquipmentPanel`. The run scene uses it with **no behaviour change**.
2. **The field composes it**, as `fieldPiles` composes the run's `ContainerView`: the same panel,
   the same keys (I opens and closes it, E over it equips or unequips the hovered item, Q closes
   it), the same character-level marks, fed from each field state's `current_player` inventory and
   equipment.
3. **Exactly the run's messages**: `equip` / `unequip` with `{ item_entity_id }`; nothing new on
   the wire, nothing on the server.
4. A click while the panel is open is never an attack, as in the run. An item taken from a pile or
   chest is held in the inventory while its loot is pending, as in the run.

## Acceptance Criteria

- [ ] In a field, I opens the run's equipment panel with the player's inventory and worn gear; I or
      Q closes it.
- [ ] E over an inventory row sends `equip { item_entity_id }`; E over a worn slot sends
      `unequip { item_entity_id }`: the run's messages, byte for byte.
- [ ] While the panel is open, E does not reach for a pile or chest, and a click does not attack.
- [ ] The run scene's equip HUD behaves as before (its tests unchanged and green).
- [ ] No kill stats, no new server messages, no file under `game-server/` changed.
- [ ] `tsc`, `eslint` and `vitest`: no new failures versus the branch point.

## Blocked By

- I-X2F2H-1: the field scene.
- I-X2F2H-5: the field's satchel and piles, whose keys this slice shares.

## Spec Reference

FS-X2F2H §H R56 ("offers the satchel and equip HUD, all shared with the run scene, never copied");
§Acceptance Criteria (the field scene shares the run scene's HUD drawing); §Edge States
("Satchel or equipment change in the field ... equipping a found item in a field makes it worn in
the stored loadout": the client half).

## TDD Approach

- RED: the shared HUD sends `equip` / `unequip` with `{ item_entity_id }` and updates its lists
  optimistically; a state's inventory merges with a pending take; the server's equipment maps
  chest/gloves/legs onto body/hands/feet.
- RED: the field scene opens the panel on I and routes E to it while it is open.
- GREEN: the shared module; the run scene moved onto it; the field scene composing it.
