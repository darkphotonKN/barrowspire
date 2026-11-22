---
id: I-04EEA-9
status: in-progress
implements: FS-04EEA
blocked_by: [I-04EEA-6, I-04EEA-7, I-04EEA-8]
labels: [blocked]
title: "FS-04EEA slice 9: the slam, the blink, the rain and the flurry are drawn, through the contact sheet"
---
Implements FS-04EEA §H R42–R46, R48, R49

**Author: agent**

## What to Build

Each tree ability plays its own effect on the send, with the class attack clip aimed at the target,
for the caster only. Kranti approves a contact sheet before this closes.

- Fill slice 6's and 7's `look` hooks:
  - **Earthbreaker** (R43): a ground slam around the warrior, a shock ring out to 90 world px with
    cracks and dust, iso-projected.
  - **Blink** (R44): a blink-out where the mage stands at the send; a blink-in where slice 6's jump
    rule places the own mage's body.
  - **Arrow Rain** (R45): from the release, 5 volleys of falling `fx_arrow` arrows into the circle,
    the first 0.3 s after the send and every 0.3 s after it, each with an impact; a floor change,
    teardown or the archer resolving stops it.
  - **Settle the Debt** (R46): a flurry of slashes all round the mercenary to 90 world px, heavier
    with the parry charges spent (n from the latest state at the send); 1, 3 and 5 read distinctly.
- **Where they live** (integrator correction 2026-11-21 — reason: ADR-0084–0086 (UI scene) landed upstream): every effect is a world effect, drawn by the world scene
  through its `CombatLook` (the run's in `BarrowspireScene`, the field's in `fieldCombat.ts`), never
  the UI scene (ADR-0086 2.1, 2.2). No UiBridge message is added.
- Every effect is an effects-table entry, `BARROW`-coloured, inside `table.test.ts`'s bounds, built
  from existing fx textures (R48). No new baked texture, pose or sound.
- Add a gallery card for each to `src/dev/gallery/effects.ts`, with Settle the Debt at 1, 3 and 5.
- **Contact sheet (R49).** Shoot the gallery cards (slam, stun tell from I-04EEA-8, blink out and
  in, Arrow Rain with its circle mid-rain, the flurry at 1, 3 and 5) into one sheet, list it under
  "Screenshots" in the PR, and hold the slice until Kranti approves. Tweaks he asks for are made on
  this slice's files.

## Acceptance Criteria

- [ ] Each send plays its effect and the attack clip toward the target; nothing plays for a press
      that sends nothing.
- [ ] Blink's blink-in plays where the own mage's body is placed; teammates see no blink effect.
- [ ] Arrow Rain draws 5 volleys at 0.3 s intervals from the send and stops on a floor change,
      teardown or the archer resolving.
- [ ] The flurry at 1, 3 and 5 parry charges reads distinctly.
- [ ] New entries pass `table.test.ts`, the token fence and `sourceScan.test.ts`; no raw colour, no
      new baked texture or manifest entry.
- [ ] The gallery shows every effect.
- [ ] Kranti approved the contact sheet.
- [ ] `npx vitest run`, `npx tsc --noEmit`, `npm run lint` and `npm run lint:fence` pass.

## Blocked By

I-04EEA-6 (the key-3 sends and their hooks). I-04EEA-7 (the Arrow Rain release). I-04EEA-8 (the
stun tell on the sheet).

## Spec Reference

FS-04EEA §H R42–R46, R48–R49; §User Stories 28, 35; §Acceptance Criteria "game-client" (effects,
Arrow Rain volleys, flurry, contact sheet rows); §Edge States "Blink at the target under the mage",
"Archer dies mid-rain". ADR-0013, ADR-0020, ADR-0021.

## Files expected

- `game-client/src/render/effects/earthbreaker.ts` (new, with test)
- `game-client/src/render/effects/blink.ts` (new, with test)
- `game-client/src/render/effects/arrowRain.ts` (new, with test)
- `game-client/src/render/effects/settleTheDebt.ts` (new, with test)
- `game-client/src/render/effects/table.ts`
- `game-client/src/scenes/BarrowspireScene.ts`
- `game-client/src/scenes/fieldCombat.ts`
- `game-client/src/dev/gallery/effects.ts`

## TDD Approach

- RED: `arrowRain.test.ts` with the fake scene: a rain started at t = 0 plays 5 volley impacts at
  300, 600, 900, 1200 and 1500 ms, and none after a teardown at 700 ms.
- GREEN: the effect modules and their table entries; the hooks.
