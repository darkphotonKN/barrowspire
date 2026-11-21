---
id: I-8RZ51-7
status: open
implements: FS-8RZ51
blocked_by: [I-8RZ51-1, I-8RZ51-3]
labels: [blocked]
title: "FS-8RZ51 slice 7: the tree overlay, opened with P or a corner icon in every world, with its marker and a tooltip on every node (game-client)"
---
Implements FS-8RZ51 §G (R32–R37, R39, R41–R43)

**Author: agent.** Canvas only, on the game palette (ADR-0025, tokens only, ADR-0013); the corner
icon's picture goes through `Knockout` (ADR-0080). Node icons draw as line-glyph fallbacks here;
slices 10 and 11 give them pictures.

## Files it expects to touch

- `game-client/src/data/passiveTree.ts` (new: presentation copy by node id: name, tooltip copy,
  icon key) and `passiveTree.test.ts` (new: copy and golden have the same id set)
- `game-client/src/ui/passiveTreeModel.ts` (new, pure: node states from the golden, ranks and
  points; tooltip lines) and its test
- `game-client/src/ui/passiveTreeLayout.ts` (new, pure) and its test
- `game-client/src/ui/PassiveTreeOverlay.ts` (new, a `HudPanel` with `drawPanelFrame`, tips via
  `tipGround` / `itemTipRow`)
- `game-client/src/ui/hudCornerLayout.ts`, `game-client/src/ui/HudCorner.ts` (a `tree` icon,
  `CORNER_LABEL` "Tree (P)", its `KnockoutPicture` and glyph, the unspent marker),
  `game-client/src/ui/xpBarLayout.ts` test (clearance with six icons)
- `game-client/src/ui/escapeOrder.ts` and its test
- `game-client/src/types/gameState.ts` (`passive_ranks?`, `passive_points?` on `PlayerState`)
- `game-client/src/scenes/HubScene.ts`, `FieldScene.ts`, `BarrowspireScene.ts` (mount, `keydown-P`,
  `mountCorner`, window rules) and their tests

## What to Build

- P (a `keydown-P` handler) and the corner row's new tree icon toggle the overlay in the HUB, a
  field and a run. The icon shows an ember marker while `passive_points > 0` (R33).
- The overlay lays out the class's six tiers from the golden (R35): gates stated, `r / max` on each
  node, the five node states, "or" between the tier-6 nodes, the header with class and unspent
  points. It redraws when `current_player`'s ranks, points or class change (R41).
- Hover tooltips on every node (R37): name, kind, rank, each rank's effect written from the
  golden's values with held ranks marked, the R3 kicker labelled, the lock reason; tier 3 names
  the ability and key 3, tier 6 the title and the look change (placeholder copy, owned by FS-04EEA
  and FS-E1ZDG).
- Window rules of R36, and Esc order letter → menu → party → tree → gear.
- Unknown class or node id: fallback glyph and the id as name (R42).
- No clicks spend yet (slice 8); outside town the footer reads "Points are spent in town."

## Acceptance Criteria

- [ ] The "Client" criteria of FS-8RZ51 §Acceptance Criteria for opening, the marker, the five
      states, the tooltips, the golden id-set test, R36 and the XP bar clearance.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green in game-client.

## Blocked By

I-8RZ51-1 (the golden JSON), I-8RZ51-3 (`passive_ranks` and `passive_points` on `current_player`).

## Spec Reference

FS-8RZ51 §G R32–R37, R39, R41–R43, §Edge States (no points, level 1, in a run, unknown id,
renderer fallback). User stories 4–7, 12, 28.

## TDD Approach

- RED: `passiveTreeModel` marks `warrior.t2a` locked at 3 spent above and available at 4.
- GREEN: the model over the golden, then the layout, then the panel.
