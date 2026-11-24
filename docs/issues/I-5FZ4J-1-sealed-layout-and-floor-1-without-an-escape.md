---
id: I-5FZ4J-1
status: done
implements: FS-5FZ4J
blocked_by: []
labels: [ready-for-agent]
title: "FS-5FZ4J slice 1: the sealed layout (dead-end stairs, hidden-room shape, far escape door), no escape door on floor 1, 15-25 monsters"
---
Implements FS-5FZ4J §A, §D R21, §F R35–R36 (layout shape only)

**Hotspot:** `internal/levelgen` (the floor generator) and `internal/game/dungeon_floor.go`. One
writer at a time. Never touch `internal/matchmaker`, `internal/match_queue` or their wiring. No
migrations, no HTTP contract change. Code map: the shared notes folder's `code-map-game-service.md`.

## What to Build

The generator and the floor build learn the sealed shape, with no new entity yet:

- `levelgen`: a sealed parameter set (or flags on `DungeonParams`) that every Spire dungeon floor
  uses. The stairs room is a dead end entered by one corridor, the farthest such room by walk
  from the start (R2); the layout names its **gate cells** (one cell thick across that corridor's
  width at the stairs room's doorway, R4). Extra connections never touch the stairs room or a
  hidden room; the share drops to 0.1 (R3). The layout can carve **hidden rooms** of the same
  dead-end shape with their **secret door cells** (R36), as many as the caller asks for
  (R35's per-floor counts are drawn by the game, passed in). Validation (R8) proves, by flood fill
  with gate and secret-door cells shut, that the stairs room and every hidden room are unreachable
  and the escape door and switch rooms reachable; a failure retries as today.
- Roles: floor 1 has no switch and no escape door (R6); floors 2+ put the escape door in the far
  room farthest by walk from the stairs room, the switch among the remaining far rooms (R7).
  Neither is ever the stairs room or a hidden room.
- The floor build (`placeFixtures`/`layDungeon`) skips the escape door and switch on floor 1, and
  every code path that assumes they exist (the switch handler's `s.exitDoorEntityID`, the
  serializer, the end rule, the minimap feed) copes with their absence.
- `DungeonMonstersMin/Max` become 15/25 (R21).
- The 1 000-seed property test asserts R2–R8 and R36 on every seed (with 0, 1 and 2 hidden
  rooms asked for), and a Chasm-capable test (stairs room ≥ 6 deep × 5 wide) reports how often it
  is possible (needed by slice 6; no assertion beyond "the layout says whether it is").

The layout's new data (gate cells, hidden rooms and their door cells, whether the stairs room is
Chasm-capable) is server-only: the floor map is unchanged in this slice. Regenerate the dungeon
fixture the client reads (`node tools/fixtures/dungeon-fixture.mjs`) if the golden changes, and
update any golden test the new shape moves.

## Acceptance Criteria

- [ ] The property test asserts R2, R3, R4 (gate cells), R5 (no fixture in the stairs room), R7 and R36 for 1 000 seeds.
- [ ] A floor 1 build has no escape door and no switch entity; floors 2+ have both, the escape door's room the far room farthest from the stairs room.
- [ ] The switch, escape door and end-rule code paths run on a floor 1 with neither (tests).
- [ ] A sealed dungeon floor holds 15–25 monsters besides a boss.
- [ ] `make test` and `make check` green in game-service; the client fixture `--check` passes.

## Blocked By

None.

## Spec Reference

FS-5FZ4J §A R2–R8, §D R21, §F R35–R36 (shape only); the owning FSs' changes: FS-F6F88 (floor 1), FS-KE075 (stairs, loops, roles), FS-C8VM7 (count).

## TDD Approach

- RED: the property test asserting the stairs room is a dead end unreachable with its gate cells shut.
- GREEN: the leaf-room choice + extra-edge exclusion + gate cells in levelgen.
