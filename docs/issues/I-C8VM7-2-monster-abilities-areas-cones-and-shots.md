---
id: I-C8VM7-2
status: open
implements: FS-C8VM7
blocked_by: [I-C8VM7-1]
labels: [ready-for-agent]
title: "FS-C8VM7 slice 2: monster abilities as sheet data: slam, wail, cleave, dagger, volley and rock, with the ability state on the wire"
---
Implements FS-C8VM7 §B (R10-R14, R17-R18)

**Type:** AFK. **Hotspot:** `monster_tuning.go` (ability data on sheets), `monster_ai.go`,
`combat.go`. I-C8VM7-3 extends the same files after this lands. Runs alongside I-C8VM7-4 (which
touches the population files, not these).

## Files expected to touch

- `game-server/game-service/internal/components/monster.go` (ability fields copied at spawn; its cooldown and wind-up timers; the `ability` action)
- `game-server/game-service/internal/components/attack.go` (monster ability attack kinds)
- `game-server/game-service/internal/game/monster_tuning.go` (the `monsterAbility` type on `monsterSheet`; R11's numbers on `blood_troll`, `banshee`, `wight_archer`, every goblin, ogre and dark warrior)
- `game-server/game-service/internal/game/factory.go` (`CreateMonsterEntity` copies the ability)
- `game-server/game-service/internal/systems/monster_ai.go` (choosing the ability over a swing, R12; fixing the aim, R13; landing it)
- `game-server/game-service/internal/systems/combat.go` (area-around-self and cone hits on delvers only; multi-shot fan; the ability's projectile types)
- `game-server/game-service/internal/types/game.go` (`MonsterState.Ability`, optional)
- `game-server/game-service/internal/serializer/state_serializer.go` (`monsterState` fills `ability`)
- Tests: `internal/systems/monster_ai_test.go`, `combat_test.go`, `projectile_test.go`, `internal/game/monster_roll_test.go`, serializer test

## What to Build

Monsters with an ability use it. Shapes in this slice: an **area around itself** (Blood Troll
slam, Banshee wail), a **cone** (Dark Warrior cleave), and **shots** (goblin dagger, ogre rock,
Wight Archer volley of 3 fanned `bone_arrow`s). Pounce and death burst are I-C8VM7-3.

- Ability is sheet data (R10), on exactly R11's archetypes with R11's numbers.
- R12: ready at spawn; replaces the next swing when ready and the target is in its distances
  (and in sight for a shot); a goblin out of melee but in dagger range stops to throw. Cooldown
  starts with the wind-up.
- R13: area and cone fixed at the wind-up's start; a shot tracks and leaves at the end, as the
  Bone Archer's.
- R14: area/cone hit delvers only, level damage × multiplier, physical, base crit, mitigated,
  snapshotted; an elite's at elite damage. Shot abilities are monster shots with the new
  projectile types (`thrown_dagger`, `ogre_rock`) and are stopped by walls.
- R17: `action: "ability"` through the wind-up; `ability: {kind, x, y, radius, arc, remaining}`
  while an area or cone is pending; a shot ability sets only `kind` and `remaining`.

## Acceptance Criteria

- [ ] Each R11 ability (this slice's six) is on exactly its archetypes with R11's numbers; every other sheet has none.
- [ ] A hunting monster with a ready ability and its target in range (and in sight for a shot) winds it up instead of its swing, reports `action: ability` and `ability`, and starts its cooldown; while cooling it attacks as before.
- [ ] A slam and a wail land on the circle fixed at the wind-up's start: a delver who left it is not hit, one inside is hit at level damage × multiplier, mitigated; no monster is hit.
- [ ] A cleave hits a delver within 110 px and 60° of the facing, not one behind.
- [ ] A volley looses 3 `bone_arrow`s 12° apart; a dagger and a rock leave as `thrown_dagger` and `ogre_rock` with R11's speed, radius and flight, and walls stop them.
- [ ] A goblin at 200 px with its dagger ready stops and throws; with it cooling, it chases.
- [ ] The serializer emits `ability` only while one is pending, with R17's fields.
- [ ] `make test` and `golangci-lint run` pass in game-service.

## Bounds

Never touch `internal/matchmaker` or `internal/match_queue`. No migrations, no HTTP contract
change (the WebSocket `ability` field is not the HTTP contract), no kill or match stats.

## Blocked By

I-C8VM7-1

## Spec Reference

FS-C8VM7 §B R10-R14, R17-R18; user stories 7, 9, 11, 12; acceptance criteria "Server" 6-9, 12.

## TDD Approach

- RED: a Blood Troll with a ready slam and a delver at 80 px winds up the slam, not a swing, and the slam misses a delver who stepped out.
- GREEN: ability data, the AI branch, the CombatSystem's circle hit; then cone, then shots.
