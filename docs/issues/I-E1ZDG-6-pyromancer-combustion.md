---
id: I-E1ZDG-6
status: done
implements: FS-E1ZDG
blocked_by: [I-E1ZDG-2]
labels: [ready-for-agent]
title: "FS-E1ZDG slice 6: Pyromancer: a fireball crit explodes on the monsters around its target"
---
Implements FS-E1ZDG §F (Requirements 22–24)

**Lane: agent** (game-service).

## What to Build

- The attack snapshot knows which attack it is (or that it is a fireball), so `applyHit` can tell a
  fireball's hit.
- When a Pyromancer's fireball hit (left-click `fireball`, or any of `triple_fireball`'s) crits a
  monster: every **other** monster whose centre is within **60 px** of the struck monster takes
  `max(1, round(50% × the crit's resolved damage))`, as a hit from the Pyromancer through
  `applyHit`: magic, `TrueDamage` (unmitigated), no crit, never exploding itself. Kills are
  credited to the Pyromancer. Delvers are never hit.
- A crit that kills its target still explodes.

## Acceptance Criteria

- [ ] A fireball crit dealing 40 hits a monster at 59 px for 20, and not one at 61 px, the struck
      monster again, or a delver at 30 px.
- [ ] Each of triple fireball's fireballs explodes on its own crit.
- [ ] The explosion never crits and never explodes; a kill it makes is the Pyromancer's kill record.
- [ ] A crit that kills its target still explodes; a non-crit never does.
- [ ] A fireball crit on a delver (player damage on) does not explode.
- [ ] A Spellwarden's fireball crits never explode.
- [ ] `make test` passes in game-service.

## Blocked By

I-E1ZDG-2 (the body's specialization, read from its passive ranks).

## Spec Reference

FS-E1ZDG §F R22–24; §Acceptance Criteria "Pyromancer"; §Edge States (Combustion rows); User Stories
17–18.

## Files expected to touch

- `game-server/game-service/internal/components/attack.go` (attack kind on `AttackSnapshot`)
- `game-server/game-service/internal/systems/combat.go` (`snapshot`/`bareSnapshot`, `applyHit`)
- `game-server/game-service/internal/systems/combat_test.go` (or a new `combustion_test.go`)

## TDD Approach

- RED: roll pinned to crit; a Pyromancer's fireball impact on monster A with B at 50 px and C at
  70 px; expect B's health down by half A's damage and C untouched.
- GREEN: the explosion branch after a crit in `applyHit`.
