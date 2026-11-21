---
id: I-8RZ51-5
status: open
implements: FS-8RZ51
blocked_by: [I-8RZ51-4]
labels: [blocked]
title: "FS-8RZ51 slice 5: the warrior's and the mage's four kickers, per-rank stats and rank-3 rules (game-service)"
---
Implements FS-8RZ51 §F R29 (warrior and mage rows)

**Author: agent.** Kickers reuse what exists (checked 2026-11-21): crit chance (`snapshot`, worn
crit points), pierce (`AttackSnapshot.Pierce`, Lantern), projectile spread and speed
(`attackTable`), resource regen, attack costs. **New, small, listed in the FS's report:** a
resource refund (a gain capped at max), a damage-taken reduction below half HP, and a one-hit
forced crit after a dash.

## Files it expects to touch

- `game-server/game-service/internal/systems/combat.go` (coefficient multipliers, costs,
  volley spread, fireball speed, pierce, crit refund, multi-hit refund, kill refund, the forced
  crit after a dash) and `combat_test.go`
- `game-server/game-service/internal/systems/damage.go` (Thick Skin's reduction) and its test
- `game-server/game-service/internal/systems/resource.go` (Long Wind and Deep Well regen, if not
  already carried by slice 4's regen bonus)
- `game-server/game-service/internal/components/` (a dash-ended mark for Bull Rush; data only)

## What to Build

Each row of R29 for `warrior.t2a/t2b/t5a/t5b` and `mage.t2a/t2b/t5a/t5b`: the per-rank stat at R1,
R2 and R3, and the R3 rule only at R3, with the clarifications under R29's table (Kindling is the
left-click fireball; Searing is both fireball kinds and adds to a Lantern's pierce; Wide Volley
widens the spread one step either side; a refund never exceeds max).

- Heavy Hand: +6% slash coefficient per rank; R3 a slash resolving on 2+ monsters refunds 5 stamina.
- Thick Skin: +4% own max HP per rank; R3 below half max HP, damage taken × 0.9.
- Long Wind: +10% stamina regen per rank; R3 a kill refunds 15 stamina.
- Bull Rush: dash cost −3 per rank; R3 the first hit after a dash ends is a forced crit within 3 s.
- Kindling: +6% fireball coefficient per rank; R3 a fireball crit refunds 5 mana.
- Deep Well: +15 max mana per rank; R3 +25% mana regen.
- Wide Volley: triple fireball cost −2 per rank; R3 five fireballs.
- Searing: +8% fireball flight speed per rank; R3 fireballs pierce one more monster.

## Acceptance Criteria

- [ ] One test per row: the stat at R1 and R2, the stat and rule at R3, no rule at R2.
- [ ] A refund at a full pool leaves it at max.
- [ ] A cast whose cost the kicker lowered is affordable at the lowered cost, and the client's
      `ability_cost` on `current_player` shows the lowered cost.
- [ ] `make test` (and lint, check) green in game-service.

## Blocked By

I-8RZ51-4 (the bonus plumbing on the body).

## Spec Reference

FS-8RZ51 §F R29 (warrior, mage). User stories 8, 19, 20.

## TDD Approach

- RED: a warrior with `t2a` at 3 whose slash hits two ghouls ends the tick 5 stamina up.
- GREEN: the kicker rule read from the body's ranks in the CombatSystem.
