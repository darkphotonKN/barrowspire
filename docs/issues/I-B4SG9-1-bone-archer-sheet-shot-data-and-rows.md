---
id: I-B4SG9-1
status: done
implements: FS-B4SG9
blocked_by: []
labels: [ready-for-agent]
title: "FS-B4SG9 slice 1: the Bone Archer's sheet, a monster's shot as sheet data, its experience and drop rows"
---
Implements FS-B4SG9 §A (R1–R3)

**Type:** AFK. **Hotspot:** `monster_tuning.go` and `loot_tuning.go`, one writer at a time
(I-B4SG9-7 touches `monster_tuning.go` again, later).

## Files owned

- `game-server/game-service/internal/components/monster.go` (the `bone_archer` archetype; the shot's fields on the monster component)
- `game-server/game-service/internal/game/monster_tuning.go` (the sheet, the shot on `monsterSheet`, the experience row)
- `game-server/game-service/internal/game/loot_tuning.go` (the `MonsterDrops` row)
- `game-server/game-service/internal/game/factory.go` (`CreateMonsterEntity` copies the shot at spawn)
- `game-server/game-service/internal/types/messages.go` (the `MonsterState.Archetype` comment only; no field)
- Tests: `internal/game/monster_roll_test.go`, `kill_experience_test.go`, `monster_drops_test.go`

## What to Build

A Bone Archer can exist, with its numbers, and pays what a ghoul pays. Nothing shoots yet and
nothing places one.

- A monster sheet may carry a **shot**: projectile type, speed, radius, max flight. Which
  archetypes shoot is this data, never a check on the archetype (R1), the way `monsterMoves`
  carries the demons' claw. The shot is copied to the monster component at spawn with the timings.
- The `bone_archer` sheet with exactly R2's table: 30 HP, 7 damage, speed 130, range 320, aggro
  360, leash 560, interval 2.0 s, wind-up 0.6 s, defense 2, magic resistance 0; shot `bone_arrow`,
  420 px/s, radius 8, max flight 700.
- Experience base 10 and the ghoul's drop row, as rows of its own (R3). Elite promotion is the
  existing one.
- A Bone Archer created today, with no AI branch yet, behaves as a melee monster with a 320 px
  reach. That is why nothing places one until I-B4SG9-7.

## Acceptance Criteria

- [ ] The `bone_archer` sheet carries exactly R2's values, and a level-1 Bone Archer spawns with 30
      HP, 7 damage and move speed 130, its shot copied onto its component.
- [ ] An elite Bone Archer takes FS-77AB6 R23's multipliers and a prefixed name ("Dread Bone Archer").
- [ ] A kill record for a Bone Archer gives experience from base 10 and rolls the ghoul's drop row.
- [ ] Every other sheet has no shot, and every existing test passes unchanged.
- [ ] `go test ./...` and `golangci-lint run` pass in game-service.

## Blocked By

None

## Spec Reference

FS-B4SG9 §A R1–R3; user stories 9, 14, 15, 20, 24; acceptance criteria "Server" 1–3.

## TDD Approach

- RED: the sheet's values and a spawned Bone Archer's stats; its experience and its drop row.
- GREEN: the archetype, the shot on the sheet and component, the two rows.
