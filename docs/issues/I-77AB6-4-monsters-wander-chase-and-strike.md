---
id: I-77AB6-4
status: done
implements: FS-77AB6
blocked_by: [I-77AB6-3]
labels: [ready-for-agent]
title: "FS-77AB6 slice 4: Monsters wander, chase and strike delvers"
---
Implements FS-77AB6 §Requirements (Monster AI 26–27; Combat 1, 5, 14)

**Domain:** game-service · **Touches `internal/game/session.go`:** yes (adds `MonsterAISystem` to the run tick, before movement; final run tick order). Backend is the human lane per root CLAUDE.md; this slice is sized for `/develop` at the owner's request.

## What to Build

The barrow fights back.

- `MonsterAISystem` (sets velocity, facing, AI state only):
  wander within 150 px of home reusing `WanderSystem`'s destination/pause/stall-abandon pattern
  → acquire nearest in-play delver within aggro radius (distance only) → retaliate on being hit
  from any distance → chase straight-line → in range and interval elapsed: stop, face, wind-up,
  strike at wind-up end if target within range × 1.25 else whiff → keep target until invalid →
  leash on target death/escape/leaving/beyond leash radius, return to wandering.
- Monster strikes go through the `CombatSystem` (physical, monster damage at level, base 5% crit,
  mitigated by delver defense = class + armor); player death flows through the existing
  `EliminationSystem`.
- Monsters move via `MovementSystem` and collide with walls, doors, delvers and each other.
- Dead monsters have no AI; a monster dying mid-wind-up never strikes.
- Run tick order: AI → movement → projectiles → combat → monster death → interaction →
  elimination → rules → broadcast. Hub order unchanged.
- Out-of-play delvers (dead/escaped) are never acquired and are dropped as targets — honour this
  whether or not slice 6 has landed.
- Add a benchmark: a full run tick (2 delvers, 14 monsters + demon-sized entity, projectiles in
  flight). Record the result in the PR. If the tick is not well inside 33 ms, flag it — FS-QG1HR's
  parked wall/door spatial index gets pulled in before shipping.

**Watch:** FS-QG1HR D4 (spatial hash, one entity per cell) will make swarming monsters freeze
and jitter. Not absorbed here; recommended to land D4 before or alongside this slice.

## Acceptance Criteria

- [ ] Wander with no delver in aggro radius; chase the nearest in-play delver inside it.
- [ ] Wind-up then strike in range; whiff if the delver leaves range × 1.25 during the wind-up.
- [ ] A monster hit from outside its aggro radius acquires its attacker.
- [ ] Aggro dropped beyond leash radius, and when the target dies or escapes; monster resumes wandering.
- [ ] Monster strikes damage delvers through the CombatSystem formula (armor mitigates); a delver killed by monsters is eliminated through the existing path.
- [ ] A dead monster neither moves nor strikes; death mid-wind-up cancels the strike.
- [ ] A monster wedged on a wall eventually abandons a wander destination (stall rule).
- [ ] Benchmark present and its result in the PR description.
- [ ] `make lint && make test` pass.

## Blocked By

I-77AB6-3 (death state, so AI can skip the dead)

## Spec Reference

FS-77AB6 §Requirements 14, 26–27; §Edge States (delver dies/escapes/disconnects mid-chase, wedged monster, spatial-hash freezes, hub); §Acceptance Criteria "Monsters" (AI rows, movement/collision, benchmark); User Stories 3–7, 13.

## TDD Approach

- RED: a ghoul with a delver at 200 px (inside aggro) sets velocity toward the delver after one AI tick.
- GREEN: acquire + chase; then RED/GREEN for wind-up/strike/whiff with a stepped clock, then leash.
