---
id: I-Q18Q3-4
status: done
implements: FS-Q18Q3
blocked_by: [I-Q18Q3-1, I-Q18Q3-3]
labels: [blocked]
title: "FS-Q18Q3 slice 4: the three-square ability bar over the XP bar in runs and fields, drawn by the UI scene; the card and the potion cell go (game-client)"
---
Implements FS-Q18Q3 §B, §C, §E (R22–R25, R27), §G, §H, §I, §J, §L

> **Integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream.** The bar
> is a UI-scene HUD-slot piece fed plain data through the UI bridge (FS-Q18Q3 §L R40–R44), not a
> piece each world scene draws. The files and the build below are rewritten for that; the
> behaviour the player sees is unchanged.

## Files it expects to touch

- `game-client/src/ui/abilityBarLayout.ts`, `abilityBarLayout.test.ts` (new, pure: each square's
  rect, plaque, icon centre and cost slot for a view, from `xpBarFrame(view).piece.y`; the bar's top
  for the cue)
- `game-client/src/ui/abilityBar.ts`, `abilityBar.test.ts` (new, pure, world side: the bar's view
  from the state and the world's context, plain data only (R40); `abilityGreyed`, `parryRefused` and
  `abilityCopy` move here from `abilityCard.ts`)
- `game-client/src/ui/AbilityBar.ts`, `AbilityBar.test.ts` (new UI-scene piece: wells, plaques, cost
  numerals, icons through `knockout.ts` (`BRONZE`, `GREYED`, `GREYED_ALPHA`, `stroke()`) and
  `abilityIcons.ts`, the potion count; a `uiGround` over each square; `show`, `relayout`, `destroy`
  as a `HudPiece`; its top for the cue)
- `game-client/src/ui/uiSceneHud.ts`, `uiSceneHud.test.ts`, `uiSceneHud.standin.ts` (the `bar`
  `HudMessage` kind in, `ability` and `potion` out; `HUD_PLACES.run` / `.field` give the bar a
  place, none in `hub`, and lose the card's and the cell's; the slot tells the level bar the bar's
  top while it stands)
- `game-client/src/ui/hudPieces.ts`, `hudPieces.test.ts` (`bar` builder in; `ability` and `potion`
  builders out)
- deleted: `game-client/src/ui/AbilityHud.ts`, `AbilityHud.test.ts`, `abilityCard.ts`,
  `abilityCard.test.ts`, `PotionHud.ts`
- `game-client/src/ui/potions.ts`, `potions.test.ts` (`potionCell` → the potion square's part of the
  bar's view; `POTION_CELL_W`, `POTION_CELL_GAP` gone; `runOwnHud` holds the bars and the bar's held view, no cell;
  `healthPotionCount` stays)
- `game-client/src/ui/hudCornerLayout.ts`, `hudCornerLayout.test.ts` (`ABILITY_CARD_PLACE` and
  `ABILITY_CARD_H` kept only as `controlsBadgeFrame`'s anchor, renamed for the badge if they lose
  their card meaning; the badge's rect unchanged, R42)
- `game-client/src/ui/uiBridge.ts`, `uiBridge.test.ts`, `game-client/src/ui/uiSceneControlsBadge.ts`,
  `uiSceneControlsBadge.test.ts` (the run's `abilityCard(up)` report means "the bar is up"; rename if
  wished, one meaning; the badge stands exactly while the bar is up and live, not held, and the run
  has not ended, so it still goes at death)
- `game-client/src/render/combat/playerCombat.ts` (the `parryRefused` import's new home)
- `game-client/src/ui/ProgressHud.ts`, `ProgressHud.test.ts` (the cue over the bar while it is up,
  told by the slot)
- `game-client/src/scenes/BarrowspireScene.ts`, `FieldScene.ts` and their `*.test.ts` (send
  `this.ui.hud({ world, kind: "bar", bar })` on every state and as the lockout or hold starts or
  ends; the held view (every square greyed, the potion count and costs as the resolving state
  showed) with the held bars once out of the delve (`runOwnHud`); null when the bars go down; stop
  sending `ability` and `potion`; no rect test, no key bound
  for the bar)
- `game-client/src/scenes/runActions.ts` only if FS-04EEA's tree-ability action is not there yet:
  add that one entry (THREE, "3") under the name FS-04EEA's issue uses, binding nothing
- `game-client/docs/design-guideline.md` ("UI Chrome": the Ability bar bullet, the cue note on the
  Experience bar bullet, the corner-row note)

## What to Build

Replace the bottom-right ability card and the top-left potion cell with the ability bar: three 44 px
squares 10 apart, [1 potion] [right-click] [3], centred on `W / 2`, the cost slots' foot 6 px above
the XP piece's top, at depth 1000 on the UI scene. Each square is a HUD-panel well in a brass rim with
its key plaque set into the top edge ("1", the right-mouse glyph, "3", read from `RUN_ACTIONS`), its
knockout icon, and its cost numeral under it in the resource's channel colour. The right-click square
greys by cost, by `ability_cooldown.remaining > 0`, by the client lockout and by `parryRefused`, and
is active (bright rim, hover ink) while the archer holds Shadow Shot or the merc's stance is open. The
potion square shows the flask and the count in its corner, greyed at 0 with a faint "0" and always in
a field. The 3 square shows the padlock and a faint "Lv 10" (one named constant) while
`tree_ability_cooldown` is absent; this slice draws only the locked state.

The world judges all of it and hands one plain `bar` view (keys, flags, cost, kind, count, the
`CooldownState`s; no functions) through the bridge; the UI scene's HUD slot builds the piece at its
world's place and shows it. Up in runs and fields from the first state, exactly as long as the top-left
bars are: in a run, out of the delve, it is held with every square greyed (nothing can be cast or
drunk), no sweep, and the potion count as the state that resolved the player showed; in a field it
comes down while the player lies fallen; never in the hub. *(Integrator correction 2026-11-21 —
reason: keep FS-QPDKN R168's hold. Was: null (down) once out of the delve.)* A press on a square is taken by the bar's own ground. Keys 1 and 3 stay the
world's (a drink and a cast are world-play messages), guarded by `ui.menuOpen`. The level-up cue
rises 6 px over the bar while it is up. The controls badge keeps its rect and follows the bar. Delete
the card and the cell. Update the guideline.

## Acceptance Criteria

- [ ] FS-Q18Q3 §Acceptance Criteria, game-client: the layout criterion; the order and plaques; the
      ability squares' icon and cost numeral; the right-click square's greying; the active state;
      the potion square; the 3 square's **locked** half; a press starts nothing; the ESC menu and
      field menu keys; the worlds and the hide rules; the cue; no card; no potion cell and the
      clearance tests; the held bar at death, escape and while spectating; resize and render scale; the older-server criterion; the UI-scene criterion
      (the `bar` message, the slot, no world drawing or rect test, the badge); the guideline;
      tokens, typecheck, lint, fence and vitest.
- [ ] The piece's tests stand a fake bridge, not a world (as `uiSceneHud.test.ts` does); each
      world's test checks the `bar` message it sends.
- [ ] Headless captures at 1080 and 1280 of a run and a field, chat folded and unfolded, render scales
      1 and 2, checked by eye; a level-up cue captured over the bar; the run's controls badge in its
      place.
- [ ] No dev-gallery card added.

## Blocked By

- I-Q18Q3-1 (`ability_cooldown` typed and on the wire; the greying reads it)
- I-Q18Q3-3 (the icons)

## Spec Reference

FS-Q18Q3 §B R8–R12, §C R13–R17, §E R22–R25 and R27, §G R29–R30, §H R31–R33, §I R34–R36, §J R37–R38,
§L R40–R44; User Stories 1–6, 9–15, 19–24.

## TDD Approach

- RED: `abilityBarLayout.test.ts` expects the row at x 464–616 at 1080 and 564–716 at 1280, its foot 6
  px above `xpBarFrame(view).piece.y`, and clear of `chatWindowFrame(...).panel` and
  `cornerRowLeft(view)` at every width between; `uiSceneHud.test.ts` expects a run's `bar` message to
  build one bar piece and a hub's to build none.
- GREEN: the layout function, then the pure view, then the slot's `bar` kind and the piece, then the
  worlds' sends.
