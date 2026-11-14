---
id: I-C8VM7-4
status: done
implements: FS-C8VM7
blocked_by: [I-C8VM7-1]
labels: []
title: "FS-C8VM7 slice 4: each Spire floor draws a pool of five and spawns only from it; the floor map names the pool"
---
Implements FS-C8VM7 §C (R19-R25), §G (R40)

**Type:** AFK. **Hotspot:** `monster_population.go`, `dungeon_population.go`, `monster_tuning.go`
(pool constants; retiring `spireNonTrollMix`; renaming the troll share to the brute share).
I-C8VM7-5 extends `monster_population.go` and `dungeon_population.go` after this lands.
I-C8VM7-6 changes only population values in `monster_tuning.go`; whichever lands second rebases
(do not rename `HallPackGhoulsMin/Max` here unless I-C8VM7-6 has landed, or coordinate).
FS-3103M's slices also edit `rollDemon` in `monster_population.go`; this slice does not touch it.

## Files expected to touch

- `game-server/game-service/internal/game/floor_pool.go` (new: the weighted, role-guaranteed draw, R19-R20; the pool's brutes, fodder and ranged; the Dark Warrior cap pass, R24)
- `game-server/game-service/internal/game/monster_tuning.go` (`FloorPoolSize` 5, `DarkWarriorPoolWeight` 2, `DarkWarriorPer` 12, `DarkWarriorCapMax` 4; brute share; `spireNonTrollMix` removed)
- `game-server/game-service/internal/game/monster_population.go` (`rollArchetype`/`rollMonster` draw from the pool, R21; the floor's base level and tier)
- `game-server/game-service/internal/game/dungeon_population.go` (hall pack: pool brute + pool fodder, archer slot to a ranged member, R22-R23; guards from the pool; the cap pass after `holdTotal`)
- `game-server/game-service/internal/game/session.go` (holds the current floor's pool after `populateMonsters`)
- `game-server/game-service/internal/game/floor_map.go` (`enemy_pool` on a dungeon floor's map, R40)
- Tests: `internal/game/floor_pool_test.go` (new), `dungeon_population_test.go`, `monster_population_test.go`, `monster_roll_test.go`, `floor_map_test.go`

## What to Build

- R19-R20: at build, a floor's base level gives its tier; draw 5 distinct unlocked variants
  (all of them when 5 or fewer), the guaranteed brute then two fodder first, then the rest, each
  draw weighted (Dark Warrior family × 2).
- R21: a rolled monster is a pool brute at the brute share (today's troll curve), else a pool
  fodder, uniform within the role; level and elite as today; a goblin rolls its look after.
- R22: archer slots (ordinary-room fodder at `BoneArcherRoomShare`; a hall pack's first
  `HallPackBoneArchers` fodder) take a uniform pool ranged member, or stay fodder with none.
- R23: hall packs lead with a pool brute; treasure guards are rolled monsters, all elite.
- R24: after `holdTotal`, excess Dark Warriors over min(4, ⌊n / 12⌋) are redrawn as another
  pool brute, else fodder, keeping position, level and elite.
- R40: the dungeon floor map lists every archetype the pool can spawn (both looks of a goblin
  variant), never a boss.

## Acceptance Criteria

- [ ] A floor's pool has 5 distinct variants unlocked at its tier (all 5 at tier 1), at least one brute and two fodder; across many seeded draws every unlocked variant appears, and a Dark Warrior variant about twice as often as a weight-1 one.
- [ ] Every standard monster on a floor is a pool variant; brutes appear at the floor's brute share; `spireNonTrollMix` is gone.
- [ ] With a ranged member, room fodder turns ranged at `BoneArcherRoomShare` and each hall pack's first fodder is ranged; with none, no monster on the floor is ranged.
- [ ] Hall packs are a pool brute plus pool fodder; treasure guards are pool variants, all elite.
- [ ] No floor holds more Dark Warriors than min(4, ⌊n / 12⌋).
- [ ] An elite variant's name stacks as "<prefix> <variant name>".
- [ ] The floor map's `enemy_pool` lists exactly the pool's archetypes and no boss.
- [ ] `make test` and `golangci-lint run` pass in game-service.

## Bounds

Never touch `internal/matchmaker` or `internal/match_queue`. No migrations, no HTTP contract
change (`enemy_pool` is a WebSocket field), no kill or match stats.

## Blocked By

I-C8VM7-1

## Spec Reference

FS-C8VM7 §C R19-R25, §G R40; §Edge States (tier-1 pool, tier boundary, no ranged member, Dark Warrior as the only brute); user stories 2, 3, 8, 13, 14, 26, 31; acceptance criteria "Server" 13-17, 22.

## TDD Approach

- RED: a seeded tier-1 floor's pool is the five tier-1 variants; a tier-6 pool always holds a brute and two fodder; no floor exceeds the Dark Warrior cap.
- GREEN: `floor_pool.go`, then the population reading it, then the floor map field.
