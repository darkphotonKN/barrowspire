---
id: I-3QHQZ-9
status: open
implements: FS-3QHQZ
blocked_by: []
labels: [ready-for-agent]
title: "FS-3QHQZ slice 9: the Forest's trail spawn points roll elite at the Meadows' chance"
---
Implements FS-3QHQZ §Change: Elites on the Forest's trail

**Lane: game-server (game-service only).** The Forest's standard (trail) spawn points stop being
never-elite and roll elite exactly as the Meadows' points do: the Spire's floor-1 chance, read
live from `eliteChance(1)`. The clearings, the Meadows and the client are unchanged. A one-line
behavior change in the place data, the rest is tests.

## Files expected to touch

- `game-server/game-service/internal/game/forest_map.go`: `ForlornForest`'s `StandardElites`
  becomes `FieldEliteRolled` (or is left unset, the zero value), and its comment ("trail points
  never hold an elite") is corrected.
- `game-server/game-service/internal/game/forest_population_test.go`:
  `TestForlornForest` place assertions (`FieldEliteNever` → the rolled rule) and
  `TestForestSpawns_GhostShareAndEliteRule` (the `require.False(t, m.Elite, ...)` line becomes an
  elite-share check). **Do not touch the band assertions there** (`ForestMinLevel` / `ForestMaxLevel`
  literals 4 and 9): they belong to I-X2F2H-11.
- `game-server/game-service/internal/game/field_place.go`: comments only, where they say the
  never rule is "the Forest's trail points". Whether `FieldEliteNever` stays (tests use it) is the
  implementer's call; no place uses it after this slice.

Not touched: `field_population.go`'s roll path (R32: one roll path, no Forest-only chance),
`monster_tuning.go`, any game-client file, `internal/matchmaker`, `internal/match_queue`, any
migration or HTTP contract. Sibling FS-C8VM7, FS-3103M and FS-BDRTJ files are not touched.

## What to Build

1. The Forest's place states the rolled elite rule for its standard points, the Meadows' rule
   (R31, R32, D1).
2. Trail elites are named from `ElitePrefixes` and take the elite multipliers on top of the
   field factor through the existing path (R33, D2); nothing new is written for that.
3. The clearings' elite points and the chest/elite assignment are unchanged (R34); the Meadows
   are unchanged (R35).

## Acceptance Criteria

- [ ] The Forest's place states the rolled elite rule for its standard spawn points, the same rule as the Meadows'.
- [ ] Over many seeded rolls of a Forest trail point, the elite share is `eliteChance(1)` within tolerance; every elite carries an `ElitePrefixes` prefix and every non-elite has no name.
- [ ] Over the same rolls, ghosts are still 1/12 of spawns within tolerance and every level is inside the Forest band (asserted through `place.MinLevel` / `place.MaxLevel`, not literals).
- [ ] A trail elite's stats are the field-factored sheet at its level with the elite multipliers on top, the same as a clearing elite's of that archetype and level.
- [ ] A built Forest refilled many times holds, on its trail points, both elites and non-elites; every clearing elite point still holds an elite each time it refills.
- [ ] The main trail's dead end still holds an elite spawn point, and the chest/elite assignment for a fixed seed is unchanged.
- [ ] The Meadows' rolls are unchanged: same rule, same elite share.
- [ ] No message, endpoint, RPC or migration is added; `internal/matchmaker` and `internal/match_queue` are untouched; no game-client file changes.
- [ ] `make test` (and `make lint`, `make check`) green in `game-server/game-service`.

Out of slice: the section's live check (walk the trail over a few respawns, see an elite zombie
or ghost away from the clearings), the owner's.

## Blocked By

None.

## Spec Reference

FS-3QHQZ §Change: Elites on the Forest's trail: Requirements 31–36, decisions L1–L4 and D1–D3,
every Edge State. Reuses FS-X2F2H Requirements 28, 29, 31 unchanged.

## TDD Approach

- RED: in `TestForestSpawns_GhostShareAndEliteRule`, assert the trail's elite share is
  `eliteChance(1)` within 0.01 over the existing 24 000 rolls, each elite prefixed: fails, the
  place is `FieldEliteNever`.
- GREEN: `ForlornForest`'s `StandardElites` → `FieldEliteRolled`. Then a refill test over a built
  Forest (trail points see both, clearing points always elite), which should pass at once and
  pins R34.
