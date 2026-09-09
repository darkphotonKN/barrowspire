---
id: I-0048
status: done
implements: FS-0008
blocked_by: [I-0046]
labels: [blocked]
title: "FS-0008 slice 4: the hub is a safe zone"
---
Implements FS-0008 §Requirements 6

**Author: agent**

## What to Build

Combat exists only in runs. `attack` and `cast_skill` sent from the hub are rejected and produce
no effect on any entity.

Note where the damage actually lives: it is **inlined in `MovementSystem`** (hardcoded 10
damage, range 60, 0.5s cooldown), not in `CombatSystem`, which is an empty stub. The hub reuses
`MovementSystem` (FS-0008 §Requirements 5), so the rejection must be placed where it actually
guards that path — do not assume disabling `CombatSystem` accomplishes anything.

`cast_skill` is included even though `SkillSystem` is an empty stub today: the action constant
exists, and a future implementation that forgets the hub would silently open combat there.

**Out of scope:** moving combat out of `MovementSystem` into `CombatSystem`. That is a known
divergence recorded in `game-service/SPECIFICATION.md` and FS-0008 §Out of Scope explicitly
excludes changes to run gameplay. Guard the hub; leave the misplacement alone.

## Acceptance Criteria

- [x] `attack` sent from the hub changes no health value on any entity.
- [x] `cast_skill` sent from the hub has no effect.
- [x] Attacking still works normally inside a run.
- [x] The rejection guards the real damage path in `MovementSystem`, not only `CombatSystem`.
- [x] **Revised, as in the earlier slices:** no new test failures, no new lint findings versus
      the branch point. Lint held at 34.


### Found while writing the test: one entity per spatial-hash cell

`MovementSystem` buckets entities before simulating them:

```go
key := entityCellX<<8 | entityCellY
entitiesMap[key] = entity        // map[int]*ecs.Entity — one per cell
```

Cells are `2 * PlayerRadius` = 40 wide, and the map holds **one entity per cell**, so
two delvers standing close enough together drop one of them out of the simulation
entirely — not moved, not collided, not able to attack. The first version of this
slice's test put both players on the same spot and the attack silently did nothing,
which is how it surfaced.

Pre-existing and unrelated to the safe zone; recorded here because it is easy to
mistake for a netcode problem when a player freezes next to someone else.

## Blocked By

I-0046 — the hub must exist to be a safe zone.

## Spec Reference

FS-0008 §Requirements 6; thin line `game-service/SPECIFICATION.md` "### Hub world" → "Hub is a
safe zone". §Out of Scope: any change to run gameplay, combat placement included.

## TDD Approach

- RED: two players in the hub, one sends `attack` at the other in range; assert the target's
  health is unchanged. Today the inlined `MovementSystem` damage applies it.
- GREEN: hub-world guard on the damage path.
- RED: the same two players in a run; assert damage still lands (guards against over-blocking).
