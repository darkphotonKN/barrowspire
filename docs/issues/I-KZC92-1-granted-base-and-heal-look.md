---
id: I-KZC92-1
status: done
implements: FS-KZC92
blocked_by: [I-1819Q-2]
labels: []
title: "FS-KZC92 slice 1: the granted shimmer base with the heal look, baked and on the gallery (game-client, docs)"
---
Implements FS-KZC92 §A, §B, §D, §E, §F, §H (heal card), §I

## What to Build

The shimmer module and its first concrete shimmer, playable on the dev gallery. No game trigger yet (slice 2).

- **Bake** (R21): add `fx_glint` (four-armed, long vertical arms, short horizontal, small soft core) and `fx_mote` (soft round dot) to `tools/bake/page/models/fx.js` `FX_TEXTURES`, tint-taking like `fx_glow`, seeded so a re-bake is byte-identical. Re-bake; extend the manifest test's fx sheet list. No runtime-drawn textures.
- **Module** (R1–R3, R20, R22–R28): `src/render/effects/shimmer.ts` on the `ParryFx` pattern: a look type (`glint`, `centre`, `light`, all `BARROW` keys), `HEAL_LOOK` (`oxbloodText` / `vellum` / `oxblood`, R4), the granted base (R5–R12: 16 glints over 760 ms ±30 ms, the body scatter, 260–360 ms lives, alpha wink with scale only growing 0.6×→1×, `fx_glow` feet glow 840 ms, one short-lived light radius 110 for 900 ms, all gone by `SHIMMER_GRANTED_MS` = 1150, no body tint). Follows its figure each frame, sorts in front of and behind it, stacks, `forget()` takes everything down, a missing sheet plays nothing and logs once, random source injectable.
- **Gallery card** (R39, FS-1819Q R2): a heal shimmer card, `module: "shimmer"`, in `src/dev/gallery/effects.ts`, playable on the gallery figure.
- **Guideline** (R29, R30): in `game-client/docs/design-guideline.md` Part I, amend the "Gameplay accent" table (Safe / friendly loses healing; a new "Restoring a resource" row, health red) with the amendment note, and add the "Shimmers" section. This is a **rule change**; say so in the commit and the PR.
- **Palette** (R31): `canvasPalette.ts`'s unused `heal` becomes `BARROW_HEX.oxbloodText`, out of the safe group.
- **Vocabulary** (R32): shimmer, granted shimmer, invoked shimmer and look in `game-client/CONTEXT.md` (deferred here because I-1819Q-1 is writing that file in parallel).

Files expected: `game-client/tools/bake/page/models/fx.js`, `game-client/public/art/manifest.json` and the fx atlas image(s) it points at, `game-client/src/render/art/manifest.test.ts`, `game-client/src/render/effects/shimmer.ts`, `game-client/src/render/effects/shimmer.test.ts`, `game-client/src/dev/gallery/effects.ts`, `game-client/docs/design-guideline.md`, `game-client/src/utils/canvasPalette.ts`, `game-client/CONTEXT.md`. No other file under `src/render/effects/` changes.

## Acceptance Criteria

- [ ] `fx_glint` and `fx_mote` are in the manifest, authored by `fx.js`, covered by the manifest test; a re-bake is byte-identical. A contact sheet of the two textures (tinted with the heal look) is shown to the owner.
- [ ] With a pinned random source, the granted base makes exactly 16 glints inside the R6 body bounds, one feet glow and one light, and every object and the light are gone by 1150 ms.
- [ ] No shimmer object's scale shrinks; no scale tween yoyos; the source scan passes over `shimmer.ts`.
- [ ] Every colour used is from the look; `HEAL_LOOK` is exactly `oxbloodText` / `vellum` / `oxblood`; the figure is never tinted.
- [ ] Objects follow the figure's drawn position; in-front and behind objects sort either side of the figure's depth.
- [ ] Two shimmers started together both play in full; `forget()` destroys every live object and light (fake-scene test, as the parry tests do).
- [ ] With the fx sheet missing, nothing plays and one line is logged.
- [ ] The gallery shows a playable heal shimmer card; the FS-1819Q enforcement test passes.
- [ ] Guideline: amended accent table with the FS-KZC92 amendment note, and a "Shimmers" section with every rule of R30. `heal` in `canvasPalette.ts` reads `oxbloodText`. CONTEXT.md defines the four terms.
- [ ] Existing effect tests pass unchanged; token-fence lint passes; no new dependencies; no `game-server/` diff.

## Blocked By

I-1819Q-2 (it creates `src/dev/gallery/effects.ts`, the gallery canvas and the enforcement test; it is itself blocked by I-1819Q-1, which writes `game-client/CONTEXT.md`).

## Spec Reference

FS-KZC92 §A R1–R4, §B R5–R12, §D R20–R28 (minus `fx_ring`), §E R29–R31, §F R32, §H R39 (heal card), §I R40–R41; User Stories 2–5, 11–14, 16–18, 20–26; Edge States (lights over the cap, manifest missing, figure not drawn yet, indoors).

## TDD Approach

- RED: a `shimmer.test.ts` case with a pinned random source and a fake scene: playing the heal shimmer makes 16 glints inside the body bounds, and none survives 1150 ms.
- GREEN: the granted base in `shimmer.ts` over the baked `fx_glint` / `fx_mote`; then follow, stacking, `forget()` and the missing-sheet case.
