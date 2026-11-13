---
id: I-28DDG-4
status: done
implements: FS-28DDG
blocked_by: []
labels: [ready-for-agent]
title: "FS-28DDG slice 4: the shared OPTIONS panel with a Music level slider, opened from the town's and the field's ESC menus (game-client)"
---
Implements FS-28DDG §Change: Music volume in an Options panel

**Lane: agent.** game-client only. Not `BarrowspireScene.ts` (that is I-28DDG-5).

## What to Build

The music's level, 0 to 5, replaces the on/off setting.

- `musicSetting.ts` keeps the level as `"0"`–`"5"` under `barrowspire_music` and migrates the
  old values on read (`"off"` → 0; `"on"`, absent, unknown or a throwing read → 3). Every access
  stays guarded. It also exports a control that only reads and writes the stored level, for
  worlds with no music.
- The gain is `MUSIC_MAX_GAIN × level / 5`, with `MUSIC_MAX_GAIN` = 0.5 (temporary) and
  `MUSIC_DEFAULT_LEVEL` = 3, so the default plays at 0.3.
- `HubMusic` takes a level in place of on/off:
  - between two audible levels it ramps over `MUSIC_LEVEL_RAMP_MS` (200 ms) on the game's step;
  - a change during a fade-in retargets the fade;
  - level 0 is the old off path (fade out, stop, start nothing on entry), and a change from 0
    fades in over `MUSIC_FADE_IN_MS`;
  - a hub entry fades in to the stored level.
- A new shared module, `ui/optionsPanel.ts`:
  - It exports the **Options** menu choice and a function that opens the **OPTIONS** panel at
    the camera's centre in the popup band: `drawPanelFrame` with its ×, the `OPTIONS` title by
    `drawPanelTitle`, `OPTIONS_WIDTH` wide.
  - Its setting rows come from a list, with **Back  [Esc]** at the foot. v1 has one row:
    **Music** ◄ five steps ►. The arrows and steps are drawn in code from `MenuTones`, never as
    text glyphs.
  - Clicks on the arrows (clamped, an arrow at its end dimmed) and on a step set the level, and
    so do ←/→ while the panel is open.
  - It has a blocker, as the menu has, and re-centres on resize.
  - It takes the scene's tones, origin, hit size, Menu-icon `through`, a *Back* callback and a
    music level control.
- `hubMenuChoices` always includes Options before *Back* and drops its music parameter.
- HubScene and FieldScene open the panel from the row, holding it in their menu slot so every
  menu guard holds:
  - *Back*, Esc and × reopen that scene's ESC menu, rebuilt from its state;
  - the Menu icon closes the panel and opens nothing;
  - ←/→ are routed to the panel: HubScene in `offerMenu`, FieldScene through its key listeners.
- The town passes `HubMusic` as the control and the field passes the stored-only control.
  `switchMusic` and the on/off labels go.

## Files it expects to touch

- `game-client/src/audio/musicSetting.ts`, `game-client/src/audio/musicSetting.test.ts`
- `game-client/src/audio/hubMusic.ts`, `game-client/src/audio/hubMusic.test.ts`
- `game-client/src/ui/optionsPanel.ts` (new), `game-client/src/ui/optionsPanel.test.ts` (new)
- `game-client/src/scenes/hubMenu.ts`
- `game-client/src/scenes/HubScene.ts` (menu and music wiring only), `game-client/src/scenes/HubScene.test.ts`
- `game-client/src/scenes/FieldScene.ts` (menu wiring only), `game-client/src/scenes/FieldScene.test.ts`
- `game-client/src/ui/menuPanel.ts` only if the panel reuses a piece not yet exported

## Acceptance Criteria

- [ ] `hubMenuChoices({ queued })` is `change`, [`leave`], `options`, `back`. The field's menu is
      `change`, `options`, `back`.
- [ ] *Options* (a click or its number key) in the town and in a field closes the menu and opens
      the shared OPTIONS panel. The panel has its frame, the centred `OPTIONS` title, the Music
      row and *Back  [Esc]*.
- [ ] A second row entry in the panel's list lays out under Music with no layout-code change
      (test).
- [ ] ◄/► clicks and ←/→ change the level by one, clamped, with the arrow at its end dimmed and
      ignored. A click on step *k* sets *k*. A, D, Enter and the number keys do nothing while
      the panel is open.
- [ ] *Back*, Esc and × reopen that world's ESC menu. The Menu icon closes the panel and opens
      nothing.
- [ ] While the panel is open no `move` is sent and the menu's guards hold. The blocker takes
      every press and hover except the Menu icon's. The panel re-centres on resize.
- [ ] `MUSIC_MAX_GAIN` = 0.5, `MUSIC_DEFAULT_LEVEL` = 3 and `MUSIC_LEVEL_RAMP_MS` = 200. The gains
      are 0, 0.1, 0.2, 0.3, 0.4 and 0.5, derived from the cap. The sound manager's
      `volume`/`mute` are never written.
- [ ] Hub entry at n > 0 fades in to n's gain over 2000 ms, and at 0 plays nothing.
      Audible↔audible changes ramp over 200 ms from where the volume stands. A change during a
      fade-in retargets it. A change to 0 fades out over 1000 ms and stops. A change from 0
      fades in over 2000 ms. There is never a second sound. Tested with a fake sound and clock.
- [ ] A change in a field writes the level and plays nothing. The next hub entry fades in to it.
- [ ] Storage: `"0"`–`"5"` round-trip, `"off"` → 0, and `"on"`, absent, unknown or a throwing
      store → 3. A throwing write is swallowed.
- [ ] No ◄ ► ■ □ text glyph and no emoji. Colours come from `MenuTones` only.
- [ ] `npx vitest run --maxWorkers=4 --minWorkers=1`, `npx tsc --noEmit -p .` and `npm run lint`
      pass.

## Blocked By

None (I-28DDG-1 and I-28DDG-2 are done).

## Spec Reference

FS-28DDG §Change: Music volume in an Options panel: C1–C16 for the town and the field, the
Acceptance Criteria's "Options row", "panel" and "level" groups, and every Edge State except the
run's.

## TDD Approach

- RED: `musicSetting.test.ts`: `"off"` reads 0 and `"on"` reads 3. Then `hubMusic.test.ts`: a
  level change from 3 to 5 ramps 0.3 → 0.5 over 200 ms of fake steps.
- GREEN: the level setting and `HubMusic.setLevel`. Then the panel module's layout and
  key/click tests, then the scene wiring.
