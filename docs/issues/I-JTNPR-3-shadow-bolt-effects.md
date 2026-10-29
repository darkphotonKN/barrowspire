---
id: I-JTNPR-3
status: done
implements: FS-JTNPR
blocked_by: [I-JTNPR-2]
labels: [blocked]
title: "FS-JTNPR slice 3: the shadow-trailed bolt, its release and its impact"
---
Implements FS-JTNPR §Requirements 20–23

**Author: agent**

## What to Build

A `shadow_shot` projectile is drawn as a shadow-trailed bolt, with its own release and impact.
Effects only: no new baked texture or pose.

- Add the Shadow Shot's effect entries to the effects table (`src/render/effects/table.ts`): a
  dark, smoky `stream` trail, a heavier release at the bow and a heavier impact, built from the
  existing fx textures (`fx_smoke`, `fx_dust`, `fx_glow`, …), coloured with `BARROW` tokens
  only, inside `table.test.ts`'s bounds.
- A new `src/render/effects/shadowShot.ts` beside `arrow.ts`: `SHADOW_SHOT_FLIGHT`
  (body `fx_arrow`, turns to its heading, lift `BOW_LIFT`, the shadow trail, the shadow
  impact) and `playShadowShotRelease`.
- In the run scene, the `ProjectileFlights` kind lookup maps `shadow_shot` to
  `SHADOW_SHOT_FLIGHT`. Today it is `type === "arrow" ? ARROW_FLIGHT : FIREBALL_FLIGHT`, which
  would draw a Shadow Shot as a fireball. `arrow` and `fireball` are unchanged.
- The Shadow Shot release from I-JTNPR-2 plays `playShadowShotRelease` instead of
  `playArrowRelease`.
- Drop the `triple_arrow` mention from `arrow.ts`'s header comment.

Flights are global, so teammates see the bolt as the archer does.

**Ship with I-JTNPR-1.** Once the server sends `shadow_shot` projectiles, this mapping is what
keeps them from drawing as fireballs.

## Acceptance Criteria

- [ ] A `shadow_shot` projectile in state flies with the `fx_arrow` body turned to its heading at
      `BOW_LIFT`, trailing the shadow stream, and lands with the Shadow Shot impact.
- [ ] A ready Shadow Shot release plays the Shadow Shot release at the bow.
- [ ] `arrow` and `fireball` flights, releases and impacts are unchanged.
- [ ] The new entries pass `table.test.ts`; the token fence and `sourceScan.test.ts` find no raw
      colour.
- [ ] No new baked texture or manifest entry.
- [ ] `npx vitest run`, `npx tsc --noEmit`, `npm run lint` pass.

## Blocked By

I-JTNPR-2 (it owns the release call site in the scene's right-button branch).

## Spec Reference

FS-JTNPR §Requirements 20–23; §User Stories 18, 20; §Acceptance Criteria "game-client" (flight
and effect rows). Effects-table rules: FS-KYPQ9 §B.1, §B.2. Colours: ADR-0013.

## Files expected

- `game-client/src/render/effects/table.ts` (new entries)
- `game-client/src/render/effects/table.test.ts` (only if it enumerates entries explicitly)
- `game-client/src/render/effects/shadowShot.ts` (new) + `shadowShot.test.ts` (new)
- `game-client/src/render/effects/arrow.ts` (comment only)
- `game-client/src/scenes/BarrowspireScene.ts` (flight kind lookup, release call)
- `game-client/src/scenes/BarrowspireScene.test.ts`

## TDD Approach

- RED: `shadowShot.test.ts` (on `fakeScene.ts`): a `shadow_shot` sighting creates an `fx_arrow`
  body with the shadow trail and, once gone from state, plays the shadow impact; a scene test that
  the kind lookup returns `SHADOW_SHOT_FLIGHT` for `shadow_shot`.
- GREEN: the entries, the module, the mapping.
