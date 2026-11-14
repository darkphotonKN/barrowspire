---
id: I-AND39-1
status: done
implements: FS-AND39
blocked_by: []
labels: [ready-for-agent]
title: "FS-AND39 slice 1: the 11 gameplay effects built in code, installed at boot, and a player in each world (game-client)"
---
Implements FS-AND39 §Requirements B, C, D, F

**Lane: agent.** Hotspots: `BarrowspireScene.ts`, `FieldScene.ts` and `HubScene.ts`. Touch each
scene's `create` only, beside `mountUiSounds`, to make the gameplay player. Nothing calls it yet.

## What to Build

- `src/audio/gameplaySfx.ts`:
  - the seeded PRNG;
  - a tunables table keyed by effect (length ≤ 0.6 s, seed, trim, recipe numbers);
  - `GAMEPLAY_SFX_CEILING` = 0.7;
  - one pure generator per effect, `(sampleRate) → Float32Array`, mono.

  Each generator follows R10's starting character, from wood, leather, iron, cloth and flesh
  sounds. It fades to 0 at both ends and is peak-normalised to the ceiling × its trim (R9–R11).
  The module imports no Phaser or Web Audio and never calls `Math.random`.
- `src/audio/gameplaySounds.ts`:
  - the 11 effect names and their keys, `sfx:<name>`;
  - the boot install: on a stage with a Web Audio context, render each effect at
    `context.sampleRate`, `createBuffer(1, n, rate)`, copy the samples in, and `cache.audio.add`
    it. With no context, add nothing. An effect that throws is skipped (R12).
  - the player, on `sceneUiSoundStage`: FS-WDM0X's checks (level read at each play, level 0, not
    running, not cached, one sound restarted, `sfxGain(level)` on the play; R13). Lifting the
    shared play body out of `UiSounds.play` is allowed only if `uiSounds.test.ts` passes
    unchanged.
- `PreloadScene`: install the effects (after `preloadUiSounds`, or in `create` before the main
  menu starts). The FS-WDM0X loading is unchanged.
- HubScene, FieldScene and BarrowspireScene: make the gameplay player in `create`, beside
  `mountUiSounds`, held for the later slices to call (R16).

## Acceptance Criteria

- [ ] Every criterion under *The generators*, *Loading* and *The player* in FS-AND39.
- [ ] `uiSounds.test.ts`, `sfxSetting.ts`, `gameAudio.ts` and `worldMusic.ts` are unchanged.
- [ ] Tests pass: full vitest, tsc, lint, lint:fence.

## Blocked By

None

## Spec Reference

FS-AND39 §Requirements R9–R14, R16; user stories 20–26, 28–30.

## Files it expects to touch

- `game-client/src/audio/gameplaySfx.ts` (+ `.test.ts`), new
- `game-client/src/audio/gameplaySounds.ts` (+ `.test.ts`), new
- `game-client/src/audio/uiSounds.ts` (only if the play body is lifted; behaviour unchanged)
- `game-client/src/scenes/PreloadScene.ts` (+ `PreloadScene.test.ts`)
- `game-client/src/scenes/HubScene.ts` (~984 `mountUiSounds`), `FieldScene.ts` (~385),
  `BarrowspireScene.ts` (~3297): the player's construction only

## TDD Approach

- RED: `hit_monster` at 48000 Hz is ≤ 28800 samples, starts and ends at 0, and peaks at
  0.7 × trim.
- GREEN: the PRNG, one thump-plus-noise recipe and the normaliser. Then the other 10 effects and
  the determinism test, then the install against a stand-in context, then the player against a
  fake stage.
