---
id: I-8RZ51-4
status: done
implements: FS-8RZ51
blocked_by: [I-8RZ51-3]
labels: [blocked]
title: "FS-8RZ51 slice 4: passive bonuses on the seated body, every filler node, and a town spend felt at once (game-service)"
---
Implements FS-8RZ51 §F (R24–R28, R31 the body's ranks)

**Author: agent.**

## Files it expects to touch

- `game-server/game-service/internal/components/` (a passive bonus component beside
  `GearBonusComponent`, or fields on the slice-3 ranks component; data only)
- `game-server/game-service/internal/game/session.go` (`buildBodyLocked`: bonuses from the ranks
  at seating; a HUB-world method that re-applies on a spend), `internal/game/factory.go`
- `game-server/game-service/internal/systems/gear.go` (tree attack/move speed summed inside the
  gear caps; tree attributes summed with worn ones), `internal/systems/resource.go` (regen bonus
  at sub-point precision), and their tests
- `game-server/game-service/internal/gameserver/server.go` (the slice-3 spend calls the hub
  re-apply)

## What to Build

- At every seating (R24) the body gets its passive bonuses from its ranks and `passivetree`'s
  values, held apart from the character's own stats like worn gear (R25), read wherever gear's
  are: attributes, max HP, max resource, regen, attack speed, move speed (inside gear's caps).
- Percent of max HP is of own max HP (class base + level growth) at seating, rounded (R26). Regen
  percent is of the class's base regen, accrued below a whole point, never rounded away.
- Fillers of R28 for all four classes (the mercenary's `t1b` +2 Strength, `t4a` +2 Agility, `t4b`
  +4% max HP).
- A successful spend in the HUB world re-applies the body's bonuses: a max that rose raises its
  current by the same amount (R27). A body in a field or run is never touched (R24).
- Kicker per-rank stats and R3 rules are slices 5 and 6; this slice makes the bonus plumbing they
  add rows to.

## Acceptance Criteria

- [ ] The "Effects" criteria of FS-8RZ51 §Acceptance Criteria that name fillers, caps, the town
      spend and the field/run body, each a test.
- [ ] Every R28 cell, per class and per rank, is pinned by a table test.
- [ ] Holding `t3`, `t6a`, `t6b` changes no stat.
- [ ] `make test` (and lint, check) green in game-service.

## Blocked By

I-8RZ51-3 (the ranks on the character in play and on the body).

## Spec Reference

FS-8RZ51 §F R24–R28, R31, §Edge States (mid-run level-up). User stories 13, 14, 23.

## TDD Approach

- RED: a warrior seated with `t1a` at 2 has max HP round(own × 1.08).
- GREEN: the bonus computed from the ranks in `buildBodyLocked` and read beside gear's.
