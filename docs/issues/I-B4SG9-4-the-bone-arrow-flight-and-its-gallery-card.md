---
id: I-B4SG9-4
status: done
implements: FS-B4SG9
blocked_by: []
labels: [ready-for-agent]
title: "FS-B4SG9 slice 4: the bone arrow's flight on the client, with its gallery card"
---
Implements FS-B4SG9 §D (R22, R23)

**Type:** AFK. Client only; needs no server change to build or test.

## Files owned

- `game-client/src/render/effects/boneArrow.ts`, `boneArrow.test.ts` (new; or the hostile variant inside `arrow.ts` if that is the smaller change)
- `game-client/src/render/effects/flights.ts` (the `bone_arrow` row)
- `game-client/src/dev/gallery/effects.ts`, `effects.test.ts` (the card)
- `game-client/src/utils/canvasPalette.ts` only if the hostile tokens the flight needs are not already exposed; never a literal colour

## What to Build

- `projectile_type: "bone_arrow"` has its own flight (R22): the arrow's shape in the hostile
  channel, a bone shaft with an ember/oxblood accent. Tokens only (ADR-0013). Never the party
  arrow's colours, never amber, never arcane green. Read
  `game-client/docs/design-guideline.md` "Enemy design language" ("A hostile's attack effect is
  in the hostile channel too") first.
- It flies where the server puts it, like every projectile. No release flash, no sound, no hit
  effect of its own (§Out of Scope).
- Its card in the dev gallery's effects registry, in the same change (R23).

## Acceptance Criteria

- [ ] `projectileFlightOf("bone_arrow")` is its own flight: not the fireball fallback and not
      `ARROW_FLIGHT`.
- [ ] The flight draws from palette tokens only; the source-scan and lint fences pass.
- [ ] The gallery's effects registry has a bone arrow card, and the registry's completeness test
      passes.
- [ ] `/dev/gallery` shows the bone arrow flying beside the party arrow, and the two are told
      apart at a glance (the developer looks; the owner confirms it in I-B4SG9-8).
- [ ] `npm test` passes in game-client.

## Blocked By

None

## Spec Reference

FS-B4SG9 §D R22–R23; user stories 10, 23; acceptance criteria "Client" 4–5.

## TDD Approach

- RED: `projectileFlightOf("bone_arrow")` is not the fallback; the effects registry lists the card.
- GREEN: the flight, its row in `FLIGHTS`, the card.
