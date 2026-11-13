---
id: I-WDM0X-1
status: done
implements: FS-WDM0X
blocked_by: []
labels: [ready-for-agent]
title: "FS-WDM0X slice 1: the interface sound effects module, its level, boot loading with m4a fallbacks, and the OPTIONS Sound effects row (game-client)"
---
Implements FS-WDM0X §Requirements (B, C, D, E, F; the A rule S8 and wrapper S9 as functions), §Acceptance Criteria (The rule, The player, The level, OPTIONS, Loading)

**Lane: agent.** game-client only. No scene wiring: no `HubScene.ts`, `FieldScene.ts` or
`BarrowspireScene.ts` change (slices 2 and 3).

## What to Build

The foundation, playable once a scene calls it. The OPTIONS row works in every world from this
slice on, because the panel makes its own control (S19).

- **`audio/sfxSetting.ts`**, shaped as `musicSetting.ts`:
  - `SFX_SETTING_KEY = "barrowspire_sfx"`, `SFX_MAX_GAIN = 1.0`, `SFX_DEFAULT_LEVEL = 3`;
  - the gain per level, derived from the cap;
  - a clamp, and a guarded read and write (`"0"`–`"5"`; anything else, absent or throwing → 3);
  - a stored-only level control;
  - the browser store.
- **`audio/uiSounds.ts`**:
  - **The 11 effects:** their keys (`sfx:<name>`) and URLs (`[/audio/sfx/<name>.m4a,
    /audio/sfx/<name>.ogg]`), and a `preloadUiSounds(scene)` that queues them.
  - **The S8 rule:** a pure function of before/after window state (ESC menu slot, letter, party,
    inventory, character) that returns at most one effect. The order is menu, letter, party,
    inventory, character: opens first, then closes.
  - **The S9 wrapper:** `act(run)` reads a window state the scene supplies before and after `run`
    and plays the rule's effect. A nested `act` joins the outer one.
  - **The player:** `play(effect)` plays only when all hold: the level read at the play is above
    0, the context runs (the `HubMusic` check), and the key is cached. It plays one sound per key
    per game (`sound.get(key) ?? sound.add(key)`), restarted on a repeat, at the level's gain set
    on the sound. It never touches pitch/rate/detune or the manager's `volume`/`mute`, and never
    queues.
  - **The stage:** Phaser-free behind a narrow stage (as `sceneMusicStage`), with a
    `sceneUiSoundStage(scene)`.
- **`PreloadScene`** calls `preloadUiSounds(this)` beside `preloadArt`.
- **`ui/optionsPanel.ts`:** `settingRows` gains **Sound effects** under **Music** (5 steps). Its
  control is an optional `effects` on the spec, else the stored-only control made as the panel
  opens. ←/→ (`nudge`) stay on row 0, Music.
- **`public/audio/sfx/`:** the owner's 11 `.ogg` files, plus 11 `.m4a` made with
  `afconvert -f m4af -d aac -b 96000 -q 127 <name>.ogg <name>.m4a`. Check each with `afinfo`:
  `m4af`, `aac`, mono, 44.1 kHz, duration within 10 ms of the ogg. A trial on 2026-11-13 made all
  11 cleanly, 118 KB in all. If `afconvert` fails on any file, stop and report; do not substitute
  another tool.

## Files it expects to touch

- `game-client/src/audio/sfxSetting.ts` (new), `game-client/src/audio/sfxSetting.test.ts` (new)
- `game-client/src/audio/uiSounds.ts` (new), `game-client/src/audio/uiSounds.test.ts` (new)
- `game-client/src/scenes/PreloadScene.ts`, `game-client/src/scenes/PreloadScene.test.ts`
- `game-client/src/ui/optionsPanel.ts`, `game-client/src/ui/optionsPanel.test.ts`
- `game-client/public/audio/sfx/*.ogg` (the owner's 11, now committed), `game-client/public/audio/sfx/*.m4a` (11 new)
- `game-client/src/render/art/artLoader.standin.ts` only if the stand-in cannot already record an
  audio file's URL list (it records key and URLs today)

## Acceptance Criteria

- [ ] The rule's table test (FS §Acceptance Criteria, The rule), the nested `act`, and nothing
      played outside `act`.
- [ ] The player tests (The player): the gain at each level, restart rather than a second sound,
      silence at level 0 / context not running / uncached, nothing late once the context runs, no
      pitch and no manager volume or mute.
- [ ] The level tests (The level), including a write between two plays heard on the second.
- [ ] OPTIONS shows Music then Sound effects. The Sound effects row's ◄/►/steps work as Music's
      do and write `barrowspire_sfx`. ←/→ move Music only. A change plays nothing. The existing
      OPTIONS tests stay green, updated only for the taller panel.
- [ ] `PreloadScene` queues the 11 effects as `[m4a, ogg]` and still starts the main menu.
- [ ] The 22 files are in `public/audio/sfx/`, the m4a ones checked with `afinfo`.
- [ ] `gameAudio.ts`, `hubMusic.ts` and `musicSetting.ts` unchanged.
- [ ] `npx vitest run --maxWorkers=4 --minWorkers=1`, `npx tsc --noEmit -p .`, `npm run lint` pass.

## Blocked By

None

## Spec Reference

FS-WDM0X §Requirements S8–S23 (S8/S9 as functions only), User Stories 18–29, Edge States
(before the first gesture, level 0, storage blocked, another tab, an effect failed to load).

## TDD Approach

- RED: `uiSounds.test.ts`. The rule's table, e.g. the menu slot opening over open gear → `settings_open`.
- GREEN: the pure rule, then the player behind a fake stage, then the setting, then the panel row.
