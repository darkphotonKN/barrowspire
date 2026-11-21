---
id: I-04EEA-7
status: done
implements: FS-04EEA
blocked_by: [I-04EEA-6, I-04EEA-4]
labels: [blocked]
title: "FS-04EEA slice 7: the archer holds 3 to aim Arrow Rain's circle and releases to cast"
---
Implements FS-04EEA §G R38, R39

**Author: agent**

## What to Build

An archer with Arrow Rain holds key 3 to see a ground circle at the cursor, and releases to cast
there. Client presentation only (ADR-0030).

- A new `src/scenes/arrowRainAim.ts` beside `shadowShotAim.ts`: the press starts the aim and sends
  nothing; while held, the circle's centre is the cursor's world point, pulled in to 300 world px
  from the archer along the line when further; the release sends
  `cast_skill {skill_id: "arrow_rain", target_x, target_y}` at that centre if slice 6's gates still
  hold. No minimum hold.
- Draw the circle (70 world px) in the iso projection each frame, coloured from a `BARROW` token,
  for the archer only. It is a held drawing like the Shadow Shot aim line (`render/effects/aimLine.ts`)
  and may live outside the effects table. It is a world effect, so the world scene draws it
  (ADR-0086 2.2), through the same `CombatLook` the aim line uses; nothing goes in the UI scene
  (integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream).
- The archer keeps walking while aiming. Left and right clicks are ignored during the aim (R38, R39).
- Cancel with nothing sent and no circle left on each of FS-JTNPR R15's cancels: the archer
  resolving, a floor change, the UI scene reporting its menu or the gear overlay opened (read from
  `this.ui.ui` where the run already calls `cancelAim()` for the Shadow Shot hold, and the field's
  `FieldCombat.cancelAim`), scene teardown, window blur (integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream).
- The release calls `castSent` (R40).

## Acceptance Criteria

- [ ] An archer's key-3 press sends nothing and shows the circle at the cursor.
- [ ] With the cursor 500 px away, the circle sits 300 px from the archer on the line, and the
      release sends that point.
- [ ] A tap sends one `arrow_rain` at the cursor.
- [ ] Each cancel ends the aim with nothing sent and no circle left.
- [ ] Movement keys keep moving the archer during the aim; clicks send nothing during it.
- [ ] A release when the gates no longer hold (now on cooldown or short of stamina) sends nothing.
- [ ] The circle's colour is a `BARROW` token; the token fence passes.
- [ ] `npx vitest run`, `npx tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

I-04EEA-6 (the key-3 binding and gates). I-04EEA-4 (the server's `arrow_rain`; ship after it).

## Spec Reference

FS-04EEA §G R38–R40; §User Stories 12–14; §Acceptance Criteria "game-client" (Arrow Rain aim rows);
§Edge States "Window blur with key 3 held", "Floor change mid-rain". FS-JTNPR §Requirements 15.
ADR-0030.

## Files expected

- `game-client/src/scenes/arrowRainAim.ts` (new)
- `game-client/src/scenes/arrowRainAim.test.ts` (new)
- `game-client/src/render/combat/playerCombat.ts`
- `game-client/src/render/combat/playerCombat.test.ts`
- `game-client/src/render/effects/aimCircle.ts` (new, or beside `aimLine.ts`)
- `game-client/src/scenes/BarrowspireScene.ts`
- `game-client/src/scenes/fieldCombat.ts`

## TDD Approach

- RED: `arrowRainAim.test.ts`, an aim from an archer at (0, 0) with the cursor at (500, 0) answers
  a centre of (300, 0); a blur answers "cancel".
- GREEN: the aim module, then wire it into `PlayerCombat`.
