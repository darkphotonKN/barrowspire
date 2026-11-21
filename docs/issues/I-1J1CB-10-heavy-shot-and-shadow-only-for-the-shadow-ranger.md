---
id: I-1J1CB-10
status: open
implements: FS-1J1CB
blocked_by: [I-E1ZDG-2]
labels: [blocked]
title: "FS-1J1CB slice 10: every archer but a Shadow Ranger shoots the plain Heavy Shot; the shadow and its umbra aim line are the Shadow Ranger's (changes FS-JTNPR)"
---
Implements FS-1J1CB §F (Requirements 39–44), §I (Requirement 48)

**Lane: agent** (game-client). No server change. **HITL gate:** Kranti approves Heavy Shot beside
the Shadow Shot from the gallery.

## What to Build

- **Heavy Shot entries** in the effects table (`src/render/effects/table.ts`): release, trail and
  impact, ported from the variant round's `PLAIN_SHOT`
  (`/private/tmp/claude-501/-Users-kranti-Documents-Code-Go-barrowspire/e70ddb27-0938-4e2f-a3f5-4ae7b28f67c1/scratchpad/variants/archer/shot/shot.ts`):
  a harder string-snap with fibre and dust at the bow, a thicker pale wake that hangs a little
  longer than the arrow's, a heavier dust-and-splinter thud; vellum and barrow brown only, no
  umbra, no pitch halo, no light. A `HEAVY_SHOT_FLIGHT` beside `SHADOW_SHOT_FLIGHT` (e.g.
  `src/render/effects/heavyShot.ts`). If the scratch file is gone, rebuild from R40's description.
- **The release** (R41) on the player's own `CastSkill`: the Shadow Shot's for a Shadow Ranger,
  Heavy Shot's otherwise (`fieldCombat.ts`, `BarrowspireScene.ts`, `playerCombat.ts`'s look hook).
- **The flight** (R41): `ProjectileFlights` picks a `shadow_shot` projectile's flight at its first
  sighting: the nearest archer body (own or other) within 48 world px of where it is first seen;
  a Shadow Ranger's flies the Shadow Shot, any other's, or none near, Heavy Shot. The choice holds
  for the whole flight; the impact follows the flight.
- **The aim line** (R42): umbra only for a Shadow Ranger; otherwise `vellumDark` with a `vellum`
  glow-up, through two new `palette` names in `src/utils/canvasPalette.ts` (tokens only).
- Sounds unchanged (R43).
- **Gallery** (R44): a Heavy Shot card beside the Shadow Shot's in `src/dev/gallery/effects.ts`.

Do not touch `src/ui/abilityIcons.ts` (the ability's name is I-E1ZDG-2's, being edited in
parallel).

**Placement (ADR-0086)** *(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream)*: the bolt, its release and impact, and the aim line are world
effects (Decision 2.2) and stay in the world scenes; the release rides the world's own
`CastSkill` send, a world-play message (ADR-0085 Decision 1). The seams are where they are today:
`BarrowspireScene.ts` (the run's release on the own cast) and `fieldCombat.ts` (the field's, through
`playerCombat.ts`'s look hook), with the aim in `playerCombat.ts` / `shadowShotAim.ts`. Nothing goes
in `UIScene` or crosses the UiBridge. The ability card and its name live with the UI pieces and are
I-E1ZDG-2's, not this slice's.

## Acceptance Criteria

- [ ] An unspecialized archer's and a Hunter's own release, flight and impact are Heavy Shot's; a
      Shadow Ranger's are FS-JTNPR's.
- [ ] Heavy Shot's entries use no umbra token, no pitch halo, no light; `table.test.ts` and the
      token fence pass.
- [ ] A bolt first seen within 48 px of a Shadow Ranger flies the Shadow Shot; within 48 px of any
      other archer, or of none, Heavy Shot; it keeps its look for its flight.
- [ ] The aim line is umbra for a Shadow Ranger and vellum for every other archer.
- [ ] The gallery shows Heavy Shot; Kranti approved it beside the Shadow Shot.
- [ ] `npm test`, `npm run lint`, `npm run lint:fence`, `npx tsc --noEmit` pass.

## Blocked By

I-E1ZDG-2 (`specialization` on the world state).

## Spec Reference

FS-1J1CB §F R39–R44; FS-JTNPR `## Change: Shadow look only for the Shadow Ranger → FS-1J1CB`;
§Acceptance Criteria "Shots"; §Edge States (two archers side by side, bolt first seen far away);
User Stories 15–17.

## Files expected to touch

- `game-client/src/render/effects/heavyShot.ts` (new, + test)
- `game-client/src/render/effects/table.ts` (+ `table.test.ts`)
- `game-client/src/render/effects/flights.ts`, `projectile.ts` (+ tests)
- `game-client/src/render/effects/aimLine.ts` (+ test), `game-client/src/scenes/shadowShotAim.ts`
- `game-client/src/utils/canvasPalette.ts`
- `game-client/src/render/combat/playerCombat.ts`, `src/scenes/fieldCombat.ts`,
  `src/scenes/BarrowspireScene.ts`
- `game-client/src/dev/gallery/effects.ts`

Not touched: `src/scenes/UIScene.ts`, `src/ui/` *(integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream)*

## TDD Approach

- RED: `projectile.test.ts`: a `shadow_shot` first sighted 20 px from a Hunter body flies
  `HEAVY_SHOT_FLIGHT`; 20 px from a Shadow Ranger, `SHADOW_SHOT_FLIGHT`; 300 px from any archer,
  `HEAVY_SHOT_FLIGHT`.
- GREEN: the attribution at first sighting and the Heavy Shot entries.
