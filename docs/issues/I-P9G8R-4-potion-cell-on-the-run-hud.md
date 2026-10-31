---
id: I-P9G8R-4
status: done
implements: FS-P9G8R
blocked_by: []
labels: [ready-for-agent]
title: "FS-P9G8R slice 4: the run HUD shows the health potions carried and the drink key"
---
Implements FS-P9G8R §C (Requirements 23–26, 31)

**Lane: agent** (game-client). Needs no server change: the count comes from the equipment the
state already broadcasts. Demoable on its own.

## What to Build

- **The single mapping** (R26): a small module naming the run's actions and their keys, starting
  with `drinkPotion` → Phaser `KeyCodes.ONE` and its display label `"1"`. Slice 5 binds it; this
  slice reads the label from it. Nothing else types "1" for the drink.
- **The count** (R23): a pure function from `current_player.equipment` to 0–3, counting slots
  `consumable_1..3` whose item has `healing_amount > 0` (FS R1; mana-only excluded). Put it beside
  `hudBars` in `src/ui/resources.ts` or in a new `src/ui/potions.ts`, unit-tested.
- **The cell** (R24, R25): a HUD piece (e.g. `src/ui/PotionHud.ts`, the `ResourceHud` pattern:
  scroll factor 0, HUD depth, redraws only on change) showing the `potion_health` icon (same art
  source as the gear overlay's icons), the count, and `[<label>]` from the mapping. Placed beside
  the `ResourceHud` panel, bottom-aligned with it, clear of the ability card and the leave button.
  At 0: dimmed, reads 0, still shown. Shown exactly when the resource bars are (in the delve),
  taken down with them. Styling per `game-client/docs/design-guideline.md` (neutral HUD).
- **Wired in `BarrowspireScene` only** (R31), next to `showResourceBars`. Not in the hub scene or
  `FieldScene`.

## Acceptance Criteria

- [ ] In a run the cell shows icon, count and `[1]` beside the Health / resource bars, and goes
      with them when the delver resolves.
- [ ] Count table test: empty slots → 0; three health potions → 3; health + mana + empty → 1;
      updated on each state.
- [ ] At 0 the cell is dimmed and reads 0.
- [ ] The `[1]` comes from the `drinkPotion` mapping.
- [ ] No cell in the hub or a field.
- [ ] Client tests, typecheck and lint pass.

## Blocked By

None.

## Spec Reference

FS-P9G8R §C Requirements 23–26, 31; §Acceptance Criteria "The potion cell and the key" (cell,
count, dimmed 0, mapping); §Edge States (empty, teammates, hub / field); User Stories 10–14,
27–29.

## Files expected

- `game-client/src/ui/potions.ts` (new, or an addition to `src/ui/resources.ts`) + test
- `game-client/src/ui/PotionHud.ts` (new)
- `game-client/src/scenes/runActions.ts` (new: the named action → key mapping; name is the implementer's)
- `game-client/src/scenes/BarrowspireScene.ts` (construct and feed the cell) **hotspot, shared with slice 5**

## TDD Approach

- RED: a unit test for the count function over equipment fixtures (health, mana, empty, all
  three).
- GREEN: the function, then the cell and its wiring, checked in the running client.
