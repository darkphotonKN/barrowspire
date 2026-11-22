---
id: I-JS7C8-14
status: done
implements: FS-JS7C8
blocked_by: []
labels: [ready-for-agent]
title: "FS-JS7C8 slice 14: a resolved attack pins its caster, and a pinned caster's casts are refused (game-service)"
---
Implements FS-JS7C8 §Change: Attacking pins the attacker (R49–R60)

**Lane: agent, under the charter's bounds.** game-service is normally the human lane (root
`CLAUDE.md`); the owner-approved charter of 2026-11-21 authorises this slice, as it authorised
I-JS7C8-1. ECS rules hold (`game-server/game-service/CLAUDE.md`): the pin is a pure-data
component, the behaviour lives in systems.

## What to Build

Turn I-JS7C8-1's attack slow into the **pin** (game-service `CONTEXT.md`):

- **Rename** (R59): `AttackSlowComponent` → `AttackPinComponent` (file `attack_pin.go`),
  `ComponentTypeAttackSlow` → `ComponentTypeAttackPin`, `AttackSlowDuration` →
  `AttackPinDuration`, `attackSlowEpsilon` → `attackPinEpsilon`, `startAttackSlow` /
  `tickAttackSlow` → `startAttackPin` / `tickAttackPin`, the attack row's `slows` → `pins`. Delete
  `AttackSlowFactor`.
- **No walk while pinned** (R49, R52): `walkFactor` returns 0 for an entity carrying the pin. The
  stored velocity is never touched: `internal/game/session.go` (`handleMove`) does not change, and
  nothing is zeroed when the pin starts, so the body walks its held direction on the first tick it
  may.
- **Length** (R50): start the pin at `AttackPinDuration / (1 + wornGear(caster).AttackSpeedPercent/100)`,
  the same divisor the cooldown uses on that tick. 0.6 s unequipped, 18 ticks at 30 Hz.
- **Kinds** (R51, R55): every player row keeps `pins: true` except `dash`, whose row drops it. No
  other attack-table value changes.
- **Refusal** (R53): in `resolve`, beside the cooldown check and before the cost, a pinned caster's
  intent does nothing (no damage, nothing spent, no cooldown, no charge started or stopped, the pin
  not restarted). The dash is refused too. The parry is untouched (it has no row; `stepStance`
  opens it) (R54).
- Monster hits never touch the pin (R57); monsters never get one (no monster row pins).

## Acceptance Criteria

- [ ] For each pinning kind, a caster walking a held direction whose cast resolves walks at full
      speed on the cast's tick, then stands for exactly 18 ticks with its velocity still the held
      direction, then walks it at full speed on the next tick.
- [ ] +50% worn attack speed (the cap) pins for 12 ticks, +20% for 15.
- [ ] A move sent during the pin changes the stored velocity and not the position; after the pin
      the body walks the latest direction. A stop sent during the pin leaves it standing after.
- [ ] While pinned, each pinning kind and the dash is refused: no damage, the resource unchanged,
      no cooldown started, no charge, and the pin ends on the tick it would have.
- [ ] Two casts queued on one tick: the first resolves and pins, the second is refused.
- [ ] A cast refused for cooldown, cost or target starts no pin.
- [ ] A parry while pinned opens the stance; a parry never pins.
- [ ] A resolved dash starts no pin and the walk right after its charge is at full speed; a pinning
      cast resolving during a charge stops the charge and pins.
- [ ] A monster's strike on a pinned delver leaves the pin's remaining time as it would have been;
      no monster ever carries the pin.
- [ ] `direction.speed` in the state is unchanged by the pin.
- [ ] Through a session, in a run and in the dev test room: walk, slash, stand 18 ticks, walk on,
      the key never re-sent.
- [ ] No `AttackSlow`, `attackSlow` or `AttackSlowFactor` remains in game-service Go (grep).
      `internal/game/session.go` unchanged.
- [ ] No file under `game-server/common/api/proto`, `game-server/api-gateway`,
      `game-client/src/api/generated` or any migration changes.
- [ ] `make test` (and the service's lint and check targets) green in `game-server/game-service`.

## Blocked By

None

## Spec Reference

FS-JS7C8 §Change: Attacking pins the attacker: D1–D8, D13, D14; Requirements 49–60; the
game-service Acceptance Criteria; Edge States "A key held through the pin", "A key released during
the pin", "A key changed during the pin", "Two casts queued on one tick", "A charge in flight when
an attack resolves", "Pinned and pushed", "Death, escape, floor change, world switch mid-pin".

## Files it expects to touch

- `game-server/game-service/internal/components/attack_slow.go` → `attack_pin.go`
- `game-server/game-service/internal/ecs/entity.go` (the component type)
- `game-server/game-service/internal/systems/combat.go` (constants, the `pins` flag, dash row,
  refusal in `resolve`, start with the attack-speed divisor, the tick)
- `game-server/game-service/internal/systems/movement.go` (`walkFactor`)
- `game-server/game-service/internal/systems/attack_slow_test.go` → `attack_pin_test.go`
- `game-server/game-service/internal/systems/dash_test.go` (`TestDash_ReplacesTheWalkWhileItLasts`:
  the walk after a dash is now full speed)
- `game-server/game-service/internal/game/attack_slow_test.go` → `attack_pin_test.go` (test only;
  see the bounds note)

**Bounds note (escalated to the owner, not decided here).** The charter lets this change touch
`internal/systems`, `internal/components` and `internal/ecs`. I-JS7C8-1's session-level test
`internal/game/attack_slow_test.go` asserts the 0.45 slow and will fail once the pin lands, so it
must be rewritten for the pin (R58's run and dev-room check). That is a test file under
`internal/game`, outside the stated list; `session.go` itself stays unchanged. Confirm before
building. (`internal/game/monster_death_test.go` only mentions the slow in a comment and passes
unchanged; its wording can be left.)

## TDD Approach

- RED: a warrior walking +x who slashes stays at the same position for 18 ticks after the cast's
  tick, with `VelocityComponent.VX` still 1, then moves `DefaultSpeed × dt` on the next.
- GREEN: `walkFactor` returns 0 for the pin; rename; then the refusal, the divisor and the dash
  flag, each with its own red test first.
