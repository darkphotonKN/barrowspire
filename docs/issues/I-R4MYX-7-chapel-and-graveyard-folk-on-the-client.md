---
id: I-R4MYX-7
status: done
implements: FS-R4MYX
blocked_by: [I-R4MYX-2, I-R4MYX-5]
labels: [ready-for-agent]
title: "FS-R4MYX slice 7: game-client faces, dresses and voices the Confessor, the worshippers and the mourners"
---
Implements FS-R4MYX §D Requirement 18 (client), §E Requirement 26, §G Requirements 34–35

**Lane: game-client code (agent).**

## What to Build

- `HUB_FIXED_RESIDENTS` gains the eight in hub_map.go's order with their points and facings (the
  Confessor `e`, everyone else `w`); what one faces may be a headstone, so the `faces` field
  widens beyond `FurnishingKind`. Held to the golden.
- `folkLook`: an `appearance` naming a bespoke folk sheet draws it: `confessor` →
  `folk_confessor` when the art has it, else the default villager (FS-2325V §G.2's fallback).
  `<palette>_<build>` values behave as today.
- `TOWN_LINES` gains the eight tellings exactly as FS-R4MYX R34 lists them (the Confessor's role
  *Keeper of the chapel*); the Alewife's stays the longest or tied; the "keys equal the fixed
  residents" test passes with thirteen.
- The nearest answers (B0H2D R28) is unchanged: a test with two worshippers in range.

Expected files:
- `game-client/src/render/world/hubInteriors.ts`, `hubInteriors.test.ts`
- `game-client/src/render/art/hubFolk.ts`, `hubFolk.test.ts`
- `game-client/src/scenes/townLines.ts`, `townLines.test.ts`
- `game-client/src/scenes/hubReach.test.ts` (if the nearest-answers case is not already covered)

Not touched: `HubScene.ts` (it already keys facing and lines by name), bake sources, the server.

## Acceptance Criteria

- [ ] Vitest: `HUB_FIXED_RESIDENTS` equals the golden's thirteen; facings as R17.
- [ ] Vitest: `folkLook({ function: "", appearance: "confessor" })` is `folk_confessor` with the
      sheet, the default villager without it; existing looks unchanged.
- [ ] Vitest: the eight tellings with R34's passage counts and the Confessor's role.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` green.

## Blocked By

I-R4MYX-2 (the thirteen in the golden), I-R4MYX-5 (same file, `hubInteriors.ts`)

## Spec Reference

FS-R4MYX §D R18, §E R26, §G R34–R35; user stories 8–10, 18, 19, 24–26.

## TDD Approach

- RED: the keys-equal test after the golden lands (eight names missing); `folkLook` on
  `confessor` returning the default villager though the sheet exists.
- GREEN: the mirror, the bespoke-look rule, the lines.
