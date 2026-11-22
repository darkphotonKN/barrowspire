---
id: I-Q18Q3-5
status: done
implements: FS-Q18Q3
blocked_by: [I-Q18Q3-4]
labels: [blocked]
title: "FS-Q18Q3 slice 5: hovering a square shows its name and how it works (game-client)"
---
Implements FS-Q18Q3 §F (R28), §H (R33), §L (R40, R41)

> **Integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream.** The
> tooltip is the UI scene's: heard by each square's own ground's pointer over and out, drawn in the
> item-tip band (2200), its words looked up on the UI side from the keys the `bar` view carries. No
> world scene feeds it a pointer or sends it words; the world files leave this slice.

## Files it expects to touch

- `game-client/src/ui/abilityBarTip.ts`, `abilityBarTip.test.ts` (new, pure: which tooltip, its words
  from the square's keys in the `bar` view, and its place for a hovered square, kept inside the view)
- `game-client/src/ui/abilityCopy.ts` (the potion's copy, the locked third line; the right-click rows
  unchanged; the tree rows read from FS-04EEA R50's ability data, never restated)
- `game-client/src/ui/AbilityBar.ts`, `AbilityBar.test.ts` (the squares' grounds' `pointerover` /
  `pointerout`; the tooltip drawn at 2200 and taken down with the bar or on leave)
- `game-client/src/ui/abilityBarView.ts`, `abilityBar.test.ts` only if the view lacks a key the copy
  needs (the world and the field flag, the potion count)

## What to Build

Hovering a square shows a tooltip above it: the name in the 16 px body serif in `hudText` and how it
works in 13 px `hudLabel`, on the HUD panel at 0.85 in a 1 px brass rim, at most 240 px wide and
wrapping, centred over the square and kept inside the view. At once on enter; gone on leave, on the
bar's takedown, and wherever a menu or panel takes the point. Right-click: today's `ABILITY_COPY`
rows. 3: the class's tree ability name and line from FS-04EEA's ability data, plus "Learned at the
skill tree's third tier, from level 10." in `hudFaint` while locked. 1: "Health Potion", "Drink to
heal at once, from your first potion slot.", plus "No health potion worn." at 0, or "Potions are
drunk only in the Spire." in a field. A greyed square shows its tooltip and its icon never brightens.
A window or the ESC menu over a square takes the pointer first (it stands higher on the UI scene), so
no tooltip shows under one.

## Acceptance Criteria

- [ ] FS-Q18Q3 §Acceptance Criteria, game-client: the tooltip criterion, and the UI-scene
      criterion's "the tooltip draws at 2200".
- [ ] Edge States: the ESC menu open (no tooltip), the gear overlay open (no tooltip under a panel),
      a tooltip near the view's edge kept inside it, a class with no row (no tooltip), a world
      switch while a tooltip shows (it goes with the bar).
- [ ] The piece's tests stand a fake bridge, not a world.
- [ ] Headless captures of each square's tooltip at 1080, checked by eye.
- [ ] Typecheck, lint, the token fence and `npx vitest run --maxWorkers=4 --minWorkers=1` pass.

## Blocked By

- I-Q18Q3-4 (the bar)
- blocked by FS-04EEA (R50: the tree abilities' names and lines in the client's ability data); until
  then the locked 3 square's tooltip reads only the third line

## Spec Reference

FS-Q18Q3 §F R28, §H R33; User Stories 14, 17, 18.

## TDD Approach

- RED: `abilityBarTip.test.ts` expects the potion square's tooltip in a field to carry "Potions are
  drunk only in the Spire." and a tooltip over the right-hand square at 1080 to stay inside x ≤ 1080.
- GREEN: the pure tip function, then the widget's hover.
