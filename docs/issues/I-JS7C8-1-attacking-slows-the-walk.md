---
id: I-JS7C8-1
status: open
implements: FS-JS7C8
blocked_by: []
labels: [ready-for-agent]
title: "FS-JS7C8 slice 1: attacking slows the attacker's walk for the attack's action (game-service)"
---
Implements FS-JS7C8 §C (R14–R20), §Acceptance Criteria "Attack slow" (all but the last box)

**Lane: agent, under the charter's bounds.** game-service is normally the human lane (root
`CLAUDE.md`); the charter "角色小跑步" authorises this slice. ECS rules hold: the new state is a
pure-data component, the behaviour lives in systems.

## What to Build

A per-player **attack slow** (game-service `CONTEXT.md`): when `CombatSystem.resolve` carries out
a player's cast of a slowing kind, start (or restart) a 0.6 s window on that player; while it runs,
`MovementSystem` moves their walk at `AttackSlowFactor` (0.45) × their `VelocityComponent.Speed`.
The window is ticked down with the other per-tick timers and gone on the first tick after it ends.

- Slowing kinds: `attack`, `slash`, `cut` (and the riposte `armCut` turns it into), `arrow`,
  `fireball`, `shadow_shot`, `triple_fireball`, `dash`. Not `parry`; no monster kind.
- Only a cast that passes cooldown, cost and (targeted) target starts it: start it at the point
  in `resolve` where the cooldown is started, never before the early returns.
- A charge in flight moves at its own speed; the slow applies to the walk only.
- Never write the slow into `VelocityComponent.Speed` (`applyMoveSpeed` owns it); the wire's
  `direction.speed` stays as it is.
- `AttackSlowFactor` and `AttackSlowDuration` are named constants beside the attack table, marked
  starting values (FS-JS7C8 R15–R16).

## Acceptance Criteria

- [ ] A resolved cast of each slowing kind moves the player at 0.45 × their move speed for 0.6 s,
      and at full speed on the first tick after.
- [ ] A cast refused for cooldown, cost or target leaves the speed alone.
- [ ] `parry` never slows; a monster's strike or shot never slows anything.
- [ ] A second resolved cast inside the window restarts it at 0.6 s; the speed never drops below 0.45 ×.
- [ ] A dash's charge travels `dashDistance` at `dashSpeed` as before; walking after it inside the window is slowed.
- [ ] With +20% worn move speed the slowed walk is 0.45 × 240 = 108 px/s.
- [ ] `direction.speed` in the state is unchanged by the slow.
- [ ] Works in a run and in a field world (the combat system resolves player casts in both).
- [ ] `go test ./...` and `golangci-lint run` green in `game-server/game-service`.

## Blocked By

None

## Spec Reference

FS-JS7C8 §C R14–R20; Facts 2–3; Edge States "Latency", "Gear changed mid-slow"; user stories 7, 8,
10, 11, 17, 18.

## Files it expects to touch

- `game-server/game-service/internal/components/` (a new pure-data component, e.g. `attack_slow.go`)
- `game-server/game-service/internal/ecs/` (its component type)
- `game-server/game-service/internal/systems/combat.go` (start the window on a resolved cast; tick it)
- `game-server/game-service/internal/systems/movement.go` (apply the factor to the walk)
- `game-server/game-service/internal/game/factory.go` (give a player body the component, if not added lazily)
- tests beside each

## TDD Approach

- RED: a warrior who slashes while holding a move covers 0.45 × 200 × 0.6 px over the next 0.6 s
  of ticks, then 200 px/s.
- GREEN: the component, the start in `resolve`, the factor in `MovementSystem`.
