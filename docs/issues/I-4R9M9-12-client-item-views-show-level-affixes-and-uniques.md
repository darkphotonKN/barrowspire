---
id: I-4R9M9-12
status: done
implements: FS-4R9M9
blocked_by: [I-4R9M9-3, I-4R9M9-6, I-4R9M9-9]
labels: [ready-for-agent]
title: "FS-4R9M9 slice 12: Run and loadout item views show rarity, item level, requirement, affixes and unique effects; rings can be worn"
---
Implements FS-4R9M9 §Requirements (Client 59–60; In-run state 54)

**Domain:** game-client · **Touches `internal/game/session.go`:** no · **Lane:** agent (frontend lane).

## What to Build

- `src/types/gameState.ts` `ItemState` gains `rarity`, `item_level`, `affixes`,
  `magic_resistance`, `unique_effect` (it already has `required_level`).
- One shared item-detail presenter (pure function → lines, unit-tested) used by the satchel
  (`ui/satchel.ts`), equipment panel (`ui/EquipmentPanel.ts`), container view
  (`ui/ContainerView.ts`) and the loadout (`scenes/LoadoutScene.ts`, generated client's
  `list-item-instances` fields): name in rarity colour (`marketplace/rarity.ts` mapping), base
  stats, "Item level N", "Requires level N" (highlighted above the character's level, FS-BDA7X
  R45), one line per affix (R59 phrasing table: `strength` → "+3 Strength", `attack_speed` →
  "+5% attack speed", `crit_chance` → "+2% critical chance", `flat_damage` → "+2 damage",
  `max_health` → "+12 maximum health", …), unique effect line + lore. Tier-0 affixes read like the
  rest. No affixes → no affix lines.
- Rings: the loadout's two ring slots accept rings (and only rings); the in-run equipment panel
  shows ring slots and equips/unequips rings via the existing equip messages; a ring icon built in
  code (`render/art/itemIcons.ts`; ADR-0021 rule, no sourced art).
- Appearance per `game-client/docs/design-guideline.md`; token-only styling (ADR-0013).

## Acceptance Criteria

- [ ] Presenter unit tests: a Runed item with 4 affixes, a unique, a legacy item (no affixes, ilvl 1).
- [ ] Satchel, equipment panel, container view and loadout render the presenter's lines.
- [ ] "Requires level N" is highlighted only when N > the character's level.
- [ ] A ring can be put in either ring slot in the loadout and equipped/unequipped in a run.
- [ ] Rings have an icon; `tsc` and the client test suite pass.

## Blocked By

I-4R9M9-3 (generated `list-item-instances` fields for the loadout), I-4R9M9-6 (world-state item
fields), I-4R9M9-9 (server-side ring equip).

## Spec Reference

FS-4R9M9 §Requirements 54, 59–60; §Acceptance Criteria "Protocol, gateway, client" rows 3–4.
User Stories 9, 16–17.

## TDD Approach

- RED: presenter test — affix list → expected lines in order.
- GREEN: presenter, then wire into each view.
