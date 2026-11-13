---
id: I-28DDG-1
status: done
implements: FS-28DDG
blocked_by: []
labels: [ready-for-agent]
title: "FS-28DDG slice 1: the village music loops in the hub, fading in on entry and out on leaving, loaded by the hub and freed after (game-client)"
---
Implements FS-28DDG §Requirements A–E, G (R1–R14, R20–R22)

**Lane: agent.**

## What to Build

A new music module under `game-client/src/audio/` with a Phaser-free core: enter, leave, the
fade-in and fade-out ramps on a clock that outlives HubScene (the game's step or the sound's Web
Audio gain, never HubScene's tweens or timers), one sound per game, a start from the top after a
stop, freeing (destroy the sound, remove the key from `cache.audio`) once the fade-out has ended
and the hub is neither running nor loading, and nothing called on a `"destroy"` end. The tunables
`MUSIC_VOLUME` (0.4), `MUSIC_FADE_IN_MS` (2000) and `MUSIC_FADE_OUT_MS` (1000) are named exports.
HubScene's `preload()` queues `load.audio` for `/audio/music/village.mp3` beside its art. Its
create tells the module the hub was entered, and its `release(end)` tells it the hub was left.
The fade-in waits for the context to run (a suspended context is silent until Phaser's unlock).
A missing or undecodable file leaves the hub as it was. For now the module plays whenever the hub
is entered. Slice 2 adds the on/off setting.

Before writing the fade or unlock code, read `node_modules/phaser/src/sound/` (4.2.1): the
`WebAudioSoundManager` unlock and `locked` handling, `WebAudioSound`'s `volume` setter
(`setValueAtTime`) and its loop source. Don't guess.

## Files it expects to touch

- `game-client/src/audio/hubMusic.ts` (new) and `game-client/src/audio/hubMusic.test.ts` (new)
- `game-client/src/scenes/HubScene.ts` (`preload`, `create`, `release`)
- `game-client/src/scenes/HubScene.test.ts` (if the scene's wiring is asserted there)
- `game-client/public/audio/music/village.mp3` (the owner's file, committed as is)

## Acceptance Criteria

- [ ] FS-28DDG §Acceptance Criteria A, B, C and D hold, tested on the module with a fake sound,
      fake sound manager and fake clock.
- [ ] `gameAudio.ts` and the game config are unchanged. No other scene starts the music.
- [ ] Whole client `npx vitest run --maxWorkers=4 --minWorkers=1`, `npx tsc --noEmit -p .` and
      `npm run lint` pass.

## Blocked By

None

## Spec Reference

FS-28DDG R1–R14, R20–R22; stories 1–11, 16–19, 21–24; Edge States except the toggle and storage ones.

## TDD Approach

- RED: entering the hub adds one looping sound at volume 0 and steps it to 0.4 over 2000 ms once
  the context runs; leaving steps it to 0 over 1000 ms and then stops and frees it.
- GREEN: the module's enter/leave state and ramp, then HubScene's three hooks.
