---
id: I-8RZ51-22
status: open
implements: FS-8RZ51
blocked_by: [I-8RZ51-21]
labels: [blocked]
title: "FS-8RZ51 slice 22: open nodes near-white as today, lit nodes in their hue with a brighter highlight and a static glow (game-client)"
---
Implements FS-8RZ51 §Change: A lit node glows in its own colour, §L-A (L1–L3), §L-C (L7–L9), §L-D (L10, L11), §L-E (L12, L14's HUD icons rule)

**Author: agent.** The visible change: a held node lights in its colour and glows.

## Files it expects to touch

- `game-client/src/ui/knockout.ts` and its test:
  - `KnockoutInk` gains optional lift fields (how far, toward what); `topLit` reads them and
    keeps the 0.25 lift toward `interactableBright` where an ink sets none;
  - a lit ink per hue (the hue mixed toward bronze by `TREE_BRONZE_MIX` 0.10, alpha 1, lifted 0.4
    toward `tint(hue, 0.5)`), hover equal to idle;
  - `TREE_INK` kept for open nodes (owner change, 2026-11-23: no open ink in bronze)
- `game-client/src/ui/PassiveTreeOverlay.ts` and its test: the ink by state in `drawPlate` /
  `drawPicture`; the halo's stacked discs on the plate graphics after the fill and edge, inside
  the edge line, lit nodes only; the line fallback in the state's ink
- `game-client/src/ui/passiveIcons.ts` (its header names the inks)
- `game-client/docs/design-guideline.md`: the HUD icons rule names ADR-0089's exception

## What to Build

- Greyed stays `GREYED`. Open (available, spendable, rank 0) stays `TREE_INK`, as today. Lit (held,
  max) is its hue with a light touch of bronze through the top-lit gradient, brighter at the top,
  full alpha.
  A locked node keeps greyed whatever its rank. Every rank above 0 the same.
- A soft, static halo in the hue behind a lit picture, inside its plate: a few stacked discs,
  starting at 4, from the plate's inner radius to 0.4 of it, about 0.45 alpha at the centre. Drawn
  once per rebuild, no filter, shown with the lines fallback too.
- Hover changes no picture; the ring stays.

## Acceptance Criteria

- [ ] FS-8RZ51 §Change: A lit node glows in its own colour Acceptance Criteria, "Inks" and "Glow" rows, and "Untouched": the ability bar and
      the corner row's Tree icon still draw `BRONZE` (test).
- [ ] Tests prove no fallback in a normal render, and the halo and lit lines with a stand-in scene
      that makes no textures.
- [ ] The overlay's existing plate, link, lock-mark, rank-label and tooltip tests pass unchanged.
- [ ] No tree code names raw hex; `npm test`, `npm run lint`, `npm run lint:fence` and
      `npx tsc --noEmit` green.

## Blocked By

I-8RZ51-21 (the hue tokens and `NodeView.hue`).

## Spec Reference

FS-8RZ51 §Change: A lit node glows in its own colour: L1–L3, L7–L12, L14. User stories 1, 3–7, 9, 11, 12, 16. ADR-0089.

## TDD Approach

- RED: an overlay test that a held Vitality's knockout is built with the health lit ink and its
  plate graphics draw the halo's discs in `palette.treeHue.health`.
- GREEN: the inks in `knockout.ts` and the state switch and halo in `drawPlate`.
