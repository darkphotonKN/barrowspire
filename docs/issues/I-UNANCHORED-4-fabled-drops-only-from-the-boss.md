---
id: I-UNANCHORED-4
status: open              # open | in-progress | done
implements: none          # a tweak, deliberately kept out of any FS (scope-it 2026-10-31); hand-coded, human lane
blocked_by: []
labels: []
title: Fabled drops only from the boss
---
Implements: none. This is a **tweak**, kept out of any FS on purpose. Human lane (game-server).
It narrows a rule in [FS-4R9M9](../specs/4R9M9-item-levels-affixes-and-uniques.md) §Requirements 21,
where Fabled may roll from any source. That FS is write-once and is not edited. This issue is
the record of the change.

## What to Build

Only the demon boss may drop a Fabled item. Every other source rolls with **Fabled's weight at
0**: chests, sacks, normal and elite kills, and every field drop. In `rarityWeights`
(`game-server/game-service/internal/game/loot_roll.go`), Fabled's weight survives only when
`drop.Source == lootSourceDemon` (the boss's `BossMonsterDrop`). The consumable rule (never
Fabled) still applies on top.

Fabled **stays the rarest tier** even on the boss: its 0.005 base weight, the item-level factor
and `DemonRarityWeightMultiplier` are unchanged. A guaranteed boss drop (I-UNANCHORED-3) is a
guaranteed *item*, never a guaranteed Fabled.

## Acceptance Criteria

- [ ] A non-demon drop (chest, sack, standard, elite, field) never rolls Fabled.
- [ ] A demon drop can roll Fabled, at its existing weight.
- [ ] The consumable drops still never roll Fabled.
- [ ] `rarityWeights` table tests cover each source × Fabled.

## Blocked By

Nothing. Pairs with I-UNANCHORED-3 (the guaranteed boss drop).

## Spec Reference

FS-4R9M9 §Requirements 21 (the rarity weight adjustments) is narrowed by this issue.
