---
id: I-3QHQZ-3
status: open
implements: FS-3QHQZ
blocked_by: [I-3QHQZ-2]
labels: [ready-for-agent, blocked]
title: "FS-3QHQZ slice 3: zombie and ghost archetypes, clearing assignment and the Forest's spawn points"
---
Implements FS-3QHQZ §B (Requirements 15–18)

Agent lane. **Also blocked by FS-X2F2H's field monster issue**: the slice that spawns a field's
monsters at fixed spawn points, respawns them after 45 s, levels them by the field's band, and
applies the field stat factor, kill credit and killer-first loot. Id not minted yet; add it to
`blocked_by` once FS-X2F2H is sliced. This issue supplies the Forest's spawn points and roster
through that path and does not re-implement respawn, banding, factors or credit.

## Files expected to touch

- `game-server/game-service/internal/components/monster.go`: `MonsterArchetypeZombie`,
  `MonsterArchetypeGhost`.
- `game-server/game-service/internal/game/monster_tuning.go`: zombie and ghost rows in
  `monsterSheets` and `killExperienceBase`; Forest constants (standard spawn points 18–24,
  entrance exclusion 400 px, ghost share 1/12).
- `game-server/game-service/internal/game/forest_map.go` and its test: clearing assignment and
  spawn points from the slice-2 layout.
- `game-server/game-service/internal/game/forest_population.go` (new) and its test: the
  per-spawn and per-respawn archetype roll and elite flag, fed to FS-X2F2H's field spawn path.

## What to Build

1. Two archetypes with the starting sheets in FS-3QHQZ R18 and kill-XP bases 15 (zombie) and 20
   (ghost). The Spire's `rollMonsters` / `trollShare` never roll them.
2. Clearing assignment from a source derived from the boot seed: the main trail's dead end is an
   elite; every other dead end is an elite or a chest, 50/50, with at least one chest when there
   are two or more dead ends.
3. Spawn points: 18–24 standard (seeded) on open trail cells, ≥ 400 px from the entrance, ≥
   `MonsterSpacing` apart, never in a clearing; one elite spawn point at each elite clearing's
   centre. An unplaceable one is skipped and logged.
4. At each spawn and respawn: ghost with probability 1/12, otherwise zombie. Standard points are
   never elite; elite points always are, with an `ElitePrefixes` name and the Spire elite
   multipliers on top of the field factor. Level from FS-X2F2H's Forest band (4–9).

## Acceptance Criteria

- [ ] `zombie` and `ghost` sheets and XP rows exist with R18's values; the Spire population never yields them.
- [ ] Same boot seed → same clearing assignment and spawn points; the main dead end is always elite; at least one chest when there are two or more dead ends.
- [ ] 18–24 standard spawn points, all on open cells, ≥ 400 px from the entrance, ≥ `MonsterSpacing` apart, none in a clearing.
- [ ] With an injected rand over many rolls, the ghost share is 1/12 within tolerance; standard spawns never elite; elite spawns always elite with a prefix.
- [ ] A Forest elite's HP and damage equal its field-factored stats × `EliteHPMultiplier` / `EliteDamageMultiplier`.
- [ ] Killing a zombie or ghost grants kill XP per FS-BDA7X with the new rows.
- [ ] `go test ./...` and `golangci-lint run` green in game-service.

## Blocked By

- I-3QHQZ-2 (the Forest world and its layout)
- FS-X2F2H field monster issue (id pending; see above)

## Spec Reference

FS-3QHQZ §B Requirements 15–18; Acceptance Criteria "Forest world (§B)" items 5–8; Edge States
"Spawn point cannot be placed", "Empty forest", "No dead end but the main trail's"; User Stories
5, 6, 9–12.

## TDD Approach

- RED: a table test of zombie and ghost stats at level 1; a seeded test that the main dead end is
  always elite.
- GREEN: sheet rows, assignment, spawn-point selection, the roll.
