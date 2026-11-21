---
id: I-8RZ51-10
status: open
implements: FS-8RZ51
blocked_by: [I-8RZ51-7]
labels: [blocked]
title: "FS-8RZ51 slice 10: the four shared filler icons and the warrior's and mage's seven node icons, built in code (game-client)"
---
Implements FS-8RZ51 §G R40

**Author: agent.** Art is built in code, never sourced (fidelity bar: Ultima Online). Every
picture is a `KnockoutPicture` through the one renderer (ADR-0080), with its line-glyph fallback.
Gate: a contact sheet of this slice's 18 pictures, approved before the slice closes.

## Files it expects to touch

- `game-client/src/ui/knockoutPassiveFiller.ts` (new: health, reserve, attribute, regen)
- `game-client/src/ui/knockoutPassiveWarrior.ts`, `knockoutPassiveMage.ts` (new: four kickers, the
  ability, two specializations each)
- `game-client/src/data/passiveTree.ts` (icon keys point at the pictures)
- `game-client/src/ui/PassiveTreeOverlay.ts` (draw nodes through `Knockout`)
- their tests (each picture shows without falling back; each node id has a picture or a glyph)
- the dev gallery (FS-1819Q) entry if the contact sheet is rendered there

## What to Build

Four filler pictures shared by every class (the mercenary's Strength and Agility nodes use
attribute, its max HP node health) and seven class pictures each for the warrior (Heavy Hand,
Thick Skin, Earthbreaker, Long Wind, Bull Rush, Guardian, Berserker) and the mage (Kindling, Deep
Well, Blink, Wide Volley, Searing, Spellwarden, Pyromancer): embossed bronze knockouts at the
node's size, legible at it, in-theme.

## Acceptance Criteria

- [ ] 18 pictures, each through `Knockout` with a fallback glyph; tests prove no fallback in a
      normal render.
- [ ] Locked and closed nodes draw in the renderer's greyed ink.
- [ ] Contact sheet approved.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

## Blocked By

I-8RZ51-7 (the overlay draws nodes).

## Spec Reference

FS-8RZ51 §G R40, ADR-0080. User story 26.
