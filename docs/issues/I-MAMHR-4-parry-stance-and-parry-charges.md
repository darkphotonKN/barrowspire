---
id: I-MAMHR-4
status: done
implements: FS-MAMHR
blocked_by: [I-MAMHR-2]
labels: [blocked]
title: "FS-MAMHR slice 4: the parry stance negates strikes and grants parry charges"
---
Implements FS-MAMHR §C (Requirements 10–18), §D (Requirements 19–22), §F (Requirements 27–29)

**Lane: agent** (game-service). ADR-0030's exception: the window, the lockout and the parry charges
are server state. Always write "parry charge", never bare "charge" (that is the warrior's dash).

## What to Build

- **Per-delver parry state** (a new pure-data component, e.g. `ParryComponent`): stance open until,
  whiff lockout until, whether the open window has negated anything, and a monotonic `parries`
  count. The parry charge count itself is FS-8AY7S's resource component, not a second copy.
- **Cast (R10, R16, R18).** `cast_skill { skill_id: "parry" }` (`components.AttackParry`, alias
  `parry`): target ignored, no cost, no cooldown row. Refused (no change) while the stance is open,
  during the whiff lockout, or from a non-mercenary.
- **Window (R11, R12).** Opens on the tick the cast arrives, open 0.25 s. The CombatSystem opens this
  tick's stances **before** resolving any monster strike, so a same-tick strike is inside the window
  whatever the entity order.
- **Parry (R14, R17).** A monster strike (`AttackMonsterStrike`, elites and the boss included) that
  resolves on the merc while the stance is open: no damage, no crit roll, no Gravewarden reflect;
  +1 parry charge capped at 3; `parries` +1 (also at the cap); the window stays open. Only the merc
  who raised it is protected. A strike that whiffs on reach never reaches the merc and is not a
  parry.
- **Lockout (R15).** A window that closes having negated nothing starts a 1.0 s lockout from its
  close. One that negated anything starts none.
- **No root (R13).** Movement is untouched; the merc's other casts do not close the stance.
- **Parry charges (R19–R22).** Change only by a parry (+1) and the riposte (I-MAMHR-5). Kept across
  floors. On the tick of death (EliminationSystem), parry charges go to 0 and the stance and
  lockout clear. 0 at seat.
- **Wire (R28, R29).** `current_player` of a mercenary only gains `parry_open` (bool),
  `parry_lockout` (seconds left, 0 when none) and `parries` (int). Absent for other classes and in
  `other_players`. The parry charge count rides FS-8AY7S's resource fields.

## Acceptance Criteria

- [ ] A strike resolved on the opening tick, or within 0.25 s, deals 0 and grants 1 parry charge; one
      after 0.25 s deals damage.
- [ ] A parry cast and a strike in the same tick: parried, with the merc entity both before and
      after the monster in iteration order.
- [ ] Two strikes in one window: +2 parry charges; at 3 a parried strike is negated, the count stays
      3, `parries` still rises.
- [ ] An elite's and the boss's strikes are parried.
- [ ] A parried strike on a Gravewarden's Oath wearer reflects nothing.
- [ ] An empty window starts a 1.0 s lockout from its close; `parry` inside it changes nothing; a
      window that parried starts none and `parry` succeeds right after it closes.
- [ ] `parry` while open changes nothing; a non-mercenary's `parry` changes nothing.
- [ ] A strike on a teammate beside an open stance damages the teammate.
- [ ] The merc moves at full speed with the stance open.
- [ ] Parry charges survive a floor change; death zeroes them and clears stance and lockout.
- [ ] Serializer test: a merc's `current_player` carries the three fields; other classes and
      `other_players` do not.
- [ ] `go test ./...` and lint pass in game-service.

## Blocked By

- I-MAMHR-2 (the mercenary class exists).
- **FS-8AY7S: the generic class resource component with the parry-charge kind, and its resource
  fields on `current_player` only.**

## Spec Reference

FS-MAMHR §C Requirements 10–18, §D 19–22, §F 27–29; §Acceptance Criteria "The parry stance",
"Parry charges and the riposte" row 4, "Wire"; §Edge States; User Stories 6–13, 22, 23, 27.

## Files expected

- `game-server/game-service/internal/components/parry.go` (new) and `attack.go` (`AttackParry`)
- `game-server/game-service/internal/systems/combat.go` (alias, stance-first pass, negation in the strike path, lockout ticking)
- `game-server/game-service/internal/systems/elimination.go` (clear on death)
- `game-server/game-service/internal/game/factory.go` (attach the parry component to a mercenary)
- `game-server/game-service/internal/types/game.go` (`PlayerState` fields), `internal/serializer/state_serializer.go` (current_player only)
- tests: `internal/systems/parry_test.go` (new), `elimination` and serializer tests

## TDD Approach

- RED: a merc casts `parry`; a monster's wind-up ends on the same tick in range; expect 0 damage and
  1 parry charge, for both entity orders.
- GREEN: the parry component, the stance-first pass, the negation in the strike path.
