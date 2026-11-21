---
id: I-E1ZDG-4
status: done
implements: FS-E1ZDG
blocked_by: [I-E1ZDG-2]
labels: [ready-for-agent]
title: "FS-E1ZDG slice 4: Berserker: two-thirds max HP, faster and harder slashes that heal"
---
Implements FS-E1ZDG §D (Requirements 14–18)

**Lane: agent** (game-service).

## What to Build

- **Max HP ×0.67** on the class body's max HP (class base + level growth), rounded:
  `round(0.67 × (base + (level − 1) × growth))`. Worn gear's and passive-tree nodes' max HP add on
  top, unscaled.
  - At seating (`classAtLevel` or the seat path), full HP of the reduced max.
  - On level-up (`gainExperience`), the max moves to the scaled value for the new level; current
    HP does not move.
  - At the pick (I-E1ZDG-2's seam in `RaisePassiveRanks`), the max drops and current HP clamps to it.
- **+25% attack speed**: added to the attack speed percentage that shortens cooldowns in
  `CombatSystem.resolve`, after worn attack speed's cap.
- **+10% damage**: the raw damage of every hit the Berserker's own attack-table casts land
  (e.g. ×1.10 on the snapshot's coefficient). Burning trail and reflect are untouched.
- **Heal**: after a slash's cone has applied a hit to at least one target, heal
  `max(1, round(1.5% × max HP))`, never above max. Once per slash.

## Acceptance Criteria

- [ ] A level-20 Berserker seats at 253 max HP (+ worn max HP), at full.
- [ ] The scaled level-up growth step raises max HP by the scaled difference and leaves current HP.
- [ ] At the pick, a warrior at full HP drops to the new max; one below it keeps their HP.
- [ ] Slash cooldown is `0.25 / (1 + (min(worn, 50) + 25) / 100)`.
- [ ] Raw slash damage is 1.10× a Guardian's with the same stats.
- [ ] A slash hitting three monsters heals once; one hitting nothing heals nothing; the heal never
      goes above max.
- [ ] A Guardian and an unspecialized warrior are unchanged.
- [ ] `make test` passes in game-service.

## Blocked By

I-E1ZDG-2 (the body's specialization, read from its passive ranks; the pick seam in `RaisePassiveRanks`).

## Spec Reference

FS-E1ZDG §D R14–18; §Acceptance Criteria "Berserker"; §Edge States (Berserker with gear); User
Stories 11–13.

## Files expected to touch

- `game-server/game-service/internal/game/class_growth.go`, `kill_experience.go`, `session.go`
  (seat)
- `game-server/game-service/internal/systems/combat.go` (`resolve` cooldown, `snapshot`, `cone`)
- `game-server/game-service/internal/game/kill_experience_test.go`, `character_seat_test.go`,
  `systems/combat_test.go` (or a new `berserker_test.go`)

## TDD Approach

- RED: seat a level-20 Berserker with no gear; expect max HP 253, current 253.
- GREEN: the scaled class-body max at seating; then the level-up step, cooldown, damage and heal,
  one test each.
