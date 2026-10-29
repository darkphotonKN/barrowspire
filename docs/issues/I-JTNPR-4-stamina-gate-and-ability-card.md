---
id: I-JTNPR-4
status: done
implements: FS-JTNPR
blocked_by: [I-JTNPR-2]
labels: [blocked]
title: "FS-JTNPR slice 4: an unaffordable release sends nothing, and the card names Shadow Shot"
---
Implements FS-JTNPR §Requirements 18–19

**Author: agent**

## What to Build

Once FS-8AY7S is in, the client judges Shadow Shot's cost the way the HUD does, and the
archer's ability card says what the ability is.

- **Affordability (R18).** At release, if the archer's current stamina is below Shadow Shot's
  cost (40), the release sends nothing and plays nothing, and the aim line stays faint while it
  is short. Judge at release, not at the press: stamina that regenerates during the hold counts.
  Read the **same** affordability source FS-8AY7S's ability card greys from, so the card and
  the aim line never disagree. Do not hard-code a second copy of the cost if FS-8AY7S exposes it.
- **The card (R19).** FS-8AY7S's ability card shows, for the archer, the name **Shadow Shot**
  and its how-it-works line: *Hold to aim, release to loose one slow, heavy bolt.* (wording in the
  lore voice per `game-client/CONTEXT.md` and `docs/design-guideline.md`; the meaning is fixed).
  If FS-8AY7S has already put this copy on the card, this half is a check, not a change.

## Acceptance Criteria

- [ ] With the archer's stamina below 40, a ready-length, off-cooldown release sends nothing and
      plays nothing; the aim line is faint.
- [ ] Stamina that reaches 40 during the hold lets the release fire.
- [ ] The aim line's ready state and the ability card's affordable state agree for every
      stamina value.
- [ ] The archer's ability card reads Shadow Shot with its how-it-works line.
- [ ] Warrior's and mage's cards and right-clicks are unchanged by this slice.
- [ ] `npx vitest run`, `npx tsc --noEmit`, `npm run lint` pass.

## Blocked By

- I-JTNPR-2 (the hold and its ready rule).
- **FS-8AY7S stamina on the wire** (the local delver's class resource kind, current and max in
  state) and **FS-8AY7S ability card** (the bottom-right card, its per-class name and description,
  and its affordability). Not issue ids: resolve to FS-8AY7S's slices when they exist.

## Spec Reference

FS-JTNPR §Requirements 18, 19; §User Stories 12–14; §Edge States "Short of stamina". Depends on
FS-8AY7S.

## Files expected

- `game-client/src/scenes/BarrowspireScene.ts` (release gate)
- the hold-rules module from I-JTNPR-2 (e.g. `game-client/src/scenes/shadowShotAim.ts`) + its test
- the aim line from I-JTNPR-2 (e.g. `game-client/src/render/effects/aimLine.ts`) if its ready
  state is passed in rather than computed by the scene
- wherever FS-8AY7S keeps the ability card's per-class copy (its module, not created here)

## TDD Approach

- RED: the hold module reports "cancel" for a ready-length, off-cooldown release with stamina 39
  and "fire" with stamina 40; a scene test that no `cast_skill` goes out at 39.
- GREEN: affordability joins the ready rule, fed from FS-8AY7S's source.
