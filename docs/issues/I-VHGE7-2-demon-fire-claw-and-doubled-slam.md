---
id: I-VHGE7-2
status: done
implements: FS-VHGE7
blocked_by: [I-VHGE7-1]
labels: [ready-for-agent]
title: "FS-VHGE7 slice 2: both demons slam (doubled, on a cooldown) and fire-claw, with claw on the wire (game-service)"
---
Implements FS-VHGE7 §B (Requirements 15–25)

**Author: agent.** Server work under the owner's charter (2026-11-08).

## What to Build

The demons' two moves in the monster AI and combat. Every other archetype is untouched.

1. Sheet data: which archetypes have the claw, plus `DemonSlamCooldown = 6`,
   `SlamDamageMultiplier = 2` and `ClawShowFor = 0.4` in `monster_tuning.go`. The factory copies
   the move data onto `MonsterComponent` the way it copies `WindUp` (R15, R18, R24).
2. `MonsterComponent` gains the slam cooldown timer and the claw-show timer, and
   `MonsterActionClaw = "claw"` (R24).
3. `MonsterAISystem.think`: in range with the attack cooldown run out, it slams if the slam is
   ready (today's wind-up path, sets the slam cooldown) and claws otherwise (an immediate strike
   intent, then `claw` held still for `ClawShowFor`). Either sets `AttackCooldown`. The slam
   cooldown ticks every tick and starts at 0 (R16–R21).
4. Slam damage at 2× the level damage: a slam attack kind (or a per-intent coefficient) in the
   combat attack table, parriable, physical. The claw is today's `AttackMonsterStrike` at ×1
   (R16, R17, R22, R23).
5. Monster death clears the claw show as it clears the wind-up (R25). Update the
   `MonsterState.Action` comment in `internal/types/game.go` to list `claw`.

## Acceptance Criteria

- [ ] The FS §Acceptance Criteria "Server" items about the moves: slam ready → 0.8 s `attack` wind-up landing 2× damage; slam cooling → claw lands 1× the same tick and reports `claw` for 0.4 s standing still; 6 s slam cooldown with claws between; whiffed slam spends it; first swing is a slam; other archetypes unchanged; both moves parriable; dead overrides mid-claw.
- [ ] Level-1 damage numbers hold: green slam 56, claw 28; blood slam 68, claw 34.
- [ ] No WS field is added: the only wire change is the `claw` value of `action`.
- [ ] `go test ./...` and `golangci-lint run` pass in game-service.

## Files expected to touch

- `game-server/game-service/internal/components/monster.go`, `internal/components/attack.go`
- `game-server/game-service/internal/systems/monster_ai.go`, `monster_ai_test.go`
- `game-server/game-service/internal/systems/combat.go`, `combat_test.go`, `parry_test.go`
- `game-server/game-service/internal/systems/monster_death.go`, `monster_death_test.go`
- `game-server/game-service/internal/game/monster_tuning.go`, `factory.go`
- `game-server/game-service/internal/types/game.go` (comment only)

## Blocked By

- I-VHGE7-1: the `blood_demon` sheet whose numbers the move tests pin, and the same
  `monster_tuning.go` / `components/monster.go` hotspot.

## Spec Reference

FS-VHGE7 §B R15–25; User Stories 12–18, 26, 27; Edge States "Target leaves mid-claw show",
"Target steps out during the slam wind-up", "Demon leashes home with its slam cooling", "Parry on
a claw".

## TDD Approach

- RED: `TestDemonMoves` table over ticks: a fresh demon in range slams first; 1.6 s later, with
  the slam cooling, it claws with `claw` held for 0.4 s; 6 s after the slam it slams again. Then a
  ghoul case showing no claw.
- GREEN: the move data on the sheet/component and the choice in `think`.
