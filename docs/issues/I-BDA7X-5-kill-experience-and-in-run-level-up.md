---
id: I-BDA7X-5
status: done
implements: FS-BDA7X
blocked_by: [I-BDA7X-4, I-77AB6-3]
labels: [ready-for-agent]
title: "FS-BDA7X slice 5: Kill experience for the party and immediate in-run level-up"
---
Implements FS-BDA7X §Requirements (Kill experience 9–13; Experience and levels 8; Level-up in a run 16–17, 19–20)

**Domain:** game-service · **Touches `internal/game/session.go`:** yes (system registration in `InitialSystems`; the per-run experience tally lives on `Session`) · **Lane:** backend human lane by default; agent-ready if handed to `/develop`.

## What to Build

Monsters dying to players feed every living party member, and levels land mid-fight.

- Consume FS-77AB6's kill record (killer member id, monster level, archetype, elite flag, boss
  flag; subscription mechanism settled by I-77AB6-3). On a kill with a player killer, every
  party member that is alive (HP > 0) and not escaped gains `round(base × (1 + 0.15 × (monsterLevel − 1)) × mult)`, mult 3 elite / 10 demon /
  1 otherwise. Base XP table owned here (FS R11): ghoul 10, troll 25, demon 25.
- Keep a per-run experience tally **outside the player entity** (keyed by member, with character
  id), so slice 6 can report players removed before the end (R23).
- Apply experience to `StatsComponent.Experience`; when it crosses thresholds (shared table),
  level up in the same tick, applying R19 growth once per level; max HP/MP grow, current HP/MP do
  not. Cap at 20; experience keeps accumulating.
- No experience in the HUB world, from containers, or from escape.

ECS rules: components stay pure data; the award/level-up logic is a system.

## Acceptance Criteria

- [ ] A level-1 ghoul kill gives each living, un-escaped member 10; an elite troll at level 3
      gives `round(25 × 1.3 × 3)` = 98; the demon at level 1 gives 250.
- [ ] Dead and escaped members get nothing for that kill but keep prior experience.
- [ ] A kill crossing two thresholds raises level by two with growth applied twice; current HP/MP
      unchanged.
- [ ] Level never exceeds 20.
- [ ] Table-driven system tests; existing session tests green.

## Blocked By

I-BDA7X-4 (seated level/experience); I-77AB6-3 (FS-77AB6's kill record — monsters can be slain,
exactly one record per kill). Elite and demon multipliers are only exercised once I-77AB6-5 lands;
test them with constructed kill records meanwhile.

## Spec Reference

FS-BDA7X §Requirements 8–13, 16–17, 19–20; §Acceptance Criteria "Experience and level-up"
(award, level-up, cap rows); §Edge States "Monster killed by several players", "Kill on the same
tick the player dies", "Demon kill at low level", "At the cap". User Stories 8–15, 18.

## TDD Approach

- RED: a death event with a player killer awards two living members 10 each, a dead one 0.
- GREEN: progression system subscribed to the death event.
