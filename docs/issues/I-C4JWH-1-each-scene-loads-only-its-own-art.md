---
id: I-C4JWH-1
status: done
implements: FS-C4JWH
blocked_by: []
labels: []
title: "FS-C4JWH slice 1: boot loads only the resident groups, each scene loads its own scene-scoped groups from one table, a coverage test holds the table (game-client)"
---
Implements FS-C4JWH §A (Requirements 1–5), §B (Requirements 6–10), §E (Requirements 19–21)

**Lane: agent (AFK).**

## What to Build

The table of FS-C4JWH §A R4 in `src/render/art` (one declarative table: scene → the scene-scoped
groups it holds; every group it does not name is resident). `preloadArt` takes the scene's entry
and queues the manifest if not cached, every resident atlas not yet a texture, and its own groups'
pages not yet a texture, nothing else. PreloadScene, MainMenuScene and CharacterCreationScene load
the resident groups only (`preloadMenuArt` goes, or becomes that). HubScene loads folk,
BarrowspireScene creatures and boss, FieldScene its field's group, its field id taken in
`init(data)` before `preload()` (Phaser passes start data to `init` and `create` only); an unknown
field takes gentle_meadows' entry. `registerArt` warns once per atlas the scene expected that is
not a texture, and says nothing about atlases outside the scene's set. A sheet whose group is not
loaded in this scene draws the placeholder with one warning naming the sheet (the existing
`ArtLibrary` path; check the warning names it).

No eviction yet (slice 2): after this slice, groups accumulate as scenes are visited, but boot
holds about 200 MB and no scene draws a placeholder it did not before. No bar yet (slice 3): a
world scene that downloads shows its blank canvas while it does, as today.

## Files (expected)

- new `src/render/art/sceneArt.ts` (the table, the scene's set of atlas keys from the manifest) and `sceneArt.test.ts` (the table's behaviour, the coverage test)
- `src/render/art/phaser.ts`, `phaser.test.ts` (`preloadArt` by scene entry, `registerArt`'s warnings)
- `src/render/art/library.ts`, `library.test.ts` (only if the placeholder warning must name the sheet and why)
- `src/render/art/menuFigure.ts` (`preloadMenuArt`)
- `src/scenes/PreloadScene.ts`, `MainMenuScene.ts`, `CharacterCreationScene.ts`, `HubScene.ts`, `FieldScene.ts` (`init(data)`), `BarrowspireScene.ts` (their `preload()` calls)
- read, not changed: `src/render/art/hubFolk.ts`, `src/render/creatures/monsters.ts`, `public/art/manifest.json`

## Acceptance Criteria

- [x] The table has exactly FS-C4JWH §A R4's rows; a group it does not name is resident; every group it names exists in the real manifest.
- [x] PreloadScene queues the manifest and the resident pages only (17 pages: the 4 class groups and the 13 small ones).
- [x] Each scene queues its own groups' pages and any resident page not yet a texture, and nothing else; a scene whose set is loaded queues nothing.
- [x] FieldScene queues wildlife for gentle_meadows and for an unknown field, fodder for forlorn_forest, its id read in `init`.
- [x] BarrowspireScene queues creatures and boss at entry.
- [x] `registerArt` warns once for an expected atlas that is not a texture, and never for an atlas outside the scene's set.
- [x] A sheet whose group is not loaded draws the placeholder with one warning naming the sheet; nothing throws.
- [x] The coverage test (FS-C4JWH §E R21) passes against the real manifest, `folkLook`'s sheets and `MONSTER_LOOKS`, and fails when a folk sheet or a monster look sits on a group its scene does not hold, or a `MONSTER_LOOKS` archetype is met by no scene.
- [x] No change under `tools/bake/`, `public/art/` or `game-server/`.
- [x] Typecheck, the full vitest suite, lint and lint:fence pass.

## Blocked By

None.

## Spec Reference

FS-C4JWH §A R1–R5, §B R6–R10, §E R19–R21; user stories 1–7, 11, 12, 14–17.

## TDD Approach

- RED: a scene entry's queued atlas keys against a fake loader and the real manifest (the hub queues `folk-0` and no other scene-scoped page; the run `creatures-0/1`, `boss-0/1`); the coverage test.
- GREEN: the table and `preloadArt` by scene entry; then the scenes' `preload()` calls and FieldScene's `init`.

## Commits

66494921 (tests), 9b092cae (client), on `feat/client-scene-art-loading`.

Proof: `sceneArt.test.ts` (the table, the 17 resident pages, each scene's set against the real
manifest, the coverage test and its own failure cases), `phaser.test.ts` ("by the scene's own
groups": queueing, warnings, the placeholder naming sheet and atlas), and each scene's "art loading"
block (`HubScene`, `FieldScene` with its id read in `init`, `BarrowspireScene`, `MainMenuScene`,
`CharacterCreationScene`). PreloadScene's call is `preloadArt(this, RESIDENT_ART)`, the case the
17-page test covers. The gallery (dev only, not in the table) loads resident art too. Full suite
5407 passed, tsc clean, lint no errors, lint:fence verified.
