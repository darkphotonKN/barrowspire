---
id: I-4R9M9-4
status: done
implements: FS-4R9M9
blocked_by: [I-4R9M9-1, I-4R9M9-2]
labels: [ready-for-agent]
title: "FS-4R9M9 slice 4: Dev seed creates the tiered catalogue, rings, uniques and affixed instances"
---
Implements FS-4R9M9 §Requirements (Catalogue 3–6, 9; Dev seed 62–63)

**Domain:** game-server/scripts (`seed-dev.sh`, against items-service DB + gateway) · **Touches `internal/game/session.go`:** no · **Lane:** agent-ready.

## What to Build

`seed-dev.sh` stands up the whole v1 catalogue and believable owned items.

- Keep the 24 tier I bases. Add the 44 tier II / III bases from FS-4R9M9 R3–R4 through the
  existing `complete-weapon` / `complete-armor` endpoints with `required_level` 6 / 13 and a
  one-line description each (F8T3H R4 register), then `UPDATE item_templates SET min_item_level`
  8 / 15 via psql.
- Rings via SQL (no HTTP create, R9): 3 ring bases (Iron Band 1, Silver Band 8, Barrow-gold Band
  15; required level 1) with `rings` rows at `normal`.
- The 6 uniques of R31 via the complete-* endpoints (weapon/armor) or SQL (rings) at the `fabled`
  rarity, with their base stats, required level, min ilvl and lore; then their `unique_items` rows
  (effect code, effect text, fixed affix ranges).
- The "already seeded" check counts the new total (77 templates) instead of 24.
- Re-author the owned instances (R63): no random Fabled; every tier from Normal to Runed
  represented; Uncommon–Runed instances carry an `item_level`, `affixes` and `required_level`
  that the roll (FS-4R9M9 R12–R23) could have produced; at least two are uniques (with tier-0
  fixed affixes in range); at least one is a ring. The header comment points at the game-service
  loot roll and tuning files as the source of the rules.

## Acceptance Criteria

- [ ] On a freshly migrated DB the script creates 77 templates and 6 unique rows; a re-run skips
      and never duplicates.
- [ ] Every seeded instance obeys R13 / R16–R18 / R23 (hand-checked against the tuning tables; a
      comment per instance names its ilvl and tiers).
- [ ] The marketplace shows seeded affixes / uniques once I-4R9M9-3 is in.

## Blocked By

I-4R9M9-1 (instance columns), I-4R9M9-2 (`min_item_level`, rings, `unique_items`).

## Spec Reference

FS-4R9M9 §Requirements 3–6, 9, 31, 62–63; §Acceptance Criteria "Seed". User Story 31.

## TDD Approach

- Script slice, no unit tests: verify by running against a fresh local DB and querying counts and
  a sample of instances.
