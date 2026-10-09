---
id: I-4R9M9-11
status: done
implements: FS-4R9M9
blocked_by: [I-4R9M9-7, I-4R9M9-9]
labels: [ready-for-agent]
title: "FS-4R9M9 slice 11: Gravewarden's Oath reflects, the Lantern pierces, Ashwalk burns"
---
Implements FS-4R9M9 §Requirements (Unique effects 34, 35, 36, 38; In-run state 56; Uniques 29)

**Domain:** game-service (`internal/systems/combat.go`, `projectile.go`, new trail component/system file, serializer) · **Touches `internal/game/session.go`:** no (trails are created and resolved inside the systems; the floor change already clears non-delver entities) · **Lane:** agent-ready.

## What to Build

- **`melee_reflect`** (`CombatSystem.applyHit`): when a monster's strike damages a wearer, apply
  `max(1, round(20% × damage))` to the attacking monster as an unmitigated, non-crit hit credited
  to the wearer (kill record on a killing blow); a reflected hit never reflects.
- **`pierce`**: `AttackSnapshot` gains a pierce count set in `snapshot` from the wearer's gear;
  `ProjectileComponent` remembers ids it hit; on a valid hit with pierce left it continues instead
  of being destroyed and never hits the same id twice; walls and closed doors still stop it;
  invalid targets don't spend pierce.
- **`burning_dash`**: a wearer's dash (`deliverMovement`) creates a trail entity (pure-data
  component: owner snapshot, path end points, 30 px half-width, 3 s life, 0.5 s pulse). The
  CombatSystem resolves each pulse as a magic hit (power 4 + wearer level, coefficient 1.0, no
  scaling, no crit) on each monster within the path, once per pulse; kills credited to the wearer;
  delvers never hurt. Expired trails are removed.
- Serializer: world state lists live trails (entity id, from, to, time left) (R56).
- Each effect once regardless of copies worn; numbers in `loot_tuning.go`.

## Acceptance Criteria

- [ ] A troll strike of 30 on a Gravewarden wearer deals 6 back; a reflected kill makes a kill
      record crediting the wearer.
- [ ] A Lantern wearer's arrow hits two monsters in a line, not the same one twice, and stops at a wall.
- [ ] An Ashwalk wearer's dash leaves a trail that damages a monster in it every 0.5 s for 3 s,
      never a delver; it appears in state and is gone after 3 s and after a floor change.
- [ ] Combat / projectile tests cover each; existing tests green.

## Blocked By

I-4R9M9-7 (uniques with effect codes), I-4R9M9-9 (gear plumbing the effects ride on).

## Spec Reference

FS-4R9M9 §Requirements 29, 34–36, 38, 56; §Acceptance Criteria "Uniques" rows 1–2 (three of
six), "Protocol" row 1 (trails); §Edge States "Pierce at a wall", "Burning trail on a floor
change", "Reflect against a monster already at 0". User Stories 15, 22.

## TDD Approach

- RED: projectile test — a pierce-1 arrow resolves two impacts on two monsters.
- GREEN: hit-id memory + pierce counter; then reflect; then the trail.
