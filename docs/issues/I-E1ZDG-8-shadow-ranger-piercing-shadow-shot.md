---
id: I-E1ZDG-8
status: done
implements: FS-E1ZDG
blocked_by: [I-E1ZDG-2]
labels: [ready-for-agent]
title: "FS-E1ZDG slice 8: Shadow Ranger: Shadow Shot pierces its whole line and refunds stamina per monster"
---
Implements FS-E1ZDG §H (Requirements 29–31)

**Lane: agent** (game-service).

## What to Build

- A Shadow Ranger's Shadow Shot (`AttackShadowShot`) never stops at a target: unlimited pierce, so
  it stops only at a wall, a closed door or its max flight. Each target is still hit once.
- Each **monster** it hits refunds **8 stamina** to the archer, capped at max, on that tick, while
  the archer is in play.
- Cost, cooldown, damage and the hold stay FS-JTNPR's. A Hunter's and an unspecialized archer's
  Shadow Shot are unchanged.

## Acceptance Criteria

- [ ] A Shadow Shot through five monsters in a line hits all five and flies on.
- [ ] It stops at a wall behind them.
- [ ] Five monsters hit refund 40 stamina, capped at max.
- [ ] Delvers passed with player damage off give no refund.
- [ ] A Hunter's Shadow Shot stops at its first monster (or at the Lantern's pierce) as before.
- [ ] `make test` passes in game-service.

## Blocked By

I-E1ZDG-2 (the body's specialization, read from its passive ranks).

## Spec Reference

FS-E1ZDG §H R29–31; §Acceptance Criteria "Shadow Ranger"; §Edge States (refund at max, delvers);
User Stories 21–22.

## Files expected to touch

- `game-server/game-service/internal/systems/combat.go` (`snapshot` pierce, `applyHit` refund)
- `game-server/game-service/internal/systems/projectile.go` (unlimited pierce, if a sentinel is
  needed)
- `game-server/game-service/internal/systems/projectile_test.go`, `combat_test.go`

## TDD Approach

- RED: a Shadow Ranger's Shadow Shot fired along a row of three monsters; after the ticks all three
  took damage and stamina rose by 24.
- GREEN: unlimited pierce on the snapshot for a Shadow Ranger's Shadow Shot, and the refund in
  `applyHit`.
