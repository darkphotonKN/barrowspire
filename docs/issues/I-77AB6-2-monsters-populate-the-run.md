---
id: I-77AB6-2
status: done
implements: FS-77AB6
blocked_by: []
labels: [ready-for-agent]
title: "FS-77AB6 slice 2: Ghouls and trolls populate every run at party-scaled levels"
---
Implements FS-77AB6 §Requirements (Monsters 18–22, 25; State protocol 32–33), §WebSocket message surface

**Domain:** game-service · **Touches `internal/game/session.go`:** yes (one population call after the roster is placed — put the population logic itself in a new file, e.g. `internal/game/monster_population.go`). Backend is the human lane per root CLAUDE.md; this slice is sized for `/develop` at the owner's request.

## What to Build

Monsters exist in every run and every client is told about them. They stand idle in this slice
(AI is slice 4, death is slice 3).

- Monster component on the existing unused `ComponentTypeEnemy` tag (pure data: archetype,
  level, elite, boss, display name, home point, AI state, target, timers, last attacker).
- Ghoul and troll stat sheets at level 1 + level curve (HP/damage ×(1+0.12·(L−1)),
  defense/MR ×(1+0.05·(L−1))) as named constants in one file, together with the spawn constants.
- Population runs **once after the roster is placed** (after `AddPlayer` for every delver in
  `CreateGameSession`): party level = highest `StatsComponent.Level`; `floor` input defaulting
  to 1; level = party + 2×(floor−1) ± 1, ≥ 1; count uniform [8,14]; troll share
  0.25 + 0.10×(floor−1) capped 0.60; placement clear of walls/buildings/doors/containers/switch/
  escape door/other monsters and ≥ 350 px from every delver; bounded attempts, skip + warn.
- The hub is never populated.
- State broadcast gains `monsters[]` with `entity_id, archetype, name, level, elite, boss,
  position, facing, action, current_health, max_health` (snake_case), serializer + types +
  `FormatStateToClientState` reset alongside the other slices.

## Acceptance Criteria

- [ ] A new run holds 8–14 monsters, none overlapping map objects or each other, all ≥ 350 px from every delver.
- [ ] The hub never holds a monster (test the hub session and a hub after a run returns).
- [ ] Levels = highest party level + floor offset ± 1 (≥ 1); tests cover a mixed-level party and floor 3 via the input.
- [ ] Seeded population tests: troll share matches the configured probability on floors 1 and 3.
- [ ] HP/damage/defense/MR follow the level curve.
- [ ] Run state broadcast contains `monsters[]` with every field; hub broadcast does not.
- [ ] Placement exhaustion skips and logs, never overlaps.
- [ ] `make lint && make test` pass.

## Blocked By

None

## Spec Reference

FS-77AB6 §Requirements 18–22, 25, 32–33; §Edge States (empty roster, placement exhausted, mixed-level party, party level 1, single floor, hub); §Acceptance Criteria "Monsters" items 1–5; User Stories 1, 2, 10, 11, 13, 23, 28.

## TDD Approach

- RED: population test — given a roster with levels {3, 7} on floor 1, every monster level ∈ [6, 8] and count ∈ [8, 14].
- GREEN: population function with injected randomness; then placement-constraint and serializer tests.
