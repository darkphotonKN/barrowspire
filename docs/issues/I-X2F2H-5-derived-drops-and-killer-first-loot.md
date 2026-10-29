---
id: I-X2F2H-5
status: done
implements: FS-X2F2H
blocked_by: [I-X2F2H-3]
labels: [blocked]
title: "FS-X2F2H slice 5: field drops derived live from the Spire's table, killer-first for 30 s, gone after 120 s (game-service + game-client)"
---
Implements FS-X2F2H §D (Requirements 31–35), §E (Requirement 36), §H (Requirements 59–60)

**Author: agent.** This is FS-X2F2H's **derived-drop-rate** slice: FS-3QHQZ's I-3QHQZ-4
(clearing chests) uses the container rule made here.

## What to Build

**game-service**

1. **One source of truth** (FS §D R31): no field drop table. A field creature names the Spire row
   it drops as (the boar: `MonsterDrops[ghoul]`; any field elite: `EliteMonsterDrop`). At roll
   time the field reads that row live and uses `row.Chance × place.DropFactor` (Meadows 0.35);
   count, type split, rarity source and item level (the kill's level) from the same row,
   unchanged. Implement as the field's kill-drop consumer beside `monsterDrops`, sharing
   `pickItemType` and `dropLoot`.
2. **Containers** (FS §D R32): one function, beside the monster rule, for a field container's
   roll: the Spire's chest roll (`generateItems`, its `weaponDropRate` / `armorDropRate` /
   `consumableDropRate` split) with each rolled item kept with probability `place.DropFactor`.
   The Meadows has no containers; the function is tested on its own for FS-3QHQZ.
3. **Killer-first window** (FS §D R33): a field drop pile records the killer and the time it
   landed. For 30 s anyone else's pickup from it is refused with reason `loot_reserved` and the
   item stays; after, anyone in range. The window runs whether or not the killer is still there.
4. **Pile lifetime** (FS §D R34): a field pile is removed 120 s after landing with what it holds;
   an emptied pile at once. Run piles unchanged.
5. **Broadcast** (FS §D R35): a field pile carries `reserved_for` (the killer's member id) while
   its window is open, and nothing after; run piles never carry it.
6. Timings (30 s, 120 s) and the drop factor are constants with the field tuning (FS §E R36).

**game-client**

7. A pile with `reserved_for` set to someone else draws dimmed and offers no pickup; a click on
   its item shows the `loot_reserved` copy. A pile reserved for me, or open, draws as a run's
   (FS §H R59–R60). Add `reserved_for?` to the container state type.

## Acceptance Criteria

- [ ] With a seeded RNG, a field boar kill drops at `MonsterDrops[ghoul].Chance × 0.35`; changing the ghoul row's `Chance` in the test changes the field's rate with no field edit; an elite boar uses `EliteMonsterDrop.Chance × 0.35`.
- [ ] No field-specific drop table or copied chance exists in the code (reviewer check, plus a test that reads the Spire rows by reference).
- [ ] The container rule keeps each chest-rolled item with probability 0.35 for the Meadows' factor (seeded test).
- [ ] Another player's pickup is refused `loot_reserved` for 30 s and succeeds after; the killer's succeeds at once.
- [ ] A field pile is gone 120 s after landing; an emptied one at once; a run's pile is unchanged.
- [ ] `reserved_for` is in a field pile's state only during the window; absent from run piles.
- [ ] Client: someone else's reserved pile is dimmed and not pickable; mine and open piles behave as in runs.
- [ ] `go test ./...`, `golangci-lint run`, `npm test`, lint: no new failures versus the branch point.

## Files expected to touch

- `game-server/game-service/internal/game/field_drops.go` (new: field kill drops, container rule) and test
- `game-server/game-service/internal/game/loot_tuning.go` (only a doc note that field drops derive from these rows; no new rows)
- `game-server/game-service/internal/components/container.go` (killer and landed-at on a drop pile, pure data)
- `game-server/game-service/internal/game/factory.go` (`CreateDropPileEntity` variant for fields)
- `game-server/game-service/internal/game/session.go` (pickup check, pile expiry on the field tick, subscribe the field drop consumer)
- `game-server/game-service/internal/types/game.go`, `internal/serializer/state_serializer.go` (`reserved_for`)
- `game-client/src/types/gameState.ts`, `src/render/world/dropPile.ts`, `dropPile.test.ts`, `src/scenes/FieldScene.ts`

## Blocked By

- I-X2F2H-3: field kills to drop from.

## Spec Reference

FS-X2F2H §D R31–R35; §E R36; §H R59–R60; User Stories 11, 12, 15, 16, 27; Acceptance Criteria
16, 18, 24; Edge States "Killer leaves before the window ends", "Two players pick up the same
item in one tick"; Decision log D13, D17, D23, D25.

## TDD Approach

- RED: field drop chance read through the Spire row (mutate the row in-test).
- RED: reserved pickup refusal, then success after 30 s (injected clock).
- RED: pile expiry at 120 s.
- GREEN: consumer, pile data, pickup check, serializer.
