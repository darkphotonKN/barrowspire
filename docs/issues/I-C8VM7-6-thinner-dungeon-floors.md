---
id: I-C8VM7-6
status: open
implements: FS-KE075
blocked_by: []
labels: [ready-for-agent]
title: "Tunes FS-KE075 (for FS-C8VM7 §I): dungeon floors hold 30-45 monsters, the counts that make it up scaled about -35%"
---
Tunes FS-KE075

Values only, as FS-C8VM7 §I R49 names them; FS-KE075 §C names every tunable.

**Type:** AFK. **Hotspot:** `monster_tuning.go`, the "dungeon floor's population" const block
only. Change values, not names: I-C8VM7-4 reworks hall packs in `dungeon_population.go` and may
rename constants; whichever lands second rebases. May run alongside I-C8VM7-1.

## Files expected to touch

- `game-server/game-service/internal/game/monster_tuning.go` (`DungeonMonstersMin/Max` 45/70 → 30/45; `HallPackGhoulsMin/Max` 2/4 → 1/3; `RoomMonstersMax` 3 → 2; `RoomMonstersTopUpMax` 4 → 3; `CorridorMonstersMin/Max` 4/8 → 3/5; treasure guards unchanged)
- Tests whose expectations quote the old values: `internal/game/dungeon_population_test.go`, `dungeon_population_bench_test.go`, `floor_test.go` if any

## What to Build

The values above, and the tests that pin them. No rule changes: room structure, hall and
treasure rooms, the top-up and trim order, and every per-floor modifier stay as they are.

## Acceptance Criteria

- [ ] The constants hold R49's values; the treasure guard constants are unchanged.
- [ ] Across seeded floors each dungeon floor's total, bosses aside, is within 30-45 where the layout allows; hall packs have 1-3 members; ordinary rooms 0-2 (top-ups to 3); corridors 3-5.
- [ ] `make test` and `golangci-lint run` pass in game-service.

## Bounds

Never touch `internal/matchmaker` or `internal/match_queue`. No migrations, no HTTP contract
change, no kill or match stats.

## Blocked By

None

## Spec Reference

FS-C8VM7 §I R49 (values of FS-KE075 §C); user story 15; acceptance criteria "Server, the population tune".
