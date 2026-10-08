---
id: I-4R9M9-9
status: done
implements: FS-4R9M9
blocked_by: [I-4R9M9-6, I-BDA7X-8]
labels: [ready-for-agent]
title: "FS-4R9M9 slice 9: What a delver wears counts, rings included"
---
Implements FS-4R9M9 §Requirements (Gear contributes to character stats 39–43)

**Domain:** game-service · **Touches `internal/game/session.go`:** **yes** — one line in `step()` to run the gear system, and a ring case in `handleEquip`. The rest in new files and `internal/systems`. · **Lane:** agent-ready.

## What to Build

- New component `GearBonusComponent` (pure data): attribute bonuses, flat damage, crit points,
  attack speed %, move speed %, defense, magic resistance, max health, max mana, and the last
  applied max-health / max-mana bonus.
- New `internal/systems/gear.go` `GearSystem`, run every tick (all worlds) before combat: sums the
  affixes of items in weapon / head / chest / gloves / legs / ring 1 / ring 2 (never consumable
  slots) into the delver's `GearBonusComponent`; applies max health / max mana by the **delta**
  from the last applied bonus (gaining never raises current; losing clamps current to max);
  sets movement speed to `DefaultSpeed × (1 + min(ms, 30)/100)`. On a delver's first gear pass
  (component absent) current health and mana are set to the new maxima (seated at full, R40).
- `CombatSystem`: `snapshot` adds the attacker's gear attributes to the scaling stat, flat damage
  to power, crit points to crit chance (existing cap); `mitigation` adds the target's gear defense
  and magic resistance; cooldown set in `resolve` is divided by `1 + min(as, 50)/100`. Base weapon
  and armor reads unchanged (R41). Character `StatsComponent` is never rewritten.
- `handleEquip`: a `ring` case — first empty of ring 1 / ring 2, else replace ring 1 (old ring to
  inventory); unequip by item. The level gate from I-BDA7X-8 applies.
- Caps and numbers from `loot_tuning.go`.

## Acceptance Criteria

- [ ] +4 Strength worn → a warrior's slash damage equals that of Strength + 4; removed next tick
      after unequip (combat test with pinned roll).
- [ ] Flat damage, crit, defense, magic resistance behave per R40.
- [ ] Attack speed shortens cooldowns, capped at +50%; move speed raises speed, capped at +30%.
- [ ] Max health gear: max rises, current does not; unequip clamps; a newly seated delver is at
      full health including gear.
- [ ] Rings equip into ring 1, then ring 2, then replace ring 1; an over-level ring is refused.
- [ ] Existing combat, session and level-up tests green.

## Blocked By

I-4R9M9-6 (affixes on `ItemComponent`, rings in play), I-BDA7X-8 (`handleEquip` gate edits).

## Spec Reference

FS-4R9M9 §Requirements 39–43; §Acceptance Criteria "Gear" (all rows); §Edge States "Unequip
lowers max health", "Level-up while wearing gear". User Stories 4–9.

## TDD Approach

- RED: `GearSystem` + `CombatSystem` test — a worn +4 Strength affix changes damage.
- GREEN: gear summation, then each R40 hook one by one.
