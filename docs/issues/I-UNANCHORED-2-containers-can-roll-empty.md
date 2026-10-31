---
id: I-UNANCHORED-2
status: open              # open | in-progress | done
implements: none          # a fix, deliberately kept out of any FS (scope-it 2026-10-31); hand-coded, human lane
blocked_by: []
labels: []
title: Containers can roll empty (empty roll, then a count)
---
Implements: none. This is a **fix**, kept out of FS-1D6BX on purpose: the new kind and its
looks are the FS, but the roll's shape and rates are fixes and tweaks. Human lane (game-server).

## What to Build

Today every container holds something. `generateItemsAt`
(`game-server/game-service/internal/game/session.go`) always rolls `GenRandomBetween(2, 4)`
items, so a party can walk to every container and farm it. Loot should be earned.

Change the roll's shape to **an empty roll first, then a count**:

1. Roll whether the container is empty, at the kind's empty chance. If it is empty, return no items.
2. Otherwise roll a 1–N item count, at the kind's count range.
3. Split the count across types exactly as now: `weaponDropRate` / `armorDropRate` /
   `consumableDropRate` = 0.2 / 0.3 / 0.5. **The split is unchanged.**

Make the empty chance and the count range **per container kind** (two numbers per kind), so
FS-1D6BX's sack can roll lower than a chest. Put them as named tuning constants beside the other
loot tuning, not as literals in the roll.

The field roll (`fieldContainerRoll`, a Forest chest's) derives from this roll × `DropFactor`
and needs no change of its own. It inherits the empty roll.

The values themselves are I-UNANCHORED-3's. Until then, keep a chest's count range at 2–4 with
an empty chance of 0, so this lands behavior-preserving if done first.

## Acceptance Criteria

- [ ] A container roll can return zero items, at the kind's empty chance.
- [ ] A non-empty roll returns 1–N items, at the kind's range.
- [ ] The weapon/armor/consumable split is unchanged.
- [ ] Empty chance and count range are per-kind tuning constants.
- [ ] An empty chest still opens (`HasBeenOpened` set, item list empty), so the client shows an empty view rather than a refusal.
- [ ] Table-driven tests with an injected `lootRand` cover empty / non-empty / range bounds.

## Blocked By

Nothing.

## Spec Reference

Shape decided in FS-1D6BX §Scoping notes ("Alternatives rejected (roll shape)"). The sack's
roll in FS-1D6BX is blocked by this issue.
