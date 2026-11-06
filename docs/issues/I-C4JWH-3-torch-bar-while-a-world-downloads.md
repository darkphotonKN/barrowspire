---
id: I-C4JWH-3
status: done
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

- [x] A scene whose preload queued anything shows the bar, filled by `progress`; one that queued nothing shows no bar.
- [x] On `COMPLETE` the bar and everything drawn with it are destroyed before eviction and before `create` (test with a fake scene and loader).
- [x] A scene stopped mid-load leaves no bar behind.
- [x] PreloadScene's boot screen is unchanged: same elements, text, positions and colours.
- [x] The world's camera after the bar is what it is today (bounds, scroll, zoom at every render scale).
- [x] Typecheck, the full vitest suite, lint and lint:fence pass.

## Blocked By

I-C4JWH-1 (a world scene only downloads once it loads its own groups), I-C4JWH-2 (the `COMPLETE` order: bar, then eviction, then create).

## Spec Reference

FS-C4JWH §D R17–R18, §Edge States ("A world switch while the scene is still downloading", "The bar's steps"); user stories 8, 9.

## TDD Approach

- RED: a fake scene that queues one file shows the bar and tears it down before `create`; one that queues nothing never builds it.
- GREEN: the shared bar, PreloadScene on it, the per-scene preload showing it.

## Commits

2ac48391 (tests), b6ed390b (client), on `feat/client-scene-art-loading`.

Proof: `evict.test.ts` "the loading bar on the same complete" (order bar shown → bar destroyed →
evictions → create; progress 0, ¼, ½, ¾, 1 over the run's four pages; no bar when nothing is
queued; a bar when only the manifest loads; a stop mid-load leaves it to the display list),
`torchBar.test.ts` (the seven objects, the stage centred in a wider view, the fill, destroy and
destroyBar, the vignette's relayout cancelled), `PreloadScene.test.ts` (a snapshot of every object,
argument and call on the boot screen recorded on the old PreloadScene, matched by the new one),
`camera.test.ts` "releaseStage" (at render scale 1, 1.5 and 2 a world's camera after the bar has the
bounds, scroll, zoom and follow of a fresh one, through a re-fit), and each scene's bar test (hub,
forest, run: drawn while downloading and all destroyed by create; re-entry and the menus: none).

Two things found on the way, both handled in the bar rather than the scenes: `centreStage` is
remembered per camera and re-applied by every re-fit, so the bar releases it (`releaseStage`); and
`sharpenText` would permanently rewrap a world scene's `add.text`, so the bar sets its own texts'
resolution instead. Each world sets its own camera background in create, over the backdrop's soot.
Full suite 5441 passed, tsc clean, lint no errors, lint:fence verified.
