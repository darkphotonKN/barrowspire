---
id: I-Q18Q3-4
status: open
implements: FS-Q18Q3
blocked_by: [I-Q18Q3-1, I-Q18Q3-3]
labels: [blocked]
title: "FS-Q18Q3 slice 4: the three-square ability bar over the XP bar in runs and fields; the card and the potion cell go (game-client)"
---
Implements FS-Q18Q3 §B, §C, §E (R22–R25, R27), §G, §H, §I, §J

## Files it expects to touch

- `game-client/src/ui/abilityBarLayout.ts`, `abilityBarLayout.test.ts` (new, pure: each square's
  rect, plaque, icon centre and cost slot for a view, from `xpBarFrame(view).piece.y`)
- `game-client/src/ui/abilityBar.ts`, `abilityBar.test.ts` (new, pure: the three squares' views from
  the state and the scene's context; `abilityGreyed`, `parryRefused` and `abilityCopy` move here from
  `abilityCard.ts`)
- `game-client/src/ui/AbilityBar.ts`, `AbilityBar.test.ts` (new widget: wells, plaques, cost
  numerals, icons through `knockout.ts` and `abilityIcons.ts`, the potion count; `relayout()`;
  `covers(x, y)`)
- deleted: `game-client/src/ui/AbilityHud.ts`, `AbilityHud.test.ts`, `abilityCard.ts`,
  `abilityCard.test.ts`, `PotionHud.ts`
- `game-client/src/ui/potions.ts`, `potions.test.ts` (`potionCell` → the potion square's view;
  `POTION_CELL_W`, `POTION_CELL_GAP` gone; `healthPotionCount` stays)
- `game-client/src/ui/hudCornerLayout.ts`, `hudCornerLayout.test.ts` (`ABILITY_CARD_PLACE` gone)
- `game-client/src/render/combat/playerCombat.ts` (the `parryRefused` import's new home)
- `game-client/src/ui/ProgressHud.ts`, `ProgressHud.test.ts` (the cue over the bar while it is up)
- `game-client/src/scenes/BarrowspireScene.ts`, `FieldScene.ts` and their `*.test.ts` (mount the bar
  from each state, `relayoutHud`, `panelTakes` takes presses on the bar, `POTION_HUD_X` gone)
- `game-client/src/scenes/runActions.ts` only if FS-04EEA's tree-ability action is not there yet:
  add that one entry (THREE, "3") under the name FS-04EEA's issue uses, binding nothing
- `game-client/docs/design-guideline.md` ("UI Chrome": the Ability bar bullet, the cue note on the
  Experience bar bullet, the corner-row note)

## What to Build

Replace the bottom-right ability card and the top-left potion cell with the ability bar: three 44 px
squares 10 apart, [1 potion] [right-click] [3], centred on `W / 2`, the cost slots' foot 6 px above
the XP piece's top. Each square is a HUD-panel well in a brass rim with its key plaque set into the
top edge ("1", the right-mouse glyph, "3", read from `RUN_ACTIONS`), its knockout icon, and its cost
numeral under it in the resource's channel colour. The right-click square greys by cost, by
`ability_cooldown.remaining > 0`, by the client lockout and by `parryRefused`, and is active (bright
rim, hover ink) while the archer holds Shadow Shot or the merc's stance is open. The potion square
shows the flask and the count in its corner, greyed at 0 with a faint "0" and always in a field. The 3
square shows the padlock and a faint "Lv 10" (one named constant) while `tree_ability_cooldown` is
absent; this slice draws only the locked state. Mount it in runs and fields from the first state;
down when out of the delve; never in the hub. Presses on a square are the bar's. The level-up cue
rises 6 px over the bar while it is up. Delete the card and the cell. Update the guideline.

## Acceptance Criteria

- [ ] FS-Q18Q3 §Acceptance Criteria, game-client: the layout criterion; the order and plaques; the
      ability squares' icon and cost numeral; the right-click square's greying; the active state;
      the potion square; the 3 square's **locked** half; a press starts nothing; the ESC menu and
      field menu keys; the worlds and the hide rules; the cue; no card; no potion cell and the
      clearance tests; resize and render scale; the older-server criterion; the guideline; tokens,
      typecheck, lint, fence and vitest.
- [ ] Headless captures at 1080 and 1280 of a run and a field, chat folded and unfolded, render scales
      1 and 2, checked by eye; a level-up cue captured over the bar.
- [ ] No dev-gallery card added.

## Blocked By

- I-Q18Q3-1 (`ability_cooldown` typed and on the wire; the greying reads it)
- I-Q18Q3-3 (the icons)

## Spec Reference

FS-Q18Q3 §B R8–R12, §C R13–R17, §E R22–R25 and R27, §G R29–R30, §H R31–R33, §I R34–R36, §J R37–R38;
User Stories 1–6, 9–15, 19–24.

## TDD Approach

- RED: `abilityBarLayout.test.ts` expects the row at x 464–616 at 1080 and 564–716 at 1280, its foot 6
  px above `xpBarFrame(view).piece.y`, and clear of `chatWindowFrame(...).panel` and
  `cornerRowLeft(view)` at every width between.
- GREEN: the layout function, then the pure views, then the widget and the scene mounts.
