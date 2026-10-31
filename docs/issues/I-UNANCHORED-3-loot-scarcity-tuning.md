---
id: I-UNANCHORED-3
status: open              # open | in-progress | done
implements: none          # a tweak, deliberately kept out of any FS (scope-it 2026-10-31); hand-coded, human lane
blocked_by: [I-UNANCHORED-2]
labels: []
title: Loot scarcity tuning (about 5× fewer drops everywhere, fewer Forest chests)
---
Implements: none. This is a **tweak**, kept out of FS-1D6BX on purpose. Human lane (game-server).

## What to Build

Cut loot about **5× across the board** (runs and non-runs alike, so a field is never the easier
farm), and spawn fewer chests in the Forest. Order of generosity: **chest > sack > drop pile**.

Suggested starting values (playtest them):

| What | Where | Today | Suggested |
|---|---|---|---|
| Chest roll | per-kind constants (I-UNANCHORED-2) | always 2–4 items (avg 3) | 60% empty, else 1–2 (avg 0.6, 5×) |
| Sack roll | per-kind constants (FS-1D6BX) | — | 80% empty, else 1 (avg 0.2) |
| Ghoul drop | `loot_tuning.go` `MonsterDrops` | 0.08 | 0.016 |
| Troll drop | `MonsterDrops` | 0.15 | 0.03 |
| Elite drop | `EliteMonsterDrop` | 0.50 | 0.10 |
| Boss drop | `BossMonsterDrop` | 1.0, 2–3 items | **stays guaranteed** (1.0), 1–2 items: the floor's payoff and the only Fabled source (I-UNANCHORED-4) |
| Forest chest spawn | `monster_tuning.go` `ForestChestShare` | 0.5 | 0.25 |

The field `DropFactor`s (Meadows 0.35, Forest 0.5) still apply on top, unchanged. Fields reference
the Spire rows (FS-X2F2H), so cutting the Spire numbers cuts fields too.

## Open questions

- ~~Boss: guaranteed or cut?~~ **Decided 2026-10-31: guaranteed.** The boss is the one exception
  to the 5× cut on chance. Only its count comes down.
- **Forest guarantee:** `forest_population.go` forces at least one chest when there are two or
  more dead ends. Keep that guarantee or drop it?
- Ghoul at 1.6% is close to never. Check in playtest that kills still feel worth anything.

## Acceptance Criteria

- [ ] The chest roll averages about 0.6 items, and a sack's averages lower than a chest's.
- [ ] Every monster drop chance is cut, except the boss, whose drop stays guaranteed.
- [ ] `ForestChestShare` is lowered, and the guarantee is decided.
- [ ] The tests pinning the old numbers are updated.

## Blocked By

- I-UNANCHORED-2 (per-kind empty chance and count constants). The monster and Forest
  numbers can land independently.

## Spec Reference

Odds ordering recorded in FS-1D6BX §Scoping notes. The numbers live here, never in the FS.
