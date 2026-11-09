---
id: I-M8CSE-8
status: done
implements: FS-M8CSE
blocked_by: [I-M8CSE-7]
labels: [ready-for-agent]
title: "FS-M8CSE slice 8: Fabled is a flat roll for Spire kills, and fields lose it"
---
Implements FS-M8CSE §G

**Hotspot:** `loot_tuning.go`, `loot_roll.go`, one writer at a time. No migration: the `item_rarities`
row stays.

## Files owned

- `game-server/game-service/internal/game/loot_roll.go` (`rollDrop`, `rarityWeights`, `lootDrop`), `loot_roll_test.go`
- `game-server/game-service/internal/game/loot_tuning.go` (the rates; Daa'gon's 0.4% base)
- `game-server/game-service/internal/game/monster_drops.go` (`rollKillDrop` takes the chance), `monster_drops_test.go`
- `game-server/game-service/internal/game/field_drops.go` (passes no Fabled chance), `field_drops_test.go`
- `game-server/game-service/internal/game/chest_loot_test.go`, `dev_test_room_test.go`, only where they pin the DB weight

## What to Build

`rollDrop` tests a per-item Fabled chance on the drop before the type gates anything, and `rarityWeights`
always gives Fabled 0, so the DB weight no longer reaches any roll (R31). Kills get the chance per R32:
any boss 0.2% x factor, Daa'gon 0.4% base x factor (0.5%), elites on floors 6+ 0.1% x factor, every other
kill 0. A hit resolves to a unique or falls back to Runed (R34).

**Fields lose Fabled** (R33, a change to FS-X2F2H R31): a field kill and a field chest roll no Fabled
at all. **Field drop chances stay unchanged** (R30): only the Fabled source goes.

Chests take none yet: I-M8CSE-9 adds guarded treasure-room chests; until then no chest rolls Fabled.

## Acceptance Criteria

- [ ] With a DB Fabled weight of any size, `rarityWeights` gives Fabled 0.
- [ ] Rates match R32 at floors 1, 5, 6, 9 and 10 for a boss, Daa'gon and an elite. Ordinary monsters and tower monsters never roll Fabled.
- [ ] The rate holds on a would-be consumable.
- [ ] A hit with no eligible unique gives Runed.
- [ ] A field kill rolls no Fabled, and its drop chance is unchanged.
- [ ] `go test ./...` in game-service passes.

## Blocked By

I-M8CSE-7

## Spec Reference

FS-M8CSE §G R31-R34, R36; user stories 18, 19, 21.

## TDD Approach

- RED: a drop with Fabled chance 1 yields a unique before type; `rarityWeights` zeroes Fabled.
- GREEN: the flat roll at the top of `rollDrop`, and the rates at the kill consumer.
