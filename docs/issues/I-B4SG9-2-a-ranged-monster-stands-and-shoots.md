---
id: I-B4SG9-2
status: open
implements: FS-B4SG9
blocked_by: [I-B4SG9-1]
labels: [blocked]
title: "FS-B4SG9 slice 2: a ranged monster walks to range, draws, and looses an arrow the CombatSystem resolves"
---
Implements FS-B4SG9 §A (R4, R6–R12)

**Type:** AFK. **Hotspot:** `monster_ai.go` and `combat.go`. I-B4SG9-3 edits `monster_ai.go`
after this.

## Files owned

- `game-server/game-service/internal/systems/monster_ai.go` (the ranged branch of `think` and `windUp`)
- `game-server/game-service/internal/systems/combat.go` (the monster's shot as an attack row delivered as a projectile)
- `game-server/game-service/internal/components/attack.go` (the attack kind for a monster's shot)
- `game-server/game-service/internal/components/monster.go` (only if the release needs a field)
- Tests: `internal/systems/monster_ai_test.go`, `combat_test.go`, `projectile_test.go`; `internal/game/integration_test.go` or a new `bone_archer_test.go` for the tick-level cases

Not owned: `projectile.go`. The arrow is an ordinary projectile and that system does not change
(R10); this slice only adds tests that pin what it already does for a monster's shot.

## What to Build

In open ground, with line of sight taken as clear (I-B4SG9-3 adds the test), a monster with a shot:

- walks toward its target, by the existing chase, until the target is within its shooting range,
  then stands and faces it (R4);
- with its interval elapsed starts a wind-up, the interval restarting as a melee strike's does;
  between arrows it stands idle; it never backs away and never queues a melee strike (R6);
- through the wind-up stands still, reports `attack`, and **keeps turning to face its target** (R7);
- at the wind-up's end, if it has a target, hands the `CombatSystem` one shot aimed at where that
  target stands on that tick: no lead, no range check, no sight check (R8);
- the `CombatSystem` fires it as a projectile carrying the monster's snapshot taken then (damage
  at level, physical, base crit, `FromMonster`), with the shot's type, speed, radius and max
  flight from the monster, not from a per-archetype branch (R9).

A monster without a shot goes through the same code as today.

**Do not touch** `parryStrike`, `reflect` or their call sites, and add no test that pins whether
an arrow is parried or reflected (R13, §Open questions 1–2).

## Acceptance Criteria

- [ ] A target at 500 px: it walks. At 320 px or less: it stands and faces the target.
- [ ] In range it reports `attack` for 0.6 s standing still, then exactly one projectile of type
      `bone_arrow` exists at its position, moving at 420 px/s toward where the target stood on the
      release tick.
- [ ] A target that moved during the wind-up: the monster's facing followed it, and the arrow is
      aimed at the release-tick position.
- [ ] Successive arrows at a standing target leave 2.0 s apart.
- [ ] An arrow reaching a delver in play damages them through the `CombatSystem` by the monster
      formula; nothing else reduces health.
- [ ] A delver strafing across the line at 200 px/s from 320 px is not hit; one running straight
      away from 320 px at 200 px/s is hit.
- [ ] The arrow stops at a wall and at 700 px; it passes through a monster, a corpse and a delver
      out of play; a second delver in the line is the one hit.
- [ ] Killed mid-wind-up: no arrow. Killed with an arrow in the air: the arrow still lands.
- [ ] No target at the wind-up's end (dead, escaped, left, past the leash): no arrow.
- [ ] Hit from beyond its aggro radius, it takes the attacker as its target and walks to range.
- [ ] It never moves away from its target and never queues a monster strike.
- [ ] The existing monster AI, combat, parry and projectile tests pass unchanged.
- [ ] `go test ./...` and `golangci-lint run` pass in game-service.

## Blocked By

I-B4SG9-1

## Spec Reference

FS-B4SG9 §A R4 (range half), R6–R12; R13 as a prohibition; user stories 3–6, 9, 11, 12, 16;
edge states "Target in the same or a neighbouring cell", "Target hovering at 320 px", "Target
swaps during a wind-up", "Another delver in the line", "A pack between archer and target",
"Archer dies with an arrow in flight".

## TDD Approach

- RED: a ranged monster in range stands, winds up for its wind-up, and a projectile exists aimed
  at the target's release-tick position.
- GREEN: the ranged branch in the AI and the shot's row in the `CombatSystem`.
- Then the dodge pair (strafe misses, straight flight is hit) as tick-level tests.
