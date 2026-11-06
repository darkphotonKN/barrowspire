---
id: I-C4JWH-3
status: open
implements: FS-C4JWH
blocked_by: [I-C4JWH-1, I-C4JWH-2]
labels: []
title: "FS-C4JWH slice 3: a scene that has art to download shows the boot screen's torch bar until it is loaded (game-client)"
---
Implements FS-C4JWH §D (Requirements 17–18)

**Lane: agent (AFK).**

## What to Build

Move PreloadScene's torch bar (backdrop, torch pool, trough, bar, "LIGHTING THE TORCH", "THE SPIRE
IS WAITING", laid out on the stage by `centreStage`, filled from the loader's `progress`,
`PreloadScene.ts:26-103`) into one shared piece of code that returns a handle destroying
everything it drew. PreloadScene draws it from there and looks as today. The per-scene preload
shows it when it queued anything, and not otherwise. On the load's `COMPLETE` the bar is destroyed
first, then eviction (slice 2) runs, then `create`. The scene's `create` sets its own camera as it
does today; check that nothing `centreStage` set for the bar survives into the world's camera
(bounds, scroll, zoom, ADR-0056).

## Files (expected)

- new shared torch-bar module under `src/ui/` (next to `menuChrome.ts`) and its test
- `src/scenes/PreloadScene.ts` (draws the bar from the shared code)
- `src/render/art/phaser.ts` or `sceneArt.ts` (show the bar when something is queued; teardown order on `COMPLETE`)
- `src/scenes/HubScene.ts`, `FieldScene.ts`, `BarrowspireScene.ts` only if the camera after the bar needs a reset

## Acceptance Criteria

- [ ] A scene whose preload queued anything shows the bar, filled by `progress`; one that queued nothing shows no bar.
- [ ] On `COMPLETE` the bar and everything drawn with it are destroyed before eviction and before `create` (test with a fake scene and loader).
- [ ] A scene stopped mid-load leaves no bar behind.
- [ ] PreloadScene's boot screen is unchanged: same elements, text, positions and colours.
- [ ] The world's camera after the bar is what it is today (bounds, scroll, zoom at every render scale).
- [ ] Typecheck, the full vitest suite, lint and lint:fence pass.

## Blocked By

I-C4JWH-1 (a world scene only downloads once it loads its own groups), I-C4JWH-2 (the `COMPLETE` order: bar, then eviction, then create).

## Spec Reference

FS-C4JWH §D R17–R18, §Edge States ("A world switch while the scene is still downloading", "The bar's steps"); user stories 8, 9.

## TDD Approach

- RED: a fake scene that queues one file shows the bar and tears it down before `create`; one that queues nothing never builds it.
- GREEN: the shared bar, PreloadScene on it, the per-scene preload showing it.
