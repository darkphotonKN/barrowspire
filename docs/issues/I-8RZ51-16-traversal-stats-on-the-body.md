---
id: I-8RZ51-16
status: open
implements: FS-8RZ51
blocked_by: [I-8RZ51-13]
labels: [blocked]
title: "FS-8RZ51 slice 16: Vitality, Might, Haste and Fleetness on the seated body, the filler stat rows retired (game-service)"
---
Implements FS-8RZ51 §Change: Tree v2: a traversal graph with locked sides, §V-B (V14), §V-C (V16–V17)

**Author: agent.**

## Files it expects to touch

- `game-server/game-service/internal/systems/passive_bonus.go`: `sumPassives` reads `max_hp`'s unit
  (percent of own max, or flat points); `primary_attribute` goes to the class's attributes through
  the package's table; the rows for `max_stamina`, `mana_regen` and bare `strength`,
  `intelligence` and `agility` are deleted
- `game-server/common/passivetree/tree.go` (delete the stat constants no node names)
- `game-server/game-service/internal/systems/passive_bonus_test.go` and
  `game-server/game-service/internal/game/passive_bonus_test.go`

## What to Build

The traversal nodes' effects at seating and on a spend in town (R24–R27, unchanged paths):

- Vitality adds +5 max HP flat, summed with Thick Skin's percent.
- Might adds +2 to the class's attributes. The mercenary gets Strength and Agility.
- Haste and Fleetness add +2% inside gear's caps.

Dead stat rows go.

## Acceptance Criteria

- [ ] FS-8RZ51 §Change "Effects and words (game-service)" rows 1–5.
- [ ] A spend in town of `r1` raises the HUB body's max and current HP by 5 at once.
- [ ] `make test` green in game-service (with lint and check) and in common.

## Blocked By

I-8RZ51-13 (the nodes and `primary_attribute`).

## Spec Reference

FS-8RZ51 §Change: Tree v2 V14, V16, V17. User stories 1, 16.

## TDD Approach

- RED: a warrior seated holding `warrior.r1`, `warrior.m1` and `warrior.m3` has max HP own + 15.
- GREEN: the unit read on `max_hp`.
