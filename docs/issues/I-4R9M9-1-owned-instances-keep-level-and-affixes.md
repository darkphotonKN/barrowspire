---
id: I-4R9M9-1
status: done
implements: FS-4R9M9
blocked_by: []
labels: [ready-for-agent]
title: "FS-4R9M9 slice 1: Owned instances keep item level, affixes and their own required level"
---
Implements FS-4R9M9 §Requirements (Persistence and extraction 48–53; Affixes 16, 19–20; Required level 24)

**Domain:** proto (items + events) + items-service · **Touches `internal/game/session.go`:** no · **Lane:** agent-ready.

## What to Build

The storage and transport half of "affixes and item level on owned instances", end to end
inside items-service, so every later slice has somewhere to put what it rolls.

- **Proto** (`common/api/proto`, regenerate with `make -C game-server/common gen`; local protoc
  is v3.20.3; never hand-edit generated Go):
  - `items.proto`: new `message Affix { string stat = 1; int32 tier = 2; int32 value = 3; }`;
    `ItemInstance` gains `item_level` (22), `repeated Affix affixes` (23); `ItemSummary` gains
    `item_level` (15), `required_level` (16), `repeated Affix affixes` (17). Field 21
    (`required_level`) keeps its number; its comment changes to "derived requirement; the
    template's for legacy rows".
  - `events/game.proto` `Item`: `item_level` (18), `required_level` (19),
    `repeated ItemAffix affixes` (20) with `message ItemAffix { string stat = 1; int32 tier = 2; int32 value = 3; }`
    (separate package, so its own message). Additive; stats-service / notification-service ignore.
- **Migration** (next free items-service number): `item_instances` gains
  `item_level INT NOT NULL DEFAULT 1 CHECK (item_level >= 1)`,
  `affixes JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(affixes) = 'array')`,
  `required_level INT NULL CHECK (required_level >= 1)`. Down drops them.
- **Consumer** (`ProcessItemsExtracted` → `ConvertSingleProtoItemtoItemInstance` /
  `BatchUpsertItemInstances`): stores item level (0 → 1), required level (0 → NULL) and affixes.
  A malformed affix entry (unknown stat code, tier outside 0–3, negative value) is dropped with a
  `slog.Warn`; the item is still stored (R50). Known stat codes are FS-4R9M9 R17's eleven.
- **Reads:** `GetLoadoutWithItems`, `ListItemInstances` and `GetItemSummaries` return item level,
  affixes, and `required_level = COALESCE(instance.required_level, template.required_level)`.

## Acceptance Criteria

- [ ] An extraction event item with ilvl 9, required level 6 and two affixes is stored with all
      three and read back identically by `ListItemInstances`, `GetLoadoutWithItems` and
      `GetItemSummaries`.
- [ ] An event item without the new fields stores ilvl 1, `[]`, NULL; reads report the template's
      required level.
- [ ] A malformed affix entry is dropped with a warning; the rest of the item persists.
- [ ] A loadout item re-extracted with its affixes upserts them unchanged.
- [ ] Repository tests cover the COALESCE and the JSONB round trip; existing tests green.

## Blocked By

None

## Spec Reference

FS-4R9M9 §Requirements 16, 19–20, 24, 48–53; §Acceptance Criteria "Catalogue and storage" rows
4–6; §Edge States "Legacy instances and old events", "Malformed affix from a producer". User
Stories 19, 20, 29.

## TDD Approach

- RED: consumer test — event item with affixes → instance read back has them.
- GREEN: migration, model fields (`Affixes` as a JSON-scannable slice), insert/upsert columns,
  read joins.
