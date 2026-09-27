---
id: I-2325V-2
status: done
implements: FS-2325V
blocked_by: []
labels: [ready-for-agent]
title: "FS-2325V slice 2: build-time bake pipeline, world/prop atlases, manifest, art loader"
---
Implements FS-2325V §B

**Wave 1. Runs in parallel with I-2325V-1.** New files only: `game-client/tools/bake/`,
`game-client/public/art/`, `game-client/src/render/art/`, plus `package.json` devDependencies and
the `bake` script. **No scene edits.**

## What to Build

The pipeline that turns 3D models into the committed 2D art every later slice consumes. The
throwaway spike (see the FS summary) is the visual reference for materials, lighting and foliage.

1. **`tools/bake/`**: a three.js bake page driven by **Playwright headless Chromium**, run via
   `npm run bake`.
   - Camera: orthographic, 30° elevation, 45° azimuth (must match slice 1's projection: 1 world
     unit on the diamond = 64 px wide).
   - Renderer: ACES tone mapping, PMREM `RoomEnvironment` (envMapIntensity 1.0 for metals, 0.3
     otherwise), warm key light from screen-left with shadows falling screen-right, shadow
     catcher.
   - Rendered at 2× and downsampled to 1× with high-quality smoothing.
   - Seeded randomness, so bakes are deterministic.
   - three.js and Playwright are **devDependencies only**.
2. **World and prop art:**
   - ground tiles (grass, dirt, cobble, flagstone, and transitions) plus tuft and pebble decals;
   - wall pieces: plain, brace, window (emissive leaded glass) and torch sconce, at back and
     cut-away heights, for both axes;
   - corner posts and roof pieces;
   - trees: leaf-card foliage (not faceted blobs), oaks including one autumn-warm variant, and
     pines; plus bushes and rocks;
   - interactables, one frame per state:
     - door: locked, unlocked, open;
     - escape door: locked, unlocked, open;
     - switch: inactive, active;
     - chest/container: closed, open;
   - lamp post, brazier, table, chairs, barrels;
   - **item icons** for the container view, plus a generic fallback icon.

   Material colours are drawn from `BARROW` in `src/utils/theme.ts` (ADR-0013).
3. **Output:** `public/art/` atlases, each ≤ 4096², plus `manifest.json`. Per sheet, the
   manifest records:
   - frame size and anchor;
   - directions, frame counts and fps;
   - optional light source (offset, radius, colour, flicker);
   - source and licence.
4. **`src/render/art/`**: loads the manifest, registers atlases and animations in Phaser, and
   exposes a sprite/animation factory keyed by manifest names. It falls back gracefully (logs,
   returns a placeholder) when a sheet or the manifest is missing.
5. `tools/bake/sources/` is gitignored (future licensed models live there; slice 5).

## Acceptance Criteria

- [ ] `npm run bake` produces the atlases and `manifest.json`; a second run with unchanged inputs
      produces **no git diff**.
- [ ] vitest: manifest schema test. Every sheet has frame size, anchor, directions and frame
      counts; light sources are well-formed; source/licence is present on every sheet.
- [ ] vitest: loader resolves a manifest name to atlas/frame and returns a placeholder for an
      unknown name.
- [ ] three.js and Playwright only in `devDependencies`; `next build` output contains neither.
- [ ] `tools/bake/sources/` is gitignored.
- [ ] `git diff main... -- game-server/ game-client/src/scenes/` is empty.
- [ ] `npm run lint`, `npm run lint:fence`, `npm test` pass.

## Blocked By

None

## Spec Reference

FS-2325V §B.1–B.7. User stories 2, 19, 22, 23, 24, 25.

## TDD Approach

- RED: `manifest.test.ts` against a fixture manifest, rejecting a sheet missing its anchor.
- GREEN: manifest types + validator in `src/render/art/manifest.ts`; the bake writes a manifest
  that passes it.
