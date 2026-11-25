---
id: I-8AY7S-7
status: done
implements: FS-8AY7S
blocked_by: []
labels: [ready-for-agent]
title: FS-8AY7S tuning and the pool cap: slower regen, costs ×1.5, no cost over its pool
---
Implements FS-8AY7S §Change: A cost never exceeds the class's base pool · Tunes FS-8AY7S · Tunes FS-JTNPR · Tunes FS-04EEA · Tunes FS-X2CMM · Tunes FS-MAMHR

Charter item C, E1–E3 (2026-11-25 dungeon-crawler pace charter). Values only: every number below
is a tunable its owning FS names (FS-8AY7S R3 pools and R9 costs, FS-JTNPR's cost row, FS-04EEA
R5's table, FS-X2CMM R10–R12's page tables, FS-MAMHR R23's riposte charges).

## What to Build

Change these values in game-service, and the tests that pin them, nothing else:

**E1, regen** (`internal/game/session.go` `Classes`): stamina 20 → **7/s** (warrior, archer), mana
4 → **2/s** (mage). Pools unchanged (100, 100, 150; parry charges 3 at regen 0).

**E2, costs ×1.5, rounded to the nearest 5 (halves up), capped at the class's base pool**
(`internal/systems/combat.go` `attackTable`, `internal/systems/book_pages.go`):

| Class | Cost | Before | After |
|---|---|---|---|
| warrior | dash | 25 | 40 |
| warrior | Earthbreaker | 40 | 60 |
| warrior | Heave | 25 | 40 |
| warrior | Hardened | 30 | 45 |
| warrior | Long Night | 40 | 60 |
| mage | triple fireball | 15 | 25 |
| mage | Blink | 30 | 45 |
| mage | Witchlight | 20 | 30 |
| mage | Far Hand | 15 | 25 |
| mage | Levitate | 35 | 55 |
| mage | Binding Glyph | 40 | 60 |
| mage | Recall | 50 | 75 |
| archer | Shadow Shot | 90 | 100 (135 capped at the 100 pool) |
| archer | Arrow Rain | 35 | 55 |
| archer | Tracker's Eye | 20 | 30 |
| archer | Brew | 30 | 45 |
| archer | Call the Hound | 40 | 60 |

**E3, mercenary:** unchanged. Its costs are parry-charge counts (the riposte spends 3 of 3, Settle
the Debt needs at least 1 and spends all) and its pages cost nothing; ×1.5 would put the riposte
above the pool. Its gain rules are unchanged. (Both E2's cap and E3 were escalated to the
coordinator and approved 2026-11-25: the cap is FS-8AY7S §Change P1, the no-op its P3.)

## Acceptance Criteria
- [ ] Seated warrior and archer regen 7/s, mage 2/s, pools unchanged (tests updated).
- [ ] Every cost in the table above reads its After value through `AttackCost` / the page table.
- [ ] Beyond values, only the §Change's pool-cap test (P1) is new.
- [ ] A test fails if any class's cost exceeds its base pool (P1).
- [ ] `make test` and `make check` green in game-service.

## Blocked By
None

## Spec Reference
FS-8AY7S R3, R9; FS-JTNPR cost row; FS-04EEA R5; FS-X2CMM R10–R12; FS-MAMHR R23 (unchanged).
