---
id: I-MAMHR-1
status: done
implements: FS-MAMHR
blocked_by: []
labels: [ready-for-agent]
title: "FS-MAMHR slice 1: the cut, and attacks that scale on Strength and Agility together"
---
Implements FS-MAMHR §B (Requirements 6–9)

**Lane: agent** (game-service). Foundation slice: no class exists yet, so this lands the attack
and the formula change on their own, tested through the CombatSystem.

## What to Build

- **Hybrid scaling (R7).** The attack table's single `scaling` stat can name two stats whose mean
  scales the hit. The scaling value for a hybrid attack is
  `((STR + worn STR) + (AGI + worn AGI)) / 2`, kept as a real number (an odd sum keeps its half).
  This likely means `AttackSnapshot.ScalingStat` and `RawDamage`'s scaling input become `float64`;
  every existing single-stat attack must resolve to exactly the numbers it does today.
- **The cut (R6, R9).** A new attack row `cut` (`components.AttackCut`), skill id `cut` in
  `skillAliases`: cone delivery, 70° arc (half-angle 35°, its own constant, not `slashHalfCone`),
  55 px reach (its own constant, not `slashRange`), physical, coefficient 1.8, hybrid STR+AGI,
  cooldown 0.25 s shortened by worn attack speed, no resource cost. `cut` is not an alias of
  `slash`. The cone resolver takes the arc and reach from the row instead of the slash constants,
  so the slash keeps its 120°/50 px.

## Acceptance Criteria

- [ ] A cut hits every valid target within 55 px inside 70° of the aim, none outside (table test:
      inside, just outside the arc, just past reach).
- [ ] A level-1 cut from STR 7 / AGI 7, unequipped, no crit, no mitigation, deals 29.
- [ ] Worn Strength alone and worn Agility alone each raise the cut's damage; STR 7 + AGI 8 scales
      on 7.5, not 7.
- [ ] Slash, arrow, fireball, triple shots, targeted attack and monster strike damage tests pass
      unchanged; the slash still uses 120° and 50 px.
- [ ] `go test ./...` and lint pass in game-service.

## Blocked By

None.

## Spec Reference

FS-MAMHR §B Requirements 6–9; §Acceptance Criteria "The cut and hybrid scaling"; User Stories 4, 5, 29.

## Files expected

- `game-server/game-service/internal/systems/combat.go` (attack row, alias, cone takes arc/reach from the row, hybrid stat value)
- `game-server/game-service/internal/systems/damage.go` (scaling input type, if it changes)
- `game-server/game-service/internal/components/attack.go` (`AttackCut`, `ScalingStat` type)
- `game-server/game-service/internal/systems/combat_test.go`, `damage_test.go`

> Coordination: FS-8AY7S (resource cost replacing `manaCost`) and FS-JTNPR (Shadow Shot row) edit
> the same attack table concurrently. Rebase onto whichever lands first; never drop their rows.

## TDD Approach

- RED: a CombatSystem test casting `cut` from a STR 7 / AGI 7 delver at a 0-defense target 40 px
  away, 20° off the aim, expecting 29 damage.
- GREEN: the `cut` row, its alias, the row-driven cone, and the hybrid stat value.
