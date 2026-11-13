---
id: I-C8VM7-1
status: open
implements: FS-C8VM7
blocked_by: []
labels: [ready-for-agent]
title: "FS-C8VM7 slice 1: the roster as data: tiers, families, 25 variants, goblin looks, their drop and experience rows"
---
Implements FS-C8VM7 §A (R1-R9), §E (R32-R33)

**Type:** AFK. **Hotspot:** `monster_tuning.go` (sheets, roster table, experience rows) and
`loot_tuning.go`. I-C8VM7-2, -3, -4, -5 and -6 touch `monster_tuning.go` after this one lands;
I-C8VM7-6 only its population const block, so it may run alongside.

## Files expected to touch

- `game-server/game-service/internal/components/monster.go` (the new archetype constants, goblin shield looks included)
- `game-server/game-service/internal/game/monster_tuning.go` (every variant sheet per R6-R8, the roster table: family, role, unlock tier, looks; `GoblinShieldShare`, `GoblinShieldDefense`; `killExperienceBase` rows per R33)
- `game-server/game-service/internal/game/monster_roster.go` (new: tier, family, role and variant types; `tierOf`; lookups by archetype; the step rule as a test helper or a builder)
- `game-server/game-service/internal/game/loot_tuning.go` (`MonsterDrops` rows per R32)
- Tests: `internal/game/monster_roster_test.go` (new), `kill_experience_test.go`, `monster_drops_test.go`, `monster_roll_test.go`

## What to Build

Every variant can exist, with its numbers, its family, its role and its unlock tier, and pays
the experience and drops R32-R33 give it. Nothing places a new variant yet (I-C8VM7-4) and no
ability exists yet (I-C8VM7-2).

- `tierOf(baseLevel)`: 1-5 → 1, 6-10 → 2, 11-15 → 3, 16-20 → 4, 21-25 → 5, 26+ → 6 (R1).
- The roster table of R3: 8 families with roles, 25 variants with archetype ids and unlock tiers.
  The five tier-1 variants are today's archetypes, unchanged.
- Sheets per R5-R7 at level 1 (the R6 table is the expected output of the step rule). New
  families' timings and radii per R7; old families' variants carry their step-0's timings,
  radii and shot.
- Goblin looks (R8): eight archetypes, a shield look = blade sheet with defence + 3, same name;
  the roster maps both looks to their variant, and a helper rolls a look at `GoblinShieldShare`.
- Experience rows per R33 (shield looks as their blade look) and drop rows per R32.
- Which family, role or look an archetype has is read from the table, never a switch on it (R9).

## Acceptance Criteria

- [ ] `tierOf` returns R1's buckets, including 6 for 26, 30 and 60.
- [ ] The roster has exactly R3's families, roles, variants, ids and unlock tiers; every tier
      unlocks at least one brute and two fodder.
- [ ] Every new sheet matches R6/R7 at level 1; each step beats the step below on HP, speed,
      damage and defence; every speed is below 200.
- [ ] No variant name contains an `ElitePrefixes` word; an elite of a new variant is named
      "<prefix> <variant name>".
- [ ] A shield look has its blade look's sheet with defence + 3, the same name, experience and
      drop row; the look roll gives shield at 0.5 on a seeded source.
- [ ] Each new variant's kill rolls its family's drop row and pays R33's base.
- [ ] Every existing test passes unchanged; `make test` and `golangci-lint run` pass in game-service.

## Bounds

Never touch `internal/matchmaker` or `internal/match_queue`. No migrations, no HTTP contract
change, no kill or match stats.

## Blocked By

None

## Spec Reference

FS-C8VM7 §A R1-R9, §E R32-R33; user stories 1, 4, 5, 6, 21, 22, 23, 27, 28; acceptance criteria "Server" 1-5, 21.

## TDD Approach

- RED: `tierOf` buckets; the roster's shape; a level-1 Ghast, Goblin and Dark Reaper's sheets; a shield look's defence; a Cave Troll's drop row and experience.
- GREEN: the constants, the roster table and sheets, the rows.
