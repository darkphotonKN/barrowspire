---
id: I-BDA7X-8
status: done
implements: FS-BDA7X
blocked_by: [I-BDA7X-4, I-BDA7X-7]
labels: [ready-for-agent]
title: "FS-BDA7X slice 8: Equipment above the character's level cannot be worn"
---
Implements FS-BDA7X §Requirements (Level requirements on equipment 30–34)

**Domain:** game-service · **Touches `internal/game/session.go`:** yes (`handleEquip`, `addPlayerLocked` loadout seating, item config from templates in `InitializeItems` / loot) · **Lane:** backend human lane by default; agent-ready if handed to `/develop`.

## What to Build

Levels gate gear, authoritatively, in game-service.

- `ItemConfig` / `ItemComponent` carry `RequiredLevel`: from `ItemInstance.required_level` for
  loadout items, from the template for items rolled in the run.
- Seating: loadout items whose required level exceeds the character's level go into the
  inventory (item id list) instead of their slot — carried and extractable, not worn.
- `handleEquip`: equipping an item whose required level exceeds the current level is refused;
  the item stays put and the player gets an error naming the required level
  (`sendErrorToPlayer`). Unequip is never gated. Applies to every slot, consumables included.
- A mid-run level-up (slice 5) makes the same equip succeed; nothing auto-equips.

## Acceptance Criteria

- [ ] A level-3 character seated with a level-5 helm has it in the inventory, head slot empty.
- [ ] Equipping a level-5 item at level 3 is refused with "requires level 5"; unequip works.
- [ ] After reaching level 5 the same equip succeeds.
- [ ] Rolled loot carries its template's required level.
- [ ] Extraction still reports the seated-to-inventory item (it is not lost).
- [ ] Session tests cover each case; existing tests green.

## Blocked By

I-BDA7X-4 (character level in the run); I-BDA7X-7 (`required_level` on `ItemInstance`).

## Spec Reference

FS-BDA7X §Requirements 30–34; §Acceptance Criteria "Level requirements" rows 2–3; §Edge States
"Over-level item picked up in the run". User Stories 20–23.

## TDD Approach

- RED: `handleEquip` on an over-level item leaves the slot nil and sends an error.
- GREEN: required-level check before the slot switch.
