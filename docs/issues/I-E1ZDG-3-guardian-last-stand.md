---
id: I-E1ZDG-3
status: done
implements: FS-E1ZDG
blocked_by: [I-E1ZDG-2]
labels: [ready-for-agent]
title: "FS-E1ZDG slice 3: Guardian's Last Stand, once per floor"
---
Implements FS-E1ZDG §C (Requirements 11–13)

**Lane: agent** (game-service).

## What to Build

- A Guardian carries a Last Stand that is **ready** when seated in any world.
- In `CombatSystem.applyHit`, a hit that would take a Guardian with Last Stand ready to 0 HP
  instead leaves them at **1 HP**, sets their stamina to its max, and spends the Last Stand. The
  rest of the hit resolves as before (a Gravewarden's Oath reflect still uses the resolved damage).
- `settlePartyOnNewFloor` makes it ready again for every Guardian when the party moves up a floor.
  In the town and fields it is once per visit: no refill on a field respawn.
- `Session.Fall` is untouched: a fall kills.

## Acceptance Criteria

- [ ] A Guardian at 10 HP taking a 50-damage monster strike is at 1 HP, full stamina, in play.
- [ ] A second killing blow on the same floor kills.
- [ ] After `regenerateFloor`, the Last Stand saves again.
- [ ] A boss's strike is saved like any other.
- [ ] Two killing blows on one tick: the first is saved, the second kills.
- [ ] A Guardian who falls dies.
- [ ] A Berserker or an unspecialized warrior dies to the same blow.
- [ ] `make test` (with lint and check) passes in game-service.

## Blocked By

I-E1ZDG-2 (the body's specialization, read from its passive ranks).

## Spec Reference

FS-E1ZDG §C R11–13; §Acceptance Criteria "Guardian"; §Edge States (Last Stand rows); User Stories
8–10.

## Files expected to touch

- `game-server/game-service/internal/components/` (the Last Stand state: a field or a small
  component)
- `game-server/game-service/internal/systems/combat.go` (`applyHit`)
- `game-server/game-service/internal/game/session.go` (`settlePartyOnNewFloor`), seating
- `game-server/game-service/internal/systems/combat_test.go` or a new `last_stand_test.go`;
  `game/floor_test.go` for the refill

## TDD Approach

- RED: a Guardian at 10 HP, stamina 0, a monster strike of 50; after the tick HP is 1 and stamina
  is max.
- GREEN: the check before `health.CurrentHealth` is written in `applyHit`.
