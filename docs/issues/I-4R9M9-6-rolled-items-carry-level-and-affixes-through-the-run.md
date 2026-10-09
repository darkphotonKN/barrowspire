---
id: I-4R9M9-6
status: done
implements: FS-4R9M9
blocked_by: [I-4R9M9-1, I-4R9M9-2, I-4R9M9-5, I-BDA7X-8]
labels: [ready-for-agent]
title: "FS-4R9M9 slice 6: Rolled items carry level, affixes and required level through the run"
---
Implements FS-4R9M9 §Requirements (Item level 10; Chests 47; Persistence 49, 53; In-run state 54; Catalogue 8)

**Domain:** game-service · **Touches `internal/game/session.go`:** **yes** — `InitializeItems`, `generateItems` / `dropLoot`, `protoToItemConfig` in `addPlayerLocked`, `getRawMatchState` slot blocks. Keep each touch a call into a new file (see below). · **Lane:** agent-ready.

## What to Build

Chest loot rolls through slice 5's roll and its result survives the whole run, both ways.

- **Pools** (new `internal/game/item_pool.go`; `InitializeItems` calls it): build per-type pools
  from `ListItemTemplates`, now including **rings** (today an unknown type aborts
  `InitializeItems` — it must not), carrying `min_item_level`, `required_level`; keep a separate
  **unique pool** (templates with a unique row: effect code, text, fixed affix ranges) for slice 7.
  Unique templates never enter the base pools.
- **Chests:** `generateItems` passes the **area level** (highest in-play delver level +
  2 × (floor − 1), `systems.CurrentFloor`, measured at first open) to the roll. Counts and the
  20 / 30 / 50 split unchanged; no rings from chests (R47).
- **Components:** `ItemComponent` gains `ItemLevel`, `Affixes`, `UniqueEffectCode`,
  `UniqueEffectText` (pure data); `CreateItemEntity` copies them.
- **Loadout hydration** (`protoToItemConfig` → move into a new-file helper): ilvl, affixes,
  required level, unique effect code/text from `ItemInstance` (R53).
- **Extraction:** `types.ExtractedItem` gains ilvl, required level, affixes; the ~10
  `getRawMatchState` slot blocks + inventory copy them (replace the copy blocks with one
  `extractedItemFrom(*ItemComponent)` helper in a new file — one touch); `extractedItemToPb`
  (`service.go`) fills `events.Item` 18–20.
- **World state** (`internal/serializer/state_serializer.go`, `types.ItemState`): every item
  carries `rarity` (code, mapped from the rarity id via the loaded rarities), `item_level`,
  `required_level`, `affixes` (`[{stat,tier,value}]`), `magic_resistance`, `unique_effect`.

## Acceptance Criteria

- [ ] A session with a ring template in the catalogue starts and keeps rings out of chests.
- [ ] A chest opened on floor 2 by a level-5 party yields items with ilvl 7.
- [ ] A loadout item with affixes is seated, shown in state and extracted with the same ilvl,
      affixes and required level (session test with a fake items client).
- [ ] The extraction event for a chest item carries ilvl, required level and affixes.
- [ ] World-state items carry the R54 fields; existing session / serializer tests green.

## Blocked By

I-4R9M9-1 (proto instance/event fields), I-4R9M9-2 (template min ilvl, rings, unique rows),
I-4R9M9-5 (the roll), I-BDA7X-8 (`RequiredLevel` plumbing and `handleEquip` / seating edits in
the same code).

## Spec Reference

FS-4R9M9 §Requirements 8, 10, 20, 47, 49, 53–54; §Acceptance Criteria "Drops" row 2 (chest
half), "Protocol, gateway, client" row 1 (items). User Stories 16, 19, 20.

## TDD Approach

- RED: session test — loadout item with two affixes round-trips seat → state → extraction event.
- GREEN: component fields, hydration helper, extraction helper, serializer fields.
