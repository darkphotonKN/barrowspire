---
id: I-MAMHR-5
status: done
implements: FS-MAMHR
blocked_by: [I-MAMHR-4]
labels: [ready-for-agent]
title: "FS-MAMHR slice 5: at three parry charges the next cut is a riposte"
---
Implements FS-MAMHR §E (Requirements 23–26)

**Lane: agent** (game-service).

## What to Build

- When a merc's `cut` resolves (not refused by cooldown) while they hold 3 parry charges, it
  resolves as the **riposte** (`components.AttackRiposte`, an attack row with **no** skill alias):
  cone delivery, 240° arc (half-angle 120°) centred on the aim, 90 px reach, physical, coefficient
  3.0, hybrid STR+AGI scaling, hitting every valid target in the arc.
- It spends all 3 parry charges whether or not it hits anything, and shares the cut's 0.25 s
  cooldown slot.
- No client message can request a riposte directly.

## Acceptance Criteria

- [ ] With 3 parry charges, a cut hits every valid target within 90 px inside 240° of the aim at
      coefficient 3.0 (level 1, unequipped, no crit, no mitigation: 49 per target) and the count is 0.
- [ ] A riposte into empty air still leaves 0 parry charges.
- [ ] A cut refused by its cooldown at 3 parry charges spends nothing; the next resolved cut is the
      riposte.
- [ ] With 2 parry charges, a cut is a plain cut and spends nothing.
- [ ] Sending `riposte` (or any other id) as a skill does nothing.
- [ ] A riposte thrown with the stance open leaves the stance open.
- [ ] `go test ./...` and lint pass in game-service.

## Blocked By

I-MAMHR-4 (parry charges are earned).

## Spec Reference

FS-MAMHR §E Requirements 23–26; §Acceptance Criteria "Parry charges and the riposte" rows 1–3, 5;
§Edge States (riposte rows); User Stories 14–17, 28.

## Files expected

- `game-server/game-service/internal/components/attack.go` (`AttackRiposte`)
- `game-server/game-service/internal/systems/combat.go` (arming at resolve, spend)
- `game-server/game-service/internal/systems/riposte_test.go` (new) or `combat_test.go`

## TDD Approach

- RED: a merc at 3 parry charges casts `cut` at a point with three monsters at 80 px spread over
  200°; expect all three hit and the count at 0.
- GREEN: the riposte row and the arming branch in resolve.
