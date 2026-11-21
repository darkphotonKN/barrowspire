---
id: I-Q18Q3-3
status: open
implements: FS-Q18Q3
blocked_by: []
labels: [ready-for-agent]
title: "FS-Q18Q3 slice 3: the bar's ten bronze knockout icons and their contact sheet (game-client)"
---
Implements FS-Q18Q3 §C (R16, R17), §K (R39)

## Files it expects to touch

- `game-client/src/ui/abilityIcons.ts` (new: ten `KnockoutPicture`s keyed `dash`,
  `triple_fireball`, `shadow_shot`, `parry`, `earthbreaker`, `blink`, `arrow_rain`,
  `settle_the_debt`, `potion`, `locked`, each with its line-glyph fallback),
  `game-client/src/ui/abilityIcons.test.ts` (new)
- `game-client/src/ui/knockout.ts` only if a picture needs something the renderer lacks (prefer not)
- a headless capture script or test under the client's existing screenshot tooling, writing the
  contact sheet PNGs (not committed unless the repo commits such sheets)

## What to Build

Draw the ten icons as silhouettes plus cuts for the one knockout renderer (ADR-0080): the warrior's
Dash, the mage's Triple Fireball, the archer's Shadow Shot, the merc's Parry, the four tree abilities
(Earthbreaker, Blink, Arrow Rain, Settle the Debt), a flask for the health potion, and a padlock.
About 30 px in a 44 px well. Serious, mature medieval, in the corner row's family: no feature under
about 3 px, no cut under about 1.5 px, no two cuts close enough to read as a face. Render a contact
sheet: each icon lit (`BRONZE` idle), hovered, greyed (flat `hudFaint` at 0.6) and active (hover ink),
at render scale 1, 1.5 and 2, over a field ground and a run ground.

## Acceptance Criteria

- [ ] Every key has a picture and a line fallback; a test checks every picture's points lie inside
      the slot and every fallback is a non-empty path.
- [ ] No raw colour literal; no baked art; no new drawing pipeline (the token fence passes).
- [ ] The contact sheet exists at the three scales and the four inks, ready for I-Q18Q3-8.
- [ ] Typecheck, lint and `npx vitest run --maxWorkers=4 --minWorkers=1` pass.

## Blocked By

None

## Spec Reference

FS-Q18Q3 §C R16–R17, §K R39; Edge State "Render scale 1"; User Stories 4, 28.

## TDD Approach

- RED: `abilityIcons.test.ts` expects a picture for each of the ten keys, inside a 30 px slot.
- GREEN: the pictures.
