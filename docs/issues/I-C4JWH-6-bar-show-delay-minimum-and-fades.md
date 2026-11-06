---
id: I-C4JWH-6
status: done
implements: FS-C4JWH
blocked_by: [I-C4JWH-3]
labels: []
title: "FS-C4JWH slice 6: the torch bar waits 300 ms, stays at least 600 ms and fades; a world fades in (game-client)"
---
Implements FS-C4JWH §Amendment 2026-11-06 (A1.1–A1.9), amending §D R17

**Lane: agent (AFK).**

## What to Build

One pacing module, `src/render/art/loadPace.ts`, holding the four durations as named constants
(show delay 300, minimum visible 600, bar fade 150, world fade 200) and the steps of a scene's
load: no bar unless the load still runs at 300 ms; once shown, the bar fades in, stays at least
600 ms, fades out, is destroyed; then `create`. `preloadArt` runs it when it is given a bar:
eviction stays on the load's completion; `create` is held until the bar is down by taking the
scene manager's own `complete` listener (`SceneManager.loadComplete`, added in `bootScene` after
`preload()` and before `loader.start()`) off the loader on `start` and calling it when the pacing
is done. The fades are the main camera's (`fadeIn` / `fadeOut`, the canvas's soot). The world
scenes (hub, field, run) fade in on create in every case; the menus only after a bar. A stop
cancels every pending step (`onSceneEnd`; on "destroy" the plugins are asked nothing).
PreloadScene is unchanged.

## Files (expected)

- new `src/render/art/loadPace.ts` and its test (fake timers)
- `src/render/art/phaser.ts` (`preloadArt`: the pacing, the hold on create, the fade option)
- `src/render/art/artLoader.standin.ts` (the scene manager's own listener, `start`, the clock, the camera fade)
- `src/render/art/evict.test.ts`, a real-Phaser test of the hold against `SceneManager.bootScene`
- `src/scenes/HubScene.ts`, `FieldScene.ts`, `BarrowspireScene.ts` (the world fade) and their bar tests; the menus' bar tests

## Acceptance Criteria

- [x] A load that completes within 300 ms shows no bar; a world scene fades in over 200 ms.
- [x] A load still running at 300 ms shows the bar, fading in over 150 ms, filled to the progress so far.
- [x] A bar shown stays at least 600 ms (longer while the load runs), fades out over 150 ms, and is destroyed before create; then the world fades in over 200 ms.
- [x] Eviction runs on the load's completion, before create, under the bar if it is up.
- [x] A world scene that queued nothing fades in; a menu that queued nothing does not.
- [x] A stop during the delay, the bar, its fade-out or the wait leaves no pending step and create never runs; a game destroy asks the plugins nothing.
- [x] The durations are named constants in `loadPace.ts`; PreloadScene unchanged.
- [x] Headless browser: a cached switch (no bar, a fade), a ~1.5 s held download (bar ≥ 600 ms, then fades), a switch mid-delay and mid-bar (no error, the hub at exactly its set).
- [x] Typecheck and the full vitest suite pass.

## Blocked By

I-C4JWH-3 (the torch bar on a world entry).

## Spec Reference

FS-C4JWH §Amendment 2026-11-06 (A1), §D R17, §Edge States.

## Commits

ebe662e9 (tests), 2d017420 (client), on `feat/client-scene-loading-fade`.

Proof: `loadPace.test.ts` (the constants; no bar and a world fade within 300 ms; the bar at 300 ms
from the progress so far; 600 ms kept over a load just past the delay, longer over a long one;
create once; a stop during the delay, the bar, the wait and the fade-out leaving no timer; a
destroy asking the clock nothing), `evict.test.ts` "the loading bar, paced" (eviction at the load's
completion under the bar and create at 1050 ms; LOADING behind the bar, RUNNING from create; the
soot fades and their reset for a world and a menu; a stop at each step never creating, its clock
events removed), `pace.phaser.test.ts` (the hold on Phaser 4.2.1's own `SceneManager.bootScene`,
`loadComplete` and `create`), and the hub, field and run bar tests. `PreloadScene.test.ts`'s
snapshot unchanged. Full suite 5489 passed, tsc clean, lint no errors, lint:fence verified.
Browser check: FS-C4JWH § Verification, "After Amendment A1".
