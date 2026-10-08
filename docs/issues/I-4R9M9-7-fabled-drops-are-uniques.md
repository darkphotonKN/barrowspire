---
id: I-4R9M9-7
status: done
implements: FS-4R9M9
blocked_by: [I-4R9M9-6]
labels: [ready-for-agent]
title: "FS-4R9M9 slice 7: A Fabled drop is a handcrafted unique"
---
Implements FS-4R9M9 §Requirements (Uniques 25–31; Rarity roll 22; Required level 23)

**Domain:** game-service (`internal/game/loot_roll.go`, `loot_tuning.go`) · **Touches `internal/game/session.go`:** no (the unique pool is already loaded by slice 6) · **Lane:** agent-ready.

## What to Build

- On a Fabled result, pick uniformly among uniques in the session's unique pool whose min ilvl ≤
  the drop's ilvl, **regardless of the drop's rolled type** (R25). None eligible → Runed item of
  the drop's own type (R26).
- The unique item: its template's name and description (lore), rarity `fabled`, base stats rolled
  at Runed's ×1.15 (R27), fixed affixes rolled within their ranges and stored with **tier 0**
  (R19), required level = its template's (R23), ilvl = the drop's, unique effect code + text set.
- A unique whose effect code this game-service does not know (not one of the six) is excluded from
  the pool with a `slog.Warn` (R30).

## Acceptance Criteria

- [ ] Seeded Fabled roll at ilvl 12 returns one of Wightfang, Gravewarden's Oath, Lantern of the
      Drowned, The Hollow Crown — never Ashwalk Greaves (14) or Ring of the Last King (18).
- [ ] At ilvl 5 a Fabled roll yields a Runed item of the drop's type.
- [ ] A unique's fixed affixes are tier 0 and inside their ranges; base stats within ×1.15 ± 20%.
- [ ] Unknown effect code → excluded with a warning.

## Blocked By

I-4R9M9-6 (unique pool loaded into the session; item effect fields on the component).

## Spec Reference

FS-4R9M9 §Requirements 19, 22–23, 25–31; §Acceptance Criteria "Roll" rows 6–7; §Edge States
"No eligible unique". User Stories 14, 22, 28.

## TDD Approach

- RED: seeded Fabled roll with a pool of six at ilvl 12 never returns a min-ilvl-14+ unique.
- GREEN: eligibility filter + unique construction.
