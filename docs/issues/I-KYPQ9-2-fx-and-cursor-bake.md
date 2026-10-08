---
id: I-KYPQ9-2
status: done
implements: FS-KYPQ9
blocked_by: []
labels: [ready-for-agent]
title: "FS-KYPQ9 slice 2: bake the fx texture set and the two cursors, plus a shared cursor helper"
---
Implements FS-KYPQ9 §B.10, §H.2, §0.5–§0.7

**Can run in parallel with I-KYPQ9-1.** This slice is the first of the two bake slices.
`tools/bake/page/catalogue.js` and `public/art/manifest.json` are rewritten by every bake, so the
other bake slice (I-KYPQ9-3) waits for this one.

## Files owned

- `game-client/tools/bake/page/models/fx.js` (new) and `game-client/tools/bake/page/models/cursors.js`
  (new, or one module for both).
- `game-client/tools/bake/page/catalogue.js`, adding the `fx` group and the cursor sheets.
  **Shared with I-KYPQ9-3, which follows this slice.**
- `game-client/public/art/**`: the new `fx-*.png` atlas, any atlas the packer reflows, and
  `manifest.json`. **Shared with I-KYPQ9-3, which follows this slice.**
- `game-client/src/render/art/manifest.ts` (only if the schema needs a new `kind`) and
  `game-client/src/render/art/manifest.test.ts`.
- `game-client/src/render/cursors/**` (new): a pure helper that turns a manifest cursor sheet
  into a CSS cursor string, plus its test.

**Not touched:** `src/scenes/**`. Installing the cursors is I-KYPQ9-5 (run) and I-KYPQ9-4 (hub).

## What to Build

1. **The fx sheet set** (§B.10), authored in code (ADR-0021). The textures are:
   - `fx_slash`: a ground smear with a heavier leading edge;
   - `fx_dust`, `fx_ember`, `fx_smoke`;
   - `fx_fire_core`: baked `ember` → `amberBright`;
   - `fx_scorch`;
   - `fx_glow`: a soft ground decal;
   - `fx_escape_column`;
   - `fx_arrow`: shaft, iron head and fletching, side-on.

   Each texture is neutral or light enough to take a `BARROW` tint at runtime. Colours used in
   the bake come only from `BARROW` through `tools/bake/page/palette.js` (§0.7), and randomness
   is seeded (§0.6). Each manifest source reads `authored: tools/bake/page/models/fx.js#<fn>`
   with the project licence (§0.5).
2. **The two cursors** (§H.2): `cursor_gauntlet`, an iron-and-leather gauntlet in
   `slate`/`slateLight`/`vellumDark`/`brass`, and `cursor_strike`, a brass ring with `amber`
   ticks and `oxblood` pips. Both are 32×32 and linearly filtered. Each cursor's manifest anchor
   is its hotspot: the fingertip for the gauntlet, the centre for the strike-mark.
3. **The cursor helper**: `cursorCss(name, fallback)` returns the CSS `cursor` value
   (`url(...) x y, <fallback>`), with the hotspot taken from the manifest anchor and scaled with
   the image. It falls back to the plain `fallback` (`default`/`crosshair`) when there is no
   manifest, the sheet is missing, or its atlas did not load. You choose how the image URL is
   produced, either cropping the frame from the loaded atlas to a data URL or having the bake
   emit standalone cursor PNGs. Record the choice in the helper's doc comment.

## Acceptance Criteria

- [x] The manifest schema vitest covers every new sheet: frame size, anchor, directions and
      frame counts are set, and source reads `authored: <module>` with the project licence.
- [x] Cursor helper vitest:
  - the hotspot equals the manifest anchor scaled to the emitted image size;
  - with no manifest, or no sheet, it returns exactly `default` / `crosshair`.
- [x] `npm run bake` then `npm run bake -- --check` exits 0 with no drift. A second
      `npm run bake` leaves `git status -- public/art` unchanged.
- [x] Every atlas in `public/art/` is ≤ 4096².
- [x] No `0x`/`#` colour literal in the new bake modules or in `src/render/cursors/`. Colour
      comes only from `BARROW`.
- [x] `git diff -- game-server/` and `git status --porcelain -- game-server/` are empty.
- [x] From `game-client/` with `export PATH=~/.nvm/versions/node/v22.13.1/bin:$PATH`:
      `npm test`, `npm run lint` and `npm run lint:fence` pass.
- [ ] Visual check by the coordinator against the Reference (guideline Part I and the shipped
      FS-2325V look), using the contact sheet or a 2× crop of each fx frame and cursor. Not a
      HITL gate.
- [x] No commits.

## Blocked By

None

## Spec Reference

FS-KYPQ9 §B.10 (baked textures, play nothing without a manifest), §H.2 (the baked cursors and
their hotspots), §0.5–§0.7 (authored, deterministic, `BARROW` only). User stories 22 and 29.

## TDD Approach

- RED: the manifest schema test expecting `fx_slash` … `fx_arrow`, `cursor_gauntlet` and
  `cursor_strike` with `authored:` sources. Then the cursor-helper test for the hotspot and the
  fallback.
- GREEN: author the models, register them in the catalogue, bake, and write `cursorCss`.
