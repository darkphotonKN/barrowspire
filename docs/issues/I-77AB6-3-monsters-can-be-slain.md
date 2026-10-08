---
id: I-77AB6-3
status: done
implements: FS-77AB6
blocked_by: [I-77AB6-1, I-77AB6-2]
labels: [ready-for-agent]
title: "FS-77AB6 slice 3: Monsters take damage, die once and emit a kill record"
---
Implements FS-77AB6 §Requirements (Monster death and the kill record 28–31; Combat 10–11)

**Domain:** game-service · **Touches `internal/game/session.go`:** yes (registers the monster-death step in the tick order; exposes kill records to in-process consumers). Backend is the human lane per root CLAUDE.md; this slice is sized for `/develop` at the owner's request.

## What to Build

Delvers can now kill monsters with every damage source, and every kill is recorded exactly once.

- `CombatSystem` resolves delver hits on monsters (targeted `attack`, slash cone, projectiles)
  using monster defense / magic resistance; records the last delver to damage each monster.
- Monster death step (after combat in the tick): health 0 → dead state that tick, velocity
  zeroed, no collision, no longer a valid target; broadcast `action: dead`; entity removed after
  a 4 s corpse lifetime (constant).
- **Kill record**, exactly once per monster: entity id, archetype, level, elite, boss, killer
  member id (killing blow), position at death, floor. In-process, same run; v1 consumer is a
  structured `slog` line. Settle the subscription mechanism (FS §Open questions) so FS-BDA7X and
  FS-4R9M9 can consume it later. No XP, no drops, no broker event.
- Hits on dead monsters are discarded; projectiles pass through corpses.
- Monsters never damage monsters (guard in `CombatSystem`).

## Acceptance Criteria

- [ ] Each damage source (targeted attack, slash, arrow, fireball, triple variants) can kill a monster.
- [ ] Two lethal hits in one tick produce exactly one kill record; the killer is the hit that took it to 0.
- [ ] Kill record carries all eight fields; a test observes it.
- [ ] A dead monster is broadcast `dead` for ~4 s, then removed; it is untargetable and non-colliding meanwhile; projectiles pass through it.
- [ ] Credit goes to a projectile's owner even if that owner died before impact.
- [ ] `make lint && make test` pass.

## Blocked By

I-77AB6-1 (CombatSystem), I-77AB6-2 (monster entities)

## Spec Reference

FS-77AB6 §Requirements 10–11, 14, 28–31; §Edge States (concurrent kills, damage to dead target); §Acceptance Criteria "Monsters" (kill record, never damage monsters); User Stories 15, 22, 27.

## TDD Approach

- RED: two delvers' lethal hits land on one ghoul in the same tick → exactly one kill record with the first resolver as killer.
- GREEN: death step + record emission.
