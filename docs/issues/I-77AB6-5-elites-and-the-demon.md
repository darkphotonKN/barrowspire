---
id: I-77AB6-5
status: done
implements: FS-77AB6
blocked_by: [I-77AB6-2]
labels: [ready-for-agent]
title: "FS-77AB6 slice 5: Elite promotion and the demon boss spawn"
---
Implements FS-77AB6 §Requirements (Monsters 19, 21, 23–25; State protocol 32)

**Domain:** game-service · **Touches `internal/game/session.go`:** no (population file + constants from slice 2; add an `is top floor` input beside `floor`). Backend is the human lane per root CLAUDE.md; this slice is sized for `/develop` at the owner's request.

## What to Build

Rare, visible spikes of danger.

- **Elite roll** per standard monster at spawn: 0.03 + 0.02×(floor−1), cap 0.25. Elite = ×2.5 HP,
  ×1.5 damage, stats-only; display name prefixed from the authored list (Dread, Grave-sworn,
  Hollow, Barrow-cursed). `elite: true` in state. The demon is never elite.
- **Demon archetype**: stat sheet (HP 1200, dmg 28, 1.6 s interval, 0.8 s wind-up, 75 px range,
  speed 120, def 15, MR 15, aggro 320, leash 700), level = party + offset + 2 (no spread),
  display name "Demon", `boss: true`.
- **Demon spawn rule**: exactly one when `is top floor` (input, false until FS-F6F88); otherwise
  0.01 per floor. In addition to the standard count; placed at the farthest valid position from
  the delvers among a bounded sample. On a guaranteed demon, relax the delver exclusion before
  giving up — never skip it silently.
- All rates remain named constants in the one spawn file so a developer can force an elite or a
  demon locally.

No client art dependency: the demon is fully real server-side.

## Acceptance Criteria

- [ ] Seeded tests: elite rate and demon rate match configured probabilities on floors 1 and 3.
- [ ] `is top floor = true` always yields exactly one demon; never more than one per floor.
- [ ] Elites have ×2.5 HP / ×1.5 damage over their base at level and a prefixed name; demon never elite.
- [ ] Demon level = party + offset + 2; it uses the generic AI and combat paths unchanged.
- [ ] State carries `elite` / `boss` / `name` correctly.
- [ ] `make lint && make test` pass.

## Blocked By

I-77AB6-2 (population and monster component)

## Spec Reference

FS-77AB6 §Requirements 19 (demon row), 21 (demon level), 23–25, 32; §Edge States (placement exhausted for a guaranteed demon, single floor); §Acceptance Criteria "Monsters" (elite/demon rows); User Stories 9, 11, 12, 28, 29.

## TDD Approach

- RED: population with `is top floor = true` has exactly one `boss` monster at party+offset+2.
- GREEN: demon spawn rule; then elite-roll distribution test with a fixed seed.
