---
id: I-04EEA-2
status: done
implements: FS-04EEA
blocked_by: [I-04EEA-1]
labels: [blocked]
title: "FS-04EEA slice 2: Earthbreaker stuns what it hits, and a stunned monster stands still"
---
Implements FS-04EEA §B R10, §C

**Author: agent**

## What to Build

A monster the slam hits and does not kill is stunned: it stops moving and attacking, a wind-up it
was making is cancelled, and the state broadcast says `stunned`.

- No `stunsafe` flag exists in game-service or game-client (checked 2026-11-21); the stun is new.
  Add its remaining time as data on the monster (`internal/components/monster.go`), set by the
  CombatSystem on an Earthbreaker hit that leaves the monster alive: 1.0 s, or 0.5 s when `Boss`
  is set (champions are bosses). A second stun keeps the longer remaining (R16).
- In `internal/systems/monster_ai.go`, a stunned monster's tick: count its timers down (attack
  cooldown, slam cooldown, ability cooldown, repath, the stun itself), keep or take up its target
  as usual, set velocity 0, and do nothing else: no chase, wander, leash walk, facing, strike,
  claw, shot, wind-up, slam or ability start (R13, R15).
- When the stun lands, a wind-up in progress (`WindUpRemaining`, or an `AbilityPending` not yet
  `Leaping`) ends with nothing landing; the cooldowns it started stay spent. A leap in the air and
  a death burst's fuse are left alone (R14).
- `Action` is a new `MonsterActionStunned = "stunned"` while the stun runs; `dead` wins (R17).
  The serializer already passes `Action` through; add a test.

## Acceptance Criteria

- [ ] A monster the slam hits and leaves alive is stunned 1.0 s; a boss (and a champion) 0.5 s.
- [ ] A monster the slam kills, or a hit refused before the roll, stuns nothing.
- [ ] While stunned: velocity 0, no position change, no strike, claw, shot, slam, wind-up or
      ability start, whatever its target does.
- [ ] A stun mid wind-up (strike, slam, ranged draw, monster ability on the ground) lands nothing;
      the attack interval, slam and ability cooldowns it started are still spent afterwards.
- [ ] A leaping monster still lands its leap; a death burst still bursts.
- [ ] Cooldowns count down during the stun, and the monster still has its target when it ends.
- [ ] A 1.0 s stun landing on a monster with 0.3 s left leaves 1.0 s; a 0.5 s stun on one with 0.8 s
      left leaves 0.8 s.
- [ ] `action` is `stunned` on the wire for the stun's length, then whatever it does next; a dead
      monster reads `dead`.
- [ ] `go test ./...` and `golangci-lint run` pass in `game-server/game-service`.

## Blocked By

I-04EEA-1 (the Earthbreaker row and its hits).

## Spec Reference

FS-04EEA §B R10, §C R12–R17; §User Stories 5–7, 26, 30; §Acceptance Criteria "game-service"
(stun rows); §Edge States "Stun on a monster mid-leap", "Stun on a death burst", "Stun and the
claw's show", "Stun and leash", "Stun across a floor change".

## Files expected

- `game-server/game-service/internal/components/monster.go`
- `game-server/game-service/internal/systems/combat.go`
- `game-server/game-service/internal/systems/monster_ai.go`
- `game-server/game-service/internal/systems/monster_ai_test.go`
- `game-server/game-service/internal/systems/combat_test.go`
- `game-server/game-service/internal/serializer/monster_test.go`

## TDD Approach

- RED: `monster_ai_test.go`, a stunned monster in strike range of its target for 30 ticks issues
  no strike intent and does not move; a monster half-way through its wind-up when stunned never
  lands the strike.
- GREEN: the stun field, the AI's early return, the wind-up cancel, the action.
