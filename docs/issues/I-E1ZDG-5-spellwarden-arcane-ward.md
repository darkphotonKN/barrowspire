---
id: I-E1ZDG-5
status: open
implements: FS-E1ZDG
blocked_by: [I-E1ZDG-2]
labels: [ready-for-agent]
title: "FS-E1ZDG slice 5: Spellwarden: Arcane Ward takes a quarter of each hit from mana, and spell resistance"
---
Implements FS-E1ZDG §E (Requirements 19–21)

**Lane: agent** (game-service).

## What to Build

- **Spell resistance**: a magic hit on a Spellwarden deals `max(1, round(mitigated × 0.9))`, after
  magic resistance's mitigation in `systems/damage.go` (e.g. a spell-resistance percent on
  `Mitigation`, filled by `CombatSystem.mitigation`). Physical hits are untouched.
- **Arcane Ward**, in `applyHit` after the damage is resolved: `ward = round(25% × final)`; take
  `min(ward, mana)` from mana; the rest of the hit comes off HP. Mana never below 0. Applies to
  every hit on the Spellwarden.

## Acceptance Criteria

- [ ] A magic hit mitigated to 50 deals 45 to a Spellwarden; a physical hit is unchanged.
- [ ] 40 damage, 100 mana: 10 mana, 30 HP.
- [ ] 40 damage, 4 mana: 4 mana, 36 HP. 0 mana: 40 HP.
- [ ] 1 damage: 1 HP, no mana.
- [ ] A ward hit that leaves HP at 0 kills.
- [ ] A Pyromancer and an unspecialized mage are unchanged.
- [ ] `make test` passes in game-service.

## Blocked By

I-E1ZDG-2 (the body carries its specialization).

## Spec Reference

FS-E1ZDG §E R19–21; §Acceptance Criteria "Spellwarden"; §Edge States (ward on a killing blow); User
Stories 14–16.

## Files expected to touch

- `game-server/game-service/internal/systems/damage.go`, `damage_test.go`
- `game-server/game-service/internal/systems/combat.go` (`mitigation`, `applyHit`)
- `game-server/game-service/internal/systems/combat_test.go` (or a new `arcane_ward_test.go`)

## TDD Approach

- RED: `ResolveDamage` with a magic attack and a 10% spell resistance target returns the mitigated
  value × 0.9, rounded.
- GREEN: the spell-resistance step in `ResolveDamage`; then the ward split in `applyHit`.
