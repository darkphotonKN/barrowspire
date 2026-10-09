---
id: I-4R9M9-5
status: done
implements: FS-4R9M9
blocked_by: [I-BDA7X-8]
labels: [ready-for-agent]
title: "FS-4R9M9 slice 5: The loot roll rolls item level, base tier, affixes and required level"
---
Implements FS-4R9M9 §Requirements (Item level 11; The loot roll 12–15; Affixes 16–18; Rarity roll 21–22; Required level 23; Uniques 26; Tuning 64)

**Domain:** game-service (`internal/game/loot_roll.go`, new `internal/game/loot_tuning.go`, `internal/types` item config) · **Touches `internal/game/session.go`:** no · **Lane:** agent-ready.

## What to Build

The pure roll, rewritten. No session wiring (slice 6 does that).

- New `loot_tuning.go` beside `monster_tuning.go`: base-tier unlocks/requirements, the R17 affix
  table (stat, bands per tier, eligible types/slots), affix counts, rarity multipliers
  (1.00 / 1.05 / 1.10 / 1.15), weight modifiers (ilvl / 40 on Rare+, elite ×2, demon ×4 + no
  Normal), caps used later (attack speed 50, move speed 30). Every FS-4R9M9 number in one place.
- `types.ItemConfig` gains `ItemLevel int`, `Affixes []Affix` (`{Stat string; Tier, Value int}`)
  and uses the `RequiredLevel` field I-BDA7X-8 adds (do not add a second one).
- `rollLoot` becomes a roll over (random source, candidate templates of one type, rarities, ilvl,
  source bias): pick a base among templates with `MinItemLevel ≤ ilvl` excluding uniques (R12);
  rarity with modifiers (R21: consumables never Fabled, Normal ring → Uncommon); base stats with
  flattened multipliers and no crit step (R13); names as F8T3H (rings use armor prefixes); affixes
  (R16–R18); required level by the D2 rule (R23). A Fabled result here always falls back to
  Runed (no unique pool yet — slice 7 adds the unique pick behind the same seam). No rarities →
  F8T3H R5 fallback, ilvl still set (R22).
- Templates need `MinItemLevel` / `RequiredLevel` / `IsUnique` on whatever template shape the roll
  takes; slice 6 fills them from `ListItemTemplates`.
- Pure, injectable random source (F8T3H R11); `loot_roll_test.go` rewritten table-driven.

## Acceptance Criteria

- [ ] At ilvl 7 no tier II base or tier II affix is ever produced (seeded sweep); at ilvl 8 both
      can be.
- [ ] Affix counts 0 / 1 / 2 / 3–4 by rarity; distinct stats; eligible per type/slot; values in band.
- [ ] Required level = max(base req, highest affix tier req) (tier III base + tier I affixes → 13;
      tier I base + tier II affix → 6); consumables → 1.
- [ ] Weight function table-test: ilvl factor, elite, demon, consumable no-Fabled, ring no-Normal.
- [ ] Fabled → Runed of the same type when no unique is available.
- [ ] No rarities → base stats, no affixes, ilvl kept.

## Blocked By

I-BDA7X-8 (adds `RequiredLevel` to `ItemConfig` / `ItemComponent` and fixes "rolled loot carries
its template's required level", which this slice replaces with the derived value).

## Spec Reference

FS-4R9M9 §Requirements 11–18, 21–23, 26, 64; §Acceptance Criteria "Roll" rows 1–5, 8.
User Stories 1–4, 18, 23–24, 27, 30.

## TDD Approach

- RED: seeded roll at ilvl 7 over a tier I + tier II template set never returns tier II.
- GREEN: base filter, then affix tiers, then required level.
