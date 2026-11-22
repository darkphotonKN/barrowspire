---
id: I-8RZ51-10
status: in-progress
implements: FS-8RZ51
blocked_by: [I-8RZ51-7]
labels: [blocked]
title: "FS-8RZ51 slice 10: the four shared filler icons and the warrior's and mage's six new node icons each, built in code (game-client)"
---
Implements FS-8RZ51 §G R40

**Author: agent.** Art is built in code, never sourced (fidelity bar: Ultima Online). Every picture
goes through the one renderer (`Knockout`, ADR-0080) with its line-glyph fallback. *(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream)* The tier-3
nodes (Earthbreaker, Blink) are **not** drawn here: they already draw `ABILITY_ICONS`' pictures from
`abilityIcons.ts` (slice 7). New pictures take the same `AbilityIcon` shape (`picture` and `lines`)
and the renderer's shared `BRONZE`, `GREYED`, `GREYED_ALPHA` and `stroke()`. The overlay is the UI
scene's, so the icons are drawn on the UI scene. Gate: a contact sheet of this slice's 16 new
pictures beside the two reused, approved before the slice closes.

## Files it expects to touch

- `game-client/src/ui/passiveIcons.ts` (new: the filler four, health, reserve, attribute, regen; and
  the warrior's and mage's six each, as `AbilityIcon` records with a lines-drawing helper like
  `drawAbilityIconLines`) and `passiveIcons.test.ts` (new)
- `game-client/src/data/passiveTree.ts` (icon keys point at the pictures)
- `game-client/src/ui/PassiveTreeOverlay.ts` (nodes drawn through `Knockout`, greyed ink for locked
  and closed) and its test
- the dev gallery (FS-1819Q) entry if the contact sheet is rendered there

## What to Build

Four filler pictures shared by every class (the mercenary's Strength and Agility nodes use attribute,
its max HP node health) and six class pictures each for the warrior (Heavy Hand, Thick Skin, Long
Wind, Bull Rush, Guardian, Berserker) and the mage (Kindling, Deep Well, Wide Volley, Searing,
Spellwarden, Pyromancer): embossed bronze knockouts at the node's size, legible at it, in-theme, in
the language the ability bar's pictures set.

## Acceptance Criteria

- [ ] 16 new pictures, each through `Knockout` with a fallback glyph; tests prove no fallback in a
      normal render.
- [ ] The warrior's and mage's tier-3 nodes draw `ABILITY_ICONS.earthbreaker` and `.blink`; no copy of
      either picture is made.
- [ ] Locked and closed nodes draw in `GREYED` at `GREYED_ALPHA`.
- [ ] Contact sheet approved.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

## Blocked By

I-8RZ51-7 (the overlay draws nodes).

## Spec Reference

FS-8RZ51 §G R40; ADR-0080. User story 26.
