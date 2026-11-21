---
id: I-8RZ51-7
status: done
implements: FS-8RZ51
blocked_by: [I-8RZ51-1, I-8RZ51-3]
labels: [blocked]
title: "FS-8RZ51 slice 7: the tree overlay on the UI scene, opened with P or a corner icon in every world, with its marker and a tooltip on every node (game-client)"
---
Implements FS-8RZ51 §G (R32–R37, R39, R41–R43)

**Author: agent.** *(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream)* Every piece here is the **UI scene's** (`UIScene`, ADR-0084; placed by
ADR-0086 rules 1.1 and 1.2). No world scene (`HubScene`, `FieldScene`, `BarrowspireScene`) is
edited, and no new bridge request is added. Canvas only, on the game palette (ADR-0025, tokens only,
ADR-0013); the corner icon's picture goes through `Knockout` (ADR-0080). Node icons draw as
line-glyph fallbacks here, save the tier-3 node, which draws its `ABILITY_ICONS` picture already;
slices 10 and 11 give the rest pictures.

## Files it expects to touch

- `game-client/src/data/passiveTree.ts` (new: presentation copy by node id: name, tooltip copy, icon
  key; tier-3 keys are `ABILITY_ICONS` keys) and `passiveTree.test.ts` (new: copy and golden have
  the same id set)
- `game-client/src/ui/passiveTreeModel.ts` (new, pure: node states from the golden, ranks and points;
  tooltip lines) and its test
- `game-client/src/ui/passiveTreeLayout.ts` (new, pure) and its test
- `game-client/src/ui/PassiveTreeOverlay.ts` (new, Phaser, built on the UI scene: `drawPanelFrame`,
  a `uiGround` over its rect, tips via `tipGround` / `itemTipRow` in the 2200 band) and its test
- `game-client/src/ui/uiSceneTree.ts` (new, Phaser-free slot as `uiSceneGear.ts` is: built per
  world reported, fed the `seen` character, toggled, refused under the gear's refusals, cleared on
  `endPopped`, reporting `tree` through `reportUi`) and `uiSceneTree.test.ts`
- `game-client/src/scenes/UIScene.ts` (mount the slot in `mountInterface`; route `gear` `seen`'s
  character to it; `keydown-P` in `mountKeys`, off while `ui.typing`; pointer moves and presses
  to it in `mountPointer`) and `UIScene.test.ts`
- `game-client/src/ui/uiBridge.ts` (`UiState.tree`, `uiKey`, `gearOpened` counts it) and its test
- `game-client/src/ui/uiSceneCorner.ts` (a `tree` icon toggling the tree slot inside `act`; its
  `screen()` key; the marker set on the standing row) and its test
- `game-client/src/ui/hudCornerLayout.ts`, `game-client/src/ui/HudCorner.ts` (`tree` in
  `CornerIcon` and `CORNER_ICONS`, `CORNER_LABEL` "Tree (P)", its `KnockoutPicture` and glyph, a
  marker setter) and their tests; `xpBarLayout.test.ts` (clearance with six icons)
- `game-client/src/ui/escapeOrder.ts`, `game-client/src/ui/uiSceneMenu.ts` (tree in `EscapeOpen`
  and the menu slot's closes) and their tests
- `game-client/src/ui/uiSceneSounds.ts`, `game-client/src/audio/uiSounds.ts` (the tree as a window
  in `WindowState`, playing the character panel's open and close) and their tests
- `game-client/src/ui/characterSheet.ts` (`CharacterSource` picks `passive_ranks`,
  `passive_points`) and `game-client/src/types/gameState.ts` (both on `PlayerState`)

## What to Build

- P (a `keydown-P` handler on the UI scene's keyboard, uncaptured, off while typing) and the corner
  row's new tree icon toggle the overlay in the HUB, a field and a run. No world binds P. The icon
  shows an ember marker while `passive_points > 0` (R33), set on the standing row.
- The overlay stands in the window band between the gear overlay (1100–1103) and the party panel
  (1110), with its own interactive ground, so a press on it never reaches the world or a party frame.
- It lays the class's six tiers out from the golden (R35): gates stated, `r / max` on each node, the
  five node states, "or" between the tier-6 nodes, the header with class and unspent points. It reads
  the own-player state each world already hands every tick (`gear` `seen`'s `character`) and
  redraws when ranks, points or class change (R41).
- Hover tooltips on every node (R37): name, kind, rank, each rank's effect written from the golden's
  values with held ranks marked, the R3 kicker labelled, the lock reason; tier 3 names the ability
  and key 3, tier 6 the title and the look change (placeholder copy, owned by FS-04EEA and FS-E1ZDG).
- Windows (R36): opening the tree closes Inventory and Character and the reverse; the party panel
  opens over it; the menu closes it; Esc letter → menu → party → tree → gear; refused while the menu
  slot is filled or the world's `blockers().gear` holds; cleared at the run's end.
- Unknown class or node id: fallback glyph and the id as name (R42).
- No clicks spend yet (slice 8); outside town the footer reads "Points are spent in town."

## Acceptance Criteria

- [ ] The "Client" criteria of FS-8RZ51 §Acceptance Criteria for opening, the marker, the five
      states, the tooltips, the golden id-set test, R36, the UI-scene placement and the XP bar
      clearance.
- [ ] No world scene file changes in the diff; P is bound only on the UI scene.
- [ ] Opening the tree while aiming Shadow Shot ends the aim (through `gearOpened`).
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green in game-client.

## Blocked By

I-8RZ51-1 (the golden JSON), I-8RZ51-3 (`passive_ranks` and `passive_points` on `current_player`).

## Spec Reference

FS-8RZ51 §G R32–R37, R39, R41–R43, §Edge States (no points, level 1, in a run, unknown id, renderer
fallback); ADR-0084, ADR-0086. User stories 4–7, 12, 28.

## TDD Approach

- RED: `passiveTreeModel` marks `warrior.t2a` locked at 3 spent above and available at 4; then
  `uiSceneTree` opens on P's toggle and is refused while the menu slot is filled.
- GREEN: the model over the golden, the slot, then the layout and the panel.
