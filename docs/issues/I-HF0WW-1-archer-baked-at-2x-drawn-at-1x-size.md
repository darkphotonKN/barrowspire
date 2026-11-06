---
id: I-HF0WW-1
status: done
implements: FS-HF0WW
blocked_by: []
labels: []
title: "FS-HF0WW slice 1: the archer baked at 2x and drawn at exactly his 1x size (game-client)"
---
Implements FS-HF0WW §A (Requirements 1–9), §E (Requirement 27)

**Lane: agent (AFK), retroactive.** Built on `spike/archer-2x` before this work order was written;
rebased onto local main 750787ce (Phaser 4.2.1) and re-verified on 2026-11-06.

## What to Build

The archer's sheet baked at `scale` 2 (rendered at 4x, box-filtered to 2x, its own `archer` group),
the manifest carrying `scale`, and the client drawing any scaled sheet at 1/`scale` so that the
archer stands, carries his markers, collides and frames in the menus exactly as the 1x archer did.

- Bake: `page/baker.js` `bakeCharacter({ scale })`, `page/main.js`, `page/catalogue.js`,
  `characters/cast.js`; crown and length measured at 1x (`lib/downscale.mjs`, `bake.mjs`).
- Manifest: `scale` validated (`src/render/art/manifest.ts`, `sheetScale`).
- Client: `CharacterAnimator.artScale` and `dress(sprite, size)` (`render/art/character.ts`);
  `markerBase(…, artScale)` (`render/markers/markers.ts`) in the hub, run and monster roster;
  `keepBodySize` (`scenes/BarrowspireScene.ts`); `MenuFigure` size and portrait crop
  (`render/art/menuFigure.ts`); bust portrait from the whole frame (`ui/bustPortrait.ts`).

## Acceptance Criteria

- [x] The archer's manifest entry: `scale: 2`, 326×288 frames, anchor (0.4233, 0.75), crown 78.
- [x] The validator rejects a `scale` that is not a whole number 1–4 and a frame size not a multiple of it.
- [x] In world units the 2x archer's display size, origin and feet equal the 1x archer's (336 hub frames, 32 silhouettes, 19 menu frames, render scale 1, 1.5, 2; FS-HF0WW § Verification).
- [x] Name plate at the same height over the head (hub −85); the run's arcade body 60×60 at the same offset.
- [x] Menu hero and roster portrait window match the 1x geometry; the bust portrait reads the whole frame.
- [x] Every sheet but the four classes is pixel-identical to local main's (171 sheets, every frame).
- [x] Tests pass (`npx vitest run`, `npx tsc --noEmit`, `npm run lint`, `npm run lint:fence`); `npm run bake -- --check` reports no changes.

## Blocked By

None

## Spec Reference

FS-HF0WW §A R1–R9, §E R27; user stories 1–7, 17, 20–22.

## Commits

dad36090 (bake), 3a633718 (client), 8bb9ad9c (art), on `feat/client-archer-2x-art`.
