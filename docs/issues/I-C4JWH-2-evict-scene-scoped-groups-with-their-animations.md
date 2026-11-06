---
id: I-C4JWH-2
status: open
implements: FS-C4JWH
blocked_by: [I-C4JWH-1]
labels: []
title: "FS-C4JWH slice 2: once a scene's preload completes, the scene-scoped groups it does not hold are evicted with their animations (game-client)"
---
Implements FS-C4JWH §C (Requirements 11–16)

**Lane: agent (AFK).**

## What to Build

After the new scene's preload completes and before its `create` builds anything, evict every page
of every scene-scoped group that is a texture and not in the scene's set (ADR-0059). For each page:
first `scene.anims.remove` every animation registered on it (each sheet, clip and direction whose
frames sit on that page: `animationName` with `animationAtlas`, as `registerFrames` builds them),
then `scene.textures.remove` the page. The menus evict every scene-scoped group. Hook it where no
scene can forget it: a loader `COMPLETE` listener added by the per-scene preload of slice 1 runs
before the scene manager's own, which calls `create` (Phaser 4.2.1 `SceneManager.bootScene`); with
nothing queued, `start` completes synchronously and the same listener runs.

Check, and state in the code where it holds: no module-level state keeps a frame, texture or
animation of a scene-scoped group (ADR-0059 Decision 5). The bust portrait's `figureCache` keeps
numbers only; cursors and item icons are copies.

## Files (expected)

- new `src/render/art/evict.ts` (or in `sceneArt.ts`) and its test
- `src/render/art/phaser.ts`, `phaser.test.ts` (the `COMPLETE` hook in the per-scene preload; a re-load after eviction registers fresh frames and animations)
- `src/render/art/sceneArt.ts` (the scene's set, from slice 1)

## Acceptance Criteria

- [ ] After a scene's preload completes, the atlas textures are exactly the resident pages plus its own groups' pages; this holds before its `create` runs (a test with a fake scene whose `create` asserts it).
- [ ] Every animation registered on an evicted page is gone from the animation manager; animations on kept pages stay.
- [ ] A scene re-entered evicts nothing and queues nothing.
- [ ] An evicted page queued again is registered anew: its frames and animations exist and play (test: register, evict, re-load, register).
- [ ] Entering MainMenuScene or CharacterCreationScene evicts every scene-scoped group.
- [ ] No module-level frame, texture or animation of a scene-scoped group (reviewed; noted in the code where a cache keeps only numbers).
- [ ] Typecheck, the full vitest suite, lint and lint:fence pass.

## Blocked By

I-C4JWH-1 (the table and the per-scene preload).

## Spec Reference

FS-C4JWH §C R11–R16; ADR-0059 Decisions 3–5; user stories 1, 10, 13, 18.

## TDD Approach

- RED: fake texture and animation managers holding the hub's set plus `wildlife-0/1` and their boar animations; completing the hub's preload leaves no `wildlife-*` texture and no boar animation.
- GREEN: the eviction and its `COMPLETE` hook.
