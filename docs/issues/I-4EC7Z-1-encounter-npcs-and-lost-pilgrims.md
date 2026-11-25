---
id: I-4EC7Z-1
status: done
implements: FS-4EC7Z
blocked_by: [I-9JV5K-3]
labels: [ready-for-agent]
title: "FS-4EC7Z slice 1: encounter NPCs on a floor, talking, and the Lost Pilgrims"
---
Implements FS-4EC7Z §A R1–R5, §B R6–R8, §F R22, R26, R27

**Hotspot:** game-service `session.go`, `factory.go`, `systems/combat.go` (`CanHit`, area and
projectile hit lists), `systems/monster_ai.go` (target choice), the serializer. One writer at a time.

## What to Build

- The encounter roll and room (R1–R2), using the respite / piece / hidden-room exclusions FS-5FZ4J
  and FS-9JV5K introduced.
- The encounter NPC entity (R3): health, body, stance, look; never damaged by delvers (every hit
  path: melee, area, projectile, reflect, trap); counted by monster targeting (nearest), except
  caged; removed on death with no experience or drops. Kept out of `persistentEntityIDs` (it dies
  with the floor).
- Talking (R4): interact → line key + `line_at`.
- Lost Pilgrims (R6–R8): plea on approach/talk, the 5 s wave of `2 + 2 × living` from two spots,
  the better chest (FS-5FZ4J's) beside the nearest living pilgrim when the wave is cleared.
- `encounter_npcs` on the wire (R22).

## Acceptance Criteria

- [ ] FS-4EC7Z server criteria for §A and §B.
- [ ] `encounter_npcs` serializes per R22, cut by interest, absent elsewhere.
- [ ] `make test` and `make check` green.

## Blocked By

I-9JV5K-3 (server lane order; respite rooms and the merchant's non-combatant exclusions).

## Spec Reference

FS-4EC7Z §A, §B, §F R22, R26–R27.

## TDD Approach

- RED: a delver's melee swing through a pilgrim leaves the pilgrim's health unchanged.
- GREEN: the friendly-body check in the hit path.
