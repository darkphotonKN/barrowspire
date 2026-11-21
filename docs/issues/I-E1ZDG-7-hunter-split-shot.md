---
id: I-E1ZDG-7
status: open
implements: FS-E1ZDG
blocked_by: [I-E1ZDG-2]
labels: [ready-for-agent]
title: "FS-E1ZDG slice 7: Hunter: an arrow crit splits toward the nearest other monster"
---
Implements FS-E1ZDG §G (Requirements 25–28)

**Lane: agent** (game-service).

## What to Build

- When a Hunter's **left-click arrow** (`AttackArrow`) hit crits a monster, find the nearest other
  living monster whose centre is within **220 px** of the struck monster. None: nothing.
- Fire one **split arrow** from the struck monster's position, straight at where the mark stands
  now, at an arrow's speed and max flight: an ordinary `arrow` projectile whose snapshot has 60% of
  the arrow's raw damage (e.g. coefficient × 0.6), rolls its own crit, is marked never to split,
  carries no pierce, and has the struck monster already in its `HitEntityIDs`.
- Shadow Shot never splits. A piercing arrow may split on each impact that crits.

## Acceptance Criteria

- [ ] An arrow crit on A with B at 150 px and C at 200 px fires one split arrow toward B; with no
      monster within 220 px, none.
- [ ] The split arrow's raw damage is 60% of an arrow's; it can crit; its crit never splits.
- [ ] It never hits A, and stops at its first hit.
- [ ] A Shadow Shot crit never splits; a non-crit arrow never splits.
- [ ] The split arrow is in the state's projectiles with `projectile_type: "arrow"`.
- [ ] A Shadow Ranger's arrow crits never split.
- [ ] `make test` passes in game-service.

## Blocked By

I-E1ZDG-2 (the body's specialization, read from its passive ranks).

## Spec Reference

FS-E1ZDG §G R25–28; §Acceptance Criteria "Hunter"; §Edge States (split arrow rows); User Stories
19–20.

## Files expected to touch

- `game-server/game-service/internal/components/attack.go` (attack kind, never-split mark),
  `components/projectile.go` if the mark lives there
- `game-server/game-service/internal/systems/combat.go` (`applyHit`, `fire`)
- `game-server/game-service/internal/systems/combat_test.go` (or a new `split_shot_test.go`)

## TDD Approach

- RED: roll pinned to crit; a Hunter's arrow impact on A with B at 150 px; expect one new
  projectile entity at A's position heading toward B with 0.6× coefficient.
- GREEN: the split branch in `applyHit`, reusing `fire`'s projectile creation.
