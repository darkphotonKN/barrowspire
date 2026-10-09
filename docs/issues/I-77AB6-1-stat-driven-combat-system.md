---
id: I-77AB6-1
status: done
implements: FS-77AB6
blocked_by: []
labels: [ready-for-agent]
title: "FS-77AB6 slice 1: Stat-driven CombatSystem owns all damage"
---
Implements FS-77AB6 §Requirements (Combat system 1–11), §WebSocket message surface

**Domain:** game-service · **Touches `internal/game/session.go`:** yes (`handleAttack`, `handleCastSkill`, tick loop registration). Backend is the human lane per root CLAUDE.md; this slice is sized for `/develop` at the owner's request.

## What to Build

The foundation slice: a real `CombatSystem` that becomes **the only code that reduces `Health`**.

- Replace `systems/damage.go`'s dead `DamageCalculator` with one pure damage function set:
  power (class `Attack` + equipped weapon `attack_power`) × coefficient × stat scaling; crit
  (0.05 + weapon `critical_rate`, cap 0.50, ×1.5); mitigation `100/(100 + 2×M)` with M = defense
  (class `Defense` + Σ armor `defense_rating`) or magic resistance (Σ armor `magic_resistance`);
  round, minimum 1. Read item columns directly off the equipped item entities; gear-stat
  contribution beyond that is FS-4R9M9.
- Handlers (`handleAttack`, `handleCastSkill`) only validate and record an **attack intent** as
  component data; the `CombatSystem` resolves it on the tick. Remove the inline damage from
  `MovementSystem` (the `AttackActive` block) and from `handleCastSkill` (the slash cone).
- `ProjectileSystem` detects impacts against **any** entity with `Health` + `Transform` other than
  its owner and hands each to the `CombatSystem`; projectiles snapshot attacker power/type/crit
  at fire time.
- Server-enforced cooldowns per the attack table (FS §Requirements 6–7); out-of-range targeted
  attack does not start the cooldown.
- Attack table coefficients and damage types per FS §Requirements 6.

Player→player damage **still works** after this slice (now formula-driven) — the co-op switch is
slice 6. That keeps this slice observable with no monsters in the world.

## Acceptance Criteria

- [ ] No code outside `CombatSystem` decrements `Health` (grep-able); `DamageCalculator` is gone.
- [ ] Table-driven tests for the damage function: class+weapon power, per-attack stat scaling, physical vs magic mitigation from class+armor, crit chance incl. weapon rate and cap, crit multiplier, min 1, no-weapon / no-armor.
- [ ] Equip/unequip changes the next hit's damage or mitigation.
- [ ] Level-1 unequipped slash / arrow / fireball land within ±20% of 25 / 20 / 25 vs an unarmored target.
- [ ] Requests inside cooldown do nothing and spend no MP; out-of-range `attack` starts no cooldown.
- [ ] A projectile whose owner died before impact still resolves and carries that owner's identity.
- [ ] Slash damage is applied on the tick, not from the message goroutine.
- [ ] Existing movement/projectile/session tests stay green; `make lint && make test` pass.

## Blocked By

None

## Spec Reference

FS-77AB6 §Requirements 1–11, §WebSocket message surface (inbound rows), §Acceptance Criteria "Combat"; User Stories 14–18, 24, 25.

## TDD Approach

- RED: damage-function table test (class+weapon power, Str scaling, defense mitigation, min 1).
- GREEN: the pure function; then RED a session test that a `cast_skill slash` reduces a target's health only after a tick runs the `CombatSystem`.
