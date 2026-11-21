---
id: I-04EEA-4
status: done
implements: FS-04EEA
blocked_by: [I-04EEA-1]
labels: [blocked]
title: "FS-04EEA slice 4: Arrow Rain lands five volleys on a circle"
---
Implements FS-04EEA §E

**Author: agent**

## What to Build

`cast_skill {skill_id: "arrow_rain"}` from an archer who has the tree ability marks a 70 px circle
within 300 px and lands 5 volleys on it across 1.5 s.

- Add an Arrow Rain row to `attackTable`: physical, coefficient 0.5, `scaleAgility`, cost 35
  (stamina), cooldown 12 s, `slows: true` (R5, R25).
- **The circle (R23).** Centre = the target point if within 300 px of the archer, else the point
  300 px along the line toward it. Radius 70.
- **The rain is a floor entity (R26)**, like the burning trail (`components/burning_trail.go`): a new
  component holding the archer's attack snapshot captured at the cast, the centre, the radius, the
  volleys left and the time to the next. The CombatSystem steps it each tick; a floor change
  clears it with the floor.
- **Volleys (R24).** At 0.3, 0.6, 0.9, 1.2 and 1.5 s after the resolving tick, each volley hits
  every valid target whose centre is within 70 px of the centre, once, through `applyHit` (own crit
  roll each, kills credited to the archer). Delvers are not hit with player damage off. Use an
  epsilon as the burning trail does so the volleys fall on the right ticks at 30 and 60 Hz.
- It keeps falling, and credits the archer, after the archer dies, escapes or leaves (R26): unlike
  the trail, it does not go out with its caster.
- No line-of-sight test (R27). Nothing on the wire (R28).

## Acceptance Criteria

- [ ] An archer with the node, 35+ stamina, off cooldown: 35 stamina spent, a 12 s cooldown, a
      rain centred on the target, or 300 px along the line when the target is further.
- [ ] Exactly 5 volleys, at 0.3, 0.6, 0.9, 1.2 and 1.5 s, on 30 Hz and 60 Hz ticks.
- [ ] Each volley hits each valid target inside 70 px once, physical, coefficient 0.5, Agility,
      with its own crit roll; a target 75 px out is not hit; a monster walking in mid-rain is hit by
      the later volleys only.
- [ ] Kill credit reaches the archer, including after they die mid-rain.
- [ ] A floor change clears a rain in progress.
- [ ] Not an archer, or no node: nothing happens.
- [ ] The state broadcast is unchanged.
- [ ] I-04EEA-1's exported tree-ability cost read answers 35.
- [ ] `go test ./...` and `golangci-lint run` pass in `game-server/game-service`.

## Blocked By

I-04EEA-1 (the kinds, aliases and the gate).

## Spec Reference

FS-04EEA §A R4–R7, §E R23–R28; §User Stories 13, 15–17; §Acceptance Criteria "game-service" (Arrow
Rain rows); §Edge States "Arrow Rain through a wall", "Arrow Rain on a monster that walks in or
out", "Two archers' rains overlapping", "Archer dies mid-rain", "Floor change mid-rain".

## Files expected

- `game-server/game-service/internal/components/arrow_rain.go` (new)
- `game-server/game-service/internal/ecs/entity.go` (the new component type constant)
- `game-server/game-service/internal/systems/combat.go`
- `game-server/game-service/internal/systems/arrow_rain_test.go` (new)
- `game-server/game-service/internal/game/combat_uniques_test.go` (or a sibling: the floor change clears a rain, as it does a trail)

## TDD Approach

- RED: `arrow_rain_test.go`, a rain cast with a monster at 50 px from the centre records exactly 5
  hits on it over 1.5 s of 1/60 s ticks, the first on the tick at 0.3 s.
- GREEN: the row, the component, the stepping in `Update`.
