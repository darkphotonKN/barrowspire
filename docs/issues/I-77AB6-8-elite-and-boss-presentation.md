---
id: I-77AB6-8
status: done
implements: FS-77AB6
blocked_by: [I-77AB6-7, I-77AB6-5]
labels: [ready-for-agent]
title: "FS-77AB6 slice 8: Elite markers and the demon placeholder"
---
Implements FS-77AB6 §Requirements (Client presentation 35, 38, 41)

**Domain:** game-client · **Touches `internal/game/session.go`:** no (client only). Appearance work: read `game-client/docs/design-guideline.md` first; tokens only (ADR-0013).

## What to Build

Make danger spikes legible.

- **Elite:** prefix rendered in the hostile accent, distinct from the base name; sprite carries a
  subtle tint or aura from the hostile (ember/oxblood) family — never amber, never arcane green,
  never neon. Choose tint vs aura against the 3:1 marker test.
- **Demon placeholder:** `archetype: demon` renders with the troll sheet, tinted into the hostile
  family, scaled ≥ 1.8× delver height, with its nameplate. Isolate it as a single
  archetype→sheet mapping entry so the real art is a one-line swap.
- Art dependency (record in PR): the real demon needs a design-guideline amendment — the
  guideline currently says "No demons". Do **not** edit the guideline in this slice.

## Acceptance Criteria

- [ ] Elites show a hostile-accent prefix and a hostile-family tint/aura; non-elites unchanged.
- [ ] A `demon` renders as the tinted ≥ 1.8× troll placeholder with `Demon · Lv N`.
- [ ] The demon mapping is one entry; swapping to a future `creature_demon_base` touches nothing else.
- [ ] Token fence passes; client tests pass.

## Blocked By

I-77AB6-7 (monster rendering), I-77AB6-5 (server emits elites and the demon; a fixture suffices for development)

## Spec Reference

FS-77AB6 §Requirements 35, 38, 41; §Dependencies (demon art, design-guideline conflict); §Acceptance Criteria "Client" rows 2–3; User Stories 9, 12, 29.

## TDD Approach

- RED: scene test — an `elite: true` ghoul's nameplate has a separate prefix text object in the hostile token colour.
- GREEN: elite nameplate + tint; then demon placeholder mapping test.
