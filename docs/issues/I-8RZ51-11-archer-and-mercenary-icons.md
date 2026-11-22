---
id: I-8RZ51-11
status: in-progress
implements: FS-8RZ51
blocked_by: [I-8RZ51-10]
labels: [blocked]
title: "FS-8RZ51 slice 11: the archer's and mercenary's six new node icons each, and the 33-picture contact sheet (game-client)"
---
Implements FS-8RZ51 §G R40

**Author: agent.** As slice 10: built in code, `Knockout` (ADR-0080), line-glyph fallbacks, the
`AbilityIcon` shape in `passiveIcons.ts`. *(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream)* The archer's and mercenary's tier-3 nodes draw
`ABILITY_ICONS.arrow_rain` and `.settle_the_debt`, already built. Gate: a contact sheet of all 33
tree pictures (29 new: 4 filler, 24 class, the corner icon; and the 4 reused tree-ability pictures),
approved.

## Files it expects to touch

- `game-client/src/ui/passiveIcons.ts` (the archer's and mercenary's six each) and its test
- `game-client/src/data/passiveTree.ts` (icon keys)
- the dev gallery entry for the full sheet

## What to Build

Six pictures each for the archer (Quick Draw, Fleet Foot, Eagle Eye, Hunter's Breath, Hunter, Shadow
Ranger) and the mercenary (Keen Edge, Practiced Guard, Bloodied Riposte, Steady Hand, Duelist,
Sellsword), in the language slice 10 set, and one sheet of all 33 side by side so the set reads as
one family with the ability bar's tree abilities.

## Acceptance Criteria

- [ ] 12 new pictures through `Knockout` with fallbacks; no node of any class draws its fallback
      glyph in a normal render.
- [ ] The 33-picture contact sheet approved.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

## Blocked By

I-8RZ51-10 (the icon language, `passiveIcons.ts` and the filler set the full sheet shows).

## Spec Reference

FS-8RZ51 §G R40, §Acceptance Criteria (33 pictures). User story 26.
