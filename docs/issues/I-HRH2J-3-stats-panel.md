---
id: I-HRH2J-3
status: done
implements: FS-HRH2J
blocked_by: [I-HRH2J-2]
labels: [ready-for-agent]
title: "FS-HRH2J slice 3: the stats panel (class, level, XP bar, resources, class and gear stats)"
---
Implements FS-HRH2J §C Requirements 24–30

**Author: agent**

## What to Build

The overlay's left panel shows the character's stats from the world state, live, with no new
fetch: class display name, character name, level and an XP bar; health and class resource; the
class card's base numbers; and the summed stats of worn gear.

- Data: the player's own `PlayerState` (`src/types/gameState.ts`) from the latest state, the
  worn items the overlay already holds, and `CLASS_LORE[class]` (`src/data/classLore.ts`) for the
  display name and base stats (R28: `PlayerState` has no base stats; the static card is the v1
  source, still no fetch).
- XP bar via `xpFraction` / `atCap` (`src/ui/progress.ts`); "Max level" at the cap; level 1 /
  empty bar when absent (R26).
- Health and resource rows (R27), resource named as the resource bars name it; absent fields hide
  their row.
- "From gear": sum attack power, critical rate, defence rating, magic resistance and each affix
  `stat` over worn items, worded as `src/items/itemLines.ts` words them; no combined derived total
  (R29).
- Re-renders on each state while open (R30).
- Keep the stat-summing and row-building pure (no Phaser), so it is unit-tested without a canvas.

## Acceptance Criteria

- [ ] Left panel shows class display name, character name, level and an XP bar in a run and a field world.
- [ ] XP bar fill matches `xpFraction`; at the cap the bar is full with "Max level"; with no level fields, level 1 and empty.
- [ ] Health and class resource rows show `current / max`; an absent field hides its row.
- [ ] "Class" lists the class card numbers; "From gear" lists only stats worn items carry, summed (incl. affixes by stat).
- [ ] The panel updates while open when health, resource, XP, level or worn gear change.
- [ ] No network request is made by the panel.
- [ ] Pure unit tests for the summing and row model; client test suite passes.

## Blocked By

I-HRH2J-2 (the overlay and its left-panel placeholder)

## Spec Reference

FS-HRH2J §C R24–30; User Stories 17–20; Edge States "Empty bag / nothing worn", "Hub with no
`resource` or `current_health`", "Level fields absent".

## Files expected

- a new `game-client/src/ui/` stats module (pure model + its `.test.ts`) and the overlay's left
  panel drawing
- `game-client/src/ui/progress.ts`, `game-client/src/items/itemLines.ts`, `game-client/src/data/classLore.ts` (read/reuse)
- `game-client/src/scenes/BarrowspireScene.ts`, `game-client/src/scenes/FieldScene.ts` (feed the player's state to the overlay)

## TDD Approach

- RED: gear sum over two worn items with overlapping affix stats → one summed line per stat.
- GREEN: the pure stats model; then the panel draws its rows.
