---
id: I-M8CSE-5
status: done
implements: FS-M8CSE
blocked_by: [I-77AB6-18, I-Q14EV-3]
labels: [ready-for-agent]
title: "FS-M8CSE slice 5: Barrow Thrall and Spire Wraith join the Spire's mix"
---
Implements FS-M8CSE §D

**Hotspot:** `monster_tuning.go` and `loot_tuning.go`, one writer at a time. Starts only after the owner
has approved I-Q14EV-3's contact sheet.

## Files owned

- `game-server/game-service/internal/components/monster.go`
- `game-server/game-service/internal/game/monster_tuning.go` (two sheets, two XP rows, the mix shares)
- `game-server/game-service/internal/game/loot_tuning.go` (two `MonsterDrops` rows)
- `game-server/game-service/internal/game/monster_population.go` (`rollArchetype`)
- Tests: `internal/game/monster_population_test.go`, `monster_roll_test.go`, `monster_drops_test.go`, `kill_experience_test.go`
- `game-client/src/types/gameState.ts`
- `game-client/src/render/creatures/monsters.ts`, `monsters.test.ts`

## What to Build

Two new archetypes end to end.

- Server: `barrow_thrall`, `spire_wraith` (R21, charter default); sheets copied from the Forest's zombie and ghost with no field factor (R19, charter default); ghoul-row drops (R20); XP base 15 and 20 (R20, charter default).
- Mix: a rolled non-troll monster is 70% ghoul, 20% Barrow Thrall, 10% Spire Wraith on every Spire floor (R18, charter default). Troll share and hall packs stay as they are; treasure guards roll through it.
- Client: the archetypes on the type, and `MONSTER_LOOKS` rows for the two sheets from I-Q14EV-3 at the fodder tier.
- **`elitePlate` must read `_` in the archetype as a space** (R21). The charter default assumed it already does; it does not (`monsters.ts:293` looks for the raw archetype), so without this the plate shows no prefix. "Barrow-cursed Barrow Thrall" is accepted (R22, charter default).

## Acceptance Criteria

- [ ] Sample of non-troll rolls lands near 70/20/10; troll share and every hall pack are unchanged.
- [ ] Both archetypes carry the zombie's and ghost's sheet values, drop on the ghoul row's values, and give XP base 15 and 20.
- [ ] `elitePlate` gives prefix "Dread", rest "Barrow Thrall · Lv N" for archetype `barrow_thrall`; existing ghoul and troll rows pass.
- [ ] `go test ./...` in game-service and `npm test` in game-client pass.

## Blocked By

I-77AB6-18, I-Q14EV-3

## Spec Reference

FS-M8CSE §D R17-R22; user stories 12-14, 25.

## TDD Approach

- RED: `elitePlate` on a `barrow_thrall` elite; `rollArchetype` shares over a seeded sample.
- GREEN: the archetypes, rows and the plate's `_` read.
