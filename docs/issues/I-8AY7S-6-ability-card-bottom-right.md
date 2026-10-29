---
id: I-8AY7S-6
status: done
implements: FS-8AY7S
blocked_by: [I-8AY7S-4]
labels: [ready-for-agent]
title: "FS-8AY7S slice 6: the ability card at the bottom right"
---
Implements FS-8AY7S §Requirements 29–33

**Author: agent**

## What to Build

game-client only. Read `game-client/docs/design-guideline.md` first.

- A card at the bottom right of a run: the class ability's name, the right-mouse glyph (drawn,
  not an emoji), and one line on how it works, keyed by `current_player.class`. Starting copy
  (FS §Requirements 30): warrior "Dash" / "Charge a short way toward the cursor."; mage "Triple
  Fireball" / "Hurl three fireballs in a spread toward the cursor."; archer "Triple Arrow" /
  "Loose three arrows in a spread toward the cursor." A class with no row: no card. Put the table
  where FS-JTNPR and FS-MAMHR can replace or add a row without touching the card's code.
- Greyed while `resource.current < resource.ability_cost`, and while the client's own
  post-right-click lockout (`canCastSkill`'s window) runs. No cooldown sweep. Missing `resource`:
  never greyed by cost.
- Hidden while the delver is out of the delve (same rule as slice 4) and in the hub; never
  overlaps the dead spectator's leave button (FS-QPDKN), which is up only while the card is
  hidden.
- Remove the "10 MP" comments in the right-click branch of `BarrowspireScene.ts`.

## Acceptance Criteria

- [ ] Fixture warrior / mage / archer states show the right name, glyph and line.
- [ ] Greyed at `current` 24 with `ability_cost` 25, lit at 25; greyed for the lockout window
      after a right-click, lit after.
- [ ] Missing `resource`: lit except during the lockout.
- [ ] Hidden in the hub, on death / escape / left-behind and while spectating; the leave button
      and the card are never up together.
- [ ] No overlap with the bottom-left bars or the other HUD pieces.
- [ ] No "10 MP" left in the client.
- [ ] Unit tests for the pure rules (row lookup, greyed state).
- [ ] `npm test`, `npm run lint`, `npm run lint:fence` green.

## Blocked By

I-8AY7S-4 (the `resource` type and the shared visibility rule).

## Spec Reference

FS-8AY7S §Requirements 29–33; §User Stories 10–12, 23, 26; §Edge States "Unaffordable press",
"Class with no card row", "Missing `resource`", "Parry stance", "Shadow Shot hold".

## TDD Approach

- RED: `src/ui/abilityCard.test.ts`: row per class, none for an unknown class, greyed by cost
  (24 vs 25), greyed by lockout, lit when both clear.
- GREEN: `src/ui/abilityCard.ts` pure rules, then the scene draws the card.

## Files expected to touch

`game-client/src/ui/abilityCard.ts` (new) + `abilityCard.test.ts` (new),
`src/scenes/BarrowspireScene.ts`, `src/utils/theme.ts` (only if a token is needed).
