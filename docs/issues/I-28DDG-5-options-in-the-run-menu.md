---
id: I-28DDG-5
status: done
implements: FS-28DDG
blocked_by: [I-28DDG-4]
labels: [blocked]
title: "FS-28DDG slice 5: Options in the run's ESC menu, opening the shared OPTIONS panel (game-client)"
---
Implements FS-28DDG §Change: Music volume in an Options panel

**Lane: agent.** `BarrowspireScene.ts` is a hotspot. Touch its menu wiring only, nothing else.

## What to Build

- `runMenuChoices` adds the shared **Options** choice before *Back* in both of its states:
  *Fall where you stand* [1] or *Leave the barrow* [1], then *Options* [2], then *Back*.
  `FALL_CONFIRM` is unchanged.
- BarrowspireScene's `openMenu` gives the row its action, which opens the shared panel from
  I-28DDG-4. The scene passes the run's `MENU_TONES`, the Menu icon's `through`, a *Back* that
  reopens the run's menu, and the stored-only music level control. It holds the panel in its
  menu slot, so every `this.menu` guard holds.
- `offerMenu` routes ←/→ to the open panel. `pressEscape` (through `menuChoices.dismiss()`)
  returns to the run's menu.
- `yieldMenu` and the run's end take the panel down as they take the menu down.

## Files it expects to touch

- `game-client/src/ui/party.ts` (`runMenuChoices` only), `game-client/src/ui/party.test.ts`
- `game-client/src/scenes/BarrowspireScene.ts` (menu wiring only: the row's action, opening the
  panel, ←/→ and Esc routing, the yield), `game-client/src/scenes/BarrowspireScene.test.ts`

## Acceptance Criteria

- [ ] `runMenuChoices({ resolved: false })` is `fall`, `options`, `back`, and
      `runMenuChoices({ resolved: true })` is `leave`, `options`, `back`.
- [ ] In the run, *Options* (a click or [2]) opens the shared panel. Nothing in the scene draws a
      panel of its own.
- [ ] ←/→ and the panel's arrows and steps change the stored level, and nothing plays.
- [ ] *Back*, Esc and × reopen the run's menu. The Menu icon closes the panel.
- [ ] While the panel is open no `move` is sent and the run's menu guards hold.
- [ ] A state that newly resolves the player, or the run's end, closes the panel.
- [ ] Nothing in `BarrowspireScene.ts` changes beyond its menu wiring.
- [ ] `npx vitest run --maxWorkers=4 --minWorkers=1`, `npx tsc --noEmit -p .` and `npm run lint`
      pass.

## Blocked By

I-28DDG-4

## Spec Reference

FS-28DDG §Change: Music volume in an Options panel: C1, C2 and C13 for the run, plus C14 and
C17. Edge States: *The run's end, or a death, with the panel open*.

## TDD Approach

- RED: `party.test.ts`: `runMenuChoices` ids include `options` before `back`.
- GREEN: add the choice, then the scene's wiring test (Options opens the panel, Back reopens the
  menu, and a newly resolved state closes it).
