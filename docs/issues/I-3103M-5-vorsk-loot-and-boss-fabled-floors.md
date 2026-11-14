---
id: I-3103M-5
status: done
implements: FS-3103M
blocked_by: [I-3103M-1, I-C8VM7-5]
labels: []
title: "FS-3103M slice 5: Vorsk's loot, and boss Fabled only on floors 6+"
---
Implements FS-3103M §G

Never touch `internal/matchmaker` or `internal/match_queue`. No migrations, no HTTP contract
change, no kill or match stats.

## Files expected

- `game-server/game-service/internal/game/loot_tuning.go` (`VorskMonsterDrop` 3-4 items on the boss row's source and split; `VorskFabledChance = 0.003`; `BossFabledMinFloor = 6`)
- `game-server/game-service/internal/game/monster_drops.go` (`monsterDropFor`: Vorsk's row ahead of the boss row; `fabledChanceFor`: the new table)
- Tests: `monster_drops_test.go`, `loot_roll_test.go` where they pin today's boss rates

## What to Build

A Vorsk kill (archetype `demon`) drops on its own row: always, 3-4 items, `lootSourceDemon`,
`demonDropSplit`, at the kill's level (R21). The Fabled chance per item becomes R22's table: Vorsk
0.3% x floor factor on any floor; Daa'gon unchanged; any other boss (champions, the blood demon)
0.2% x floor factor on floors 6+ and 0 on 1-5; elites and guarded chests unchanged. The floors-6+
threshold is one tunable beside `EliteFabledMinFloor`. Champions are bosses (`Boss: true`), so the
rule covers them without naming them.

## Acceptance Criteria

- [ ] A Vorsk kill always drops 3 or 4 items, source and split the boss row's; a blood demon kill still drops 2 or 3.
- [ ] `fabledChanceFor`: Vorsk 0.003 x floor factor on floors 1 and 9; Daa'gon 0.004 x floor factor; a blood demon 0 on floors 1-5 and 0.002 x floor factor on 6-9; an elite unchanged.
- [ ] `make test` (and `make lint`, `make check`) green in game-service.

## Blocked By

I-3103M-1, and cross-item **FS-C8VM7's champion-bosses issue** (not sliced when this was written):
until the champion takes the top floor, the top floor's guaranteed `demon` would drop as Vorsk.
Swap the `blocked` label for `ready-for-agent` once both land.

## Spec Reference

FS-3103M §G R21-R22; user stories 11-13.

## TDD Approach

- RED: `fabledChanceFor` of a blood demon kill on floor 3 is 0.
- GREEN: the floor gate on the boss case, then Vorsk's case and row.
