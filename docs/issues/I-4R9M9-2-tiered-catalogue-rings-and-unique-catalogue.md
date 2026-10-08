---
id: I-4R9M9-2
status: done
implements: FS-4R9M9
blocked_by: [I-4R9M9-1]
labels: [ready-for-agent]
title: "FS-4R9M9 slice 2: Catalogue knows base tiers, rings and the Fabled uniques"
---
Implements FS-4R9M9 §Requirements (Catalogue 1–9; Persistence 51–52 for unique effect)

**Domain:** proto (items) + items-service · **Touches `internal/game/session.go`:** no · **Lane:** agent-ready.

## What to Build

items-service can hold and serve the v1 catalogue shape: level-gated bases, a ring item type,
uniques as templates with a unique row, and the reweighted Fabled tier.

- **Migration** (next free number after slice 1's):
  - `item_templates.min_item_level INT NOT NULL DEFAULT 1 CHECK (>= 1)`.
  - `ring` admitted wherever `item_type` is constrained (`item_templates.valid_item_type`, the
    `item_instances` item_type CHECK); a `rings` table mirroring `armors` minus stats
    (id, rarity_id, description, audit columns) so a ring template has its `item_id` row.
    `item_instances_armor_slot_check` already allows NULL slot for non-armor.
  - `unique_items`: `template_id` PK → `item_templates(id)`, `effect_code TEXT NOT NULL CHECK
    (effect_code IN ('kill_frenzy','melee_reflect','pierce','kill_heal','burning_dash','floor_attributes'))`,
    `effect_text TEXT NOT NULL`, `fixed_affixes JSONB NOT NULL DEFAULT '[]'` (`[{stat,min,max}]`).
  - `item_rarities.drop_rate_multiplier` widened (e.g. `NUMERIC(6,4)`), Fabled set to **0.005**;
    every `fabled` instance relabelled `runed` (stats/names untouched). Header: the relabel is not
    reversible; down restores the column and 0.01 only.
- **Proto** `items.proto` (regenerate): `ItemTemplate` gains `min_item_level` (22) and
  `optional UniqueItem unique` (23) with `message UniqueItem { string effect_code = 1; string effect_text = 2; repeated AffixRange fixed_affixes = 3; }`
  and `message AffixRange { string stat = 1; int32 min = 2; int32 max = 3; }`. `ItemInstance`
  gains `unique_effect_code` (24) and `unique_effect_text` (25); `ItemSummary` gains
  `optional string unique_effect_text` (18).
- **Reads:** `ListItemTemplates` returns rings (LEFT JOIN `rings`), `min_item_level`,
  `required_level` and the unique row. `GetLoadoutWithItems` / `ListItemInstances` fill the
  unique effect code + text, `GetItemSummaries` the text only, by joining `unique_items` on the
  instance's template.

## Acceptance Criteria

- [ ] After migrating, Fabled's multiplier reads 0.005 and no instance is `fabled`.
- [ ] A ring template (no stats) and a unique template with its unique row can be inserted and are
      returned by `ListItemTemplates` with min ilvl, required level and unique data.
- [ ] An instance of a unique template reports its effect code and text (`ItemInstance`) and text
      only (`ItemSummary`); a non-unique reports neither.
- [ ] A `ring` instance can be stored (null weapon/armor columns) and listed.
- [ ] Repository tests cover the ring join, the unique join and the relabel; existing tests green.

## Blocked By

I-4R9M9-1 (same proto file and migration sequence; serialised to avoid number/field clashes).

## Spec Reference

FS-4R9M9 §Requirements 1–9, 51–52; §Acceptance Criteria "Catalogue and storage" rows 1–3, 6;
§Edge States "Relabelled ex-Fabled instances". User Stories 2, 9, 14, 22, 28.

## TDD Approach

- RED: repo test — `ListItemTemplates` returns a seeded ring and a unique with its effect.
- GREEN: migration + joins + proto mapping.
